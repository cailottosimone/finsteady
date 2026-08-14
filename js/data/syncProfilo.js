// js/data/syncProfilo.js — orchestratore del Cloud Sync per il Profilo ATTIVO. Stessa logica di
// sync di preventivi3d (outbox + push periodico + pull periodico, conflitti risolti last-write-
// wins su updatedAt) applicata a UN Profilo alla volta: dato che ogni Profilo è un database
// IndexedDB fisicamente separato (vedi js/profili.js) e storage.js si connette a UN solo
// database per sessione, questo motore sincronizza sempre e solo il Profilo che è attivo ora.
// Per collegare/scaricare un ALTRO Profilo (non quello attivo) vedi invece
// js/domain/cloudProfili.js.
//
// Non tocca mai direttamente Supabase (passa da data/cloud.js) né mai IndexedDB con query
// dirette (passa da storage.js).

import {
  dbGet, dbGetAll, dbPutGrezzo, outboxList, outboxCount, outboxRimuovi, outboxAccodaTutto,
  syncMetaOttieni, syncMetaImposta
} from '../storage.js';
import { SYNCABLE_STORES } from './config.js';
import { pushRecord, pullChanges, upsertProfiloCloud, elencoProfiliCloud } from './cloud.js';
import { getCurrentUser, onAuthChange, initAuth } from './auth.js';
import { ottieniProfiloAttivo } from '../profili.js';
import { generaId } from '../utils/uuid.js';

const PUSH_INTERVAL_MS = 5000; // drena l'outbox quando online
const PULL_INTERVAL_MS = 60000; // controlla novità dal cloud

const listeners = new Set();
export const state = {
  status: 'offline', // 'offline' | 'disconnesso' | 'da_collegare' | 'syncing' | 'idle' | 'errore'
  pendingCount: 0,
  lastError: null,
  lastSyncedAt: null
};

function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function onSyncStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function aggiornaConteggioPendenti() {
  setState({ pendingCount: await outboxCount() });
}

/* ---------------------------------------------------------------------- */
/* Push: svuota l'outbox verso il cloud                                    */
/* ---------------------------------------------------------------------- */

async function svuotaOutbox(cloudId) {
  const pendenti = await outboxList();
  if (!pendenti.length) return;

  for (const voce of pendenti) {
    const record = await dbGet(voce.store, voce.recordId, true); // includiCancellati: anche i tombstone vanno inviati
    if (!record) {
      await outboxRimuovi(voce.id);
      continue;
    }
    const { _syncUpdatedAt, ...datiDaInviare } = record;
    const ok = await pushRecord(cloudId, voce.store, voce.recordId, datiDaInviare);
    if (ok) await outboxRimuovi(voce.id);
    // se fallisce, la voce resta in coda e si ritenta al giro successivo
  }
  await aggiornaConteggioPendenti();

  // Aggiorna il registro leggero "Profili disponibili sul cloud" con il nome corrente e un
  // conteggio approssimativo: best-effort, un eventuale fallimento non blocca il resto.
  try {
    const profiloAttivo = await ottieniProfiloAttivo();
    const numeroRecord = (await Promise.all(SYNCABLE_STORES.map((s) => dbGetAll(s)))).reduce((tot, arr) => tot + arr.length, 0);
    await upsertProfiloCloud(cloudId, profiloAttivo.nome, numeroRecord);
  } catch { /* non essenziale */ }
}

/* ---------------------------------------------------------------------- */
/* Pull: applica le novità dal cloud, con risoluzione dei conflitti (LWW)  */
/* ---------------------------------------------------------------------- */

/** Un record remoto vince su quello locale solo se: (a) non esiste ancora in locale, oppure
 * (b) è più recente di quello locale E quel record non ha una modifica locale ancora in coda
 * verso il cloud (altrimenti si rischierebbe di sovrascrivere una modifica fatta offline con
 * una versione più vecchia arrivata da un altro dispositivo). Il confronto usa "_syncUpdatedAt",
 * un campo tecnico iniettato da questo motore (non un concetto del FDD): l'ultimo valore
 * "updatedAt" autorevole (generato dal server Supabase) noto per quel record. */
async function applicaRemoto(riga, chiaviPendenti) {
  const chiave = `${riga.store}::${riga.recordId}`;
  if (chiaviPendenti.has(chiave)) return; // modifica locale non ancora inviata: vince lei, per ora

  const locale = await dbGet(riga.store, riga.recordId, true);
  if (!locale || !locale._syncUpdatedAt || new Date(riga.updatedAt) > new Date(locale._syncUpdatedAt)) {
    await dbPutGrezzo(riga.store, { ...riga.dati, _syncUpdatedAt: riga.updatedAt });
  }
}

async function scaricaNovita(cloudId) {
  const meta = await syncMetaOttieni();
  const chiaviPendenti = new Set((await outboxList()).map((v) => v.id));
  let piuRecente = meta.lastPulledAt;

  const novita = await pullChanges(cloudId, meta.lastPulledAt);
  if (!novita) return; // cloud non raggiungibile ora: si riprova al prossimo giro
  for (const riga of novita) {
    await applicaRemoto(riga, chiaviPendenti);
    if (!piuRecente || riga.updatedAt > piuRecente) piuRecente = riga.updatedAt;
  }
  await syncMetaImposta({ lastPulledAt: piuRecente });
}

/* ---------------------------------------------------------------------- */
/* Ciclo di sincronizzazione                                               */
/* ---------------------------------------------------------------------- */

let running = false;
async function eseguiCiclo() {
  if (running || !navigator.onLine) return;
  const user = getCurrentUser();
  if (!user) {
    setState({ status: 'disconnesso' });
    return;
  }
  const meta = await syncMetaOttieni();
  if (meta.linkedUserId !== user.id || !meta.cloudId) {
    // Loggato ma il Profilo attivo non è (ancora) collegato al cloud, o era collegato a un
    // account diverso: non sincronizzare automaticamente, la UI deve chiedere esplicitamente
    // come collegarlo (vedi collegaSpingendoLocale/collegaScaricandoDaCloud).
    setState({ status: 'da_collegare' });
    return;
  }
  running = true;
  setState({ status: 'syncing', lastError: null });
  try {
    await svuotaOutbox(meta.cloudId);
    await scaricaNovita(meta.cloudId);
    setState({ status: 'idle', lastSyncedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Cloud Sync: ciclo fallito:', err);
    setState({ status: 'errore', lastError: err.message || String(err) });
  } finally {
    running = false;
    await aggiornaConteggioPendenti();
  }
}

/* ---------------------------------------------------------------------- */
/* Collegamento del Profilo attivo (decisione esplicita, una tantum)       */
/* ---------------------------------------------------------------------- */

export async function ilProfiloAttivoDeveEssereCollegato() {
  const user = getCurrentUser();
  if (!user) return false;
  const meta = await syncMetaOttieni();
  return meta.linkedUserId !== user.id || !meta.cloudId;
}

/** Collega il Profilo attivo spingendo sul cloud tutto ciò che ha già in locale, come un
 * Profilo cloud NUOVO. */
export async function collegaSpingendoLocale() {
  const user = getCurrentUser();
  if (!user) throw new Error('Devi essere autenticato al cloud.');
  const cloudId = generaId();
  await outboxAccodaTutto();
  await syncMetaImposta({ linkedUserId: user.id, cloudId, lastPulledAt: null });
  await eseguiCiclo();
  return cloudId;
}

/** Collega il Profilo attivo scaricando un Profilo GIÀ presente sul cloud (scelto dalla lista
 * di elencoProfiliCloudDisponibili). Il Profilo attivo locale deve essere "vuoto"/dedicato a
 * questo scopo: la UI lo chiarisce prima di procedere. */
export async function collegaScaricandoDaCloud(cloudId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Devi essere autenticato al cloud.');
  await syncMetaImposta({ linkedUserId: user.id, cloudId, lastPulledAt: null });
  await eseguiCiclo();
}

export async function elencoProfiliCloudDisponibili() {
  return elencoProfiliCloud();
}

/* ---------------------------------------------------------------------- */
/* Avvio                                                                   */
/* ---------------------------------------------------------------------- */

let pushTimer = null;
let pullTimer = null;

function avviaCicli() {
  fermaCicli();
  pushTimer = setInterval(() => eseguiCiclo(), PUSH_INTERVAL_MS);
  pullTimer = setInterval(() => eseguiCiclo(), PULL_INTERVAL_MS);
}

function fermaCicli() {
  if (pushTimer) clearInterval(pushTimer);
  if (pullTimer) clearInterval(pullTimer);
  pushTimer = null;
  pullTimer = null;
}

/** Va chiamata una volta all'avvio dell'app (dopo che il Profilo attivo è noto). Non richiede
 * login: se l'utente non si collega mai al cloud, l'app si comporta esattamente come prima. */
export async function initSyncProfilo() {
  setState({ status: navigator.onLine ? 'disconnesso' : 'offline' });
  await aggiornaConteggioPendenti();

  window.addEventListener('online', () => eseguiCiclo());
  window.addEventListener('offline', () => setState({ status: 'offline' }));

  await initAuth();
  onAuthChange(() => eseguiCiclo());

  avviaCicli();
  eseguiCiclo();
}
