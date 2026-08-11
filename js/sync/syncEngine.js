// Motore di Sync Cloud — Fase 6.
//
// Principio generale: invece di una tabella Postgres per ciascuno dei 25+ store IndexedDB
// (ricalcando uno per uno i campi di ognuno), il cloud specchia i dati in un'UNICA tabella
// generica (finsteady.sync_records: id, store, payload jsonb, ...), esattamente come domain/
// backup.js già fa in locale iterando STORE_DEFINITIONS senza conoscere i campi di ciascuno
// store. Vantaggio pratico: aggiungere un nuovo store in locale (come già successo più volte,
// vedi db-schema.js) non richiede ALCUNA migrazione lato Supabase.
//
// Schema dedicato "finsteady" (non il default "public" di Supabase, vedi supabase/schema.sql):
// il client viene creato in supabaseClient.js già con { db: { schema: SCHEMA_SYNC } }, quindi
// qui sotto .from()/.rpc() puntano lì automaticamente. L'UNICA eccezione è la sottoscrizione
// realtime (avviaRealtime): l'opzione 'schema' del canale postgres_changes non eredita la
// configurazione del client, va sempre indicata esplicitamente.
//
// Isolamento tra Profili locali: l'app supporta più Profili completamente separati (ciascuno
// con un proprio database IndexedDB fisico, vedi js/profili.js), ma un accesso Supabase è
// legato al browser, non al Profilo. Se lo stesso account Supabase restasse collegato mentre
// l'utente cambia Profilo locale, si rischierebbe di mescolare i dati di due Profili diversi
// nello stesso account cloud. Per questo ogni record sincronizzato porta anche
// 'profiloLocaleId': push, pull e sottoscrizione realtime sono sempre filtrati anche su questo
// campo, non solo sull'utente autenticato.
//
// CORREZIONE IMPORTANTE (v0.27-004): questo valore è il NOME del Profilo attivo, normalizzato
// (minuscolo, senza spazi ai lati) — NON l'id del Profilo. L'id (js/profili.js, generaId())
// viene generato in modo indipendente su ogni dispositivo alla primissima apertura dell'app: due
// installazioni con lo stesso Profilo "Predefinito" hanno due id locali diversi, quindi
// filtrare per id impediva strutturalmente la sincronizzazione tra dispositivi diversi (il
// motivo per cui non si vedevano dati sincronizzati, pur accedendo con lo stesso account). Il
// nome del Profilo è invece scelto dall'utente ed è quello che, in pratica, viene impostato
// uguale su ogni dispositivo che deve condividere gli stessi dati. Effetto collaterale da
// conoscere: se rinomini un Profilo già collegato al Sync, il nuovo nome è una partizione
// diversa — rinominalo allo stesso modo su tutti i dispositivi, altrimenti perderà il
// collegamento con i dati già sincronizzati finora.
//
// Store esclusi dal Sync (v1): 'allegati' — può contenere il contenuto di un file come stringa
// base64 direttamente nel record (vedi domain/allegati.js): sincronizzarlo genericamente
// appesantirebbe molto payload di rete e spazio su Supabase. Per ora gli Allegati restano solo
// locali, dispositivo per dispositivo. Possibile evoluzione futura: spostare 'contenuto' su
// Supabase Storage e sincronizzare solo i metadati — non implementato qui per non introdurre
// una dipendenza aggiuntiva (bucket, policy separate) in questa prima versione.
//
// Conflitti: mai risolti automaticamente (scelta esplicita dell'utente, confermata prima di
// implementare). Il rilevamento è server-side e atomico, tramite la funzione Postgres
// fp_sync_upsert (supabase/schema.sql): confronta il timestamp remoto attuale del record con
// l'ultimo timestamp remoto noto al client al momento in cui ha iniziato la modifica locale: se
// nel frattempo qualcun altro ha scritto quel record, l'invio viene rifiutato invece di
// sovrascrivere silenziosamente, e il record finisce nello store locale 'syncConflitti' in
// attesa di una scelta (vedi risolviConflitto).

import { dbGet, dbGetAll, dbPut, dbDelete, onScrittura } from '../storage.js';
import { supabase, SYNC_CONFIGURATO, SCHEMA_SYNC } from './supabaseClient.js';
import { utenteCorrente, onCambioAuth } from './auth.js';
import { ottieniProfiloAttivo } from '../profili.js';
import { STORE_DEFINITIONS } from '../db-schema.js';

// Store tecnici del sync stesso: non vanno mai messi in coda per essere sincronizzati.
const STORE_INTERNI_SYNC = new Set(['syncOutbox', 'syncMeta', 'syncConflitti']);
// Store esclusi dal Sync per scelta (vedi nota sopra).
const STORE_ESCLUSI_DAL_SYNC = new Set(['allegati']);
// Tutti gli store "di dominio" effettivamente sincronizzati.
const STORE_SINCRONIZZATI = new Set(
  STORE_DEFINITIONS.map((d) => d.nome).filter((nome) => !STORE_ESCLUSI_DAL_SYNC.has(nome))
);

let profiloLocaleId = null;
let canaleRealtime = null;
let annullaOnScrittura = null;
let annullaOnCambioAuth = null;
let flushInCorso = false;
let timerFlushProgrammato = null;
let motoreAvviato = false;

let stato = {
  configurato: SYNC_CONFIGURATO,
  autenticato: false,
  email: null,
  inCorso: false,
  ultimoSync: null,
  inCoda: 0,
  conflitti: 0,
  ultimoErrore: null
};
let ascoltatoriStato = [];

function aggiornaStato(parziale) {
  stato = { ...stato, ...parziale };
  ascoltatoriStato.slice().forEach((cb) => {
    try { cb(stato); } catch (err) { console.error('[sync] listener di stato fallito:', err); }
  });
}

export function ottieniStatoSync() {
  return stato;
}

// callback(stato) chiamato subito e a ogni cambiamento. Ritorna una funzione per annullare.
export function onCambioStatoSync(callback) {
  ascoltatoriStato.push(callback);
  callback(stato);
  return () => { ascoltatoriStato = ascoltatoriStato.filter((cb) => cb !== callback); };
}

async function aggiornaContatori() {
  const [outbox, conflitti] = await Promise.all([dbGetAll('syncOutbox'), dbGetAll('syncConflitti')]);
  aggiornaStato({ inCoda: outbox.length, conflitti: conflitti.length });
}

function chiaveDi(storeName, recordId) {
  return `${storeName}::${recordId}`;
}

// Vedi nota in cima al file: la partizione cloud è il nome del Profilo normalizzato, non l'id
// locale (che è diverso su ogni dispositivo per costruzione).
function normalizzaChiaveProfilo(nome) {
  return (nome || '').trim().toLowerCase();
}

// --- Accodamento modifiche locali (outbox) --------------------------------------------------

function alGancioScrittura(storeName, operazione, dato) {
  if (STORE_INTERNI_SYNC.has(storeName) || !STORE_SINCRONIZZATI.has(storeName)) return;
  const recordId = operazione === 'elimina' ? dato : dato?.id;
  if (!recordId) return;

  const voce = {
    chiave: chiaveDi(storeName, recordId),
    store: storeName,
    recordId,
    operazione,
    payload: operazione === 'elimina' ? null : dato,
    timestampLocale: new Date().toISOString()
  };
  dbPut('syncOutbox', voce, { senzaNotifica: true })
    .then(() => {
      aggiornaContatori();
      programmaFlush();
    })
    .catch((err) => console.error('[sync] impossibile accodare la modifica:', err));
}

function programmaFlush(ritardoMs = 800) {
  if (timerFlushProgrammato) clearTimeout(timerFlushProgrammato);
  timerFlushProgrammato = setTimeout(() => { flushOutbox(); }, ritardoMs);
}

// --- Invio (push) delle modifiche in coda ----------------------------------------------------

async function elaboraVoceOutbox(voce) {
  const metaEsistente = await dbGet('syncMeta', voce.chiave);
  const baseTimestamp = metaEsistente ? metaEsistente.aggiornatoRemoto : null;

  const { data, error } = await supabase.rpc('fp_sync_upsert', {
    p_id: voce.recordId,
    p_store: voce.store,
    p_profilo_locale_id: profiloLocaleId,
    p_payload: voce.operazione === 'elimina' ? {} : voce.payload,
    p_eliminato: voce.operazione === 'elimina',
    p_base_timestamp: baseTimestamp
  });

  if (error) {
    // Resta in coda: verrà ritentata al prossimo flush (es. al ritorno online).
    console.error(`[sync] invio fallito per ${voce.chiave}:`, error.message);
    throw error;
  }

  if (data.conflitto) {
    await dbDelete('syncOutbox', voce.chiave, { senzaNotifica: true });
    await dbPut('syncConflitti', {
      chiave: voce.chiave,
      store: voce.store,
      recordId: voce.recordId,
      operazioneLocale: voce.operazione,
      payloadLocale: voce.payload,
      payloadRemoto: data.record.payload,
      eliminatoRemoto: data.record.eliminato,
      aggiornatoRemoto: data.record.aggiornato_il
    }, { senzaNotifica: true });
    return;
  }

  await dbPut('syncMeta', { chiave: voce.chiave, aggiornatoRemoto: data.record.aggiornato_il }, { senzaNotifica: true });
  await dbDelete('syncOutbox', voce.chiave, { senzaNotifica: true });
}

export async function flushOutbox() {
  if (!SYNC_CONFIGURATO || flushInCorso) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const utente = await utenteCorrente();
  if (!utente || !profiloLocaleId) return;

  flushInCorso = true;
  aggiornaStato({ inCorso: true, ultimoErrore: null });
  try {
    const voci = await dbGetAll('syncOutbox');
    for (const voce of voci) {
      try {
        await elaboraVoceOutbox(voce);
      } catch (err) {
        aggiornaStato({ ultimoErrore: err.message });
        // Continua con le altre voci: un errore isolato (es. rete instabile a metà) non deve
        // bloccare l'intera coda.
      }
    }
  } finally {
    flushInCorso = false;
    await aggiornaContatori();
    aggiornaStato({ inCorso: false, ultimoSync: new Date().toISOString() });
  }
}

// --- Ricezione (pull) di modifiche remote ----------------------------------------------------

async function applicaRecordRemoto(record) {
  if (!record || record.profilo_locale_id !== profiloLocaleId) return;
  if (STORE_INTERNI_SYNC.has(record.store) || !STORE_SINCRONIZZATI.has(record.store)) return;

  const chiave = chiaveDi(record.store, record.id);
  const [voceOutbox, conflittoEsistente] = await Promise.all([
    dbGet('syncOutbox', chiave),
    dbGet('syncConflitti', chiave)
  ]);
  // Una modifica locale è già in coda (non ancora inviata) o già in conflitto per questo stesso
  // record: non sovrascrivere qui. Il prossimo invio confronterà comunque col timestamp remoto
  // più recente tramite fp_sync_upsert — l'eventuale conflitto emergerà lì, non va anticipato
  // silenziosamente sovrascrivendo il dato locale adesso.
  if (voceOutbox || conflittoEsistente) return;

  if (record.eliminato) {
    await dbDelete(record.store, record.id, { senzaNotifica: true }).catch(() => {});
  } else {
    await dbPut(record.store, record.payload, { senzaNotifica: true });
  }
  await dbPut('syncMeta', { chiave, aggiornatoRemoto: record.aggiornato_il }, { senzaNotifica: true });
  segnalaAggiornamentoVista(record.store);
}

let timerRiepilogoVista = null;
function segnalaAggiornamentoVista(storeName) {
  // Riepiloga più notifiche ravvicinate (es. un pull iniziale con decine di record) in un solo
  // ri-render della vista corrente, invece di uno per record.
  if (timerRiepilogoVista) clearTimeout(timerRiepilogoVista);
  timerRiepilogoVista = setTimeout(() => {
    if (typeof window !== 'undefined' && typeof window.aggiornaVistaCorrente === 'function') {
      window.aggiornaVistaCorrente();
    }
  }, 300);
  void storeName; // riservato per un'eventuale notifica mirata in futuro
}

async function pullIniziale() {
  const { data, error } = await supabase
    .from('sync_records')
    .select('*')
    .eq('profilo_locale_id', profiloLocaleId);
  if (error) {
    console.error('[sync] pull iniziale fallito:', error.message);
    aggiornaStato({ ultimoErrore: error.message });
    return;
  }
  for (const record of data) {
    await applicaRecordRemoto(record);
  }
  await aggiornaContatori();
}

function avviaRealtime() {
  if (canaleRealtime || !supabase) return;
  canaleRealtime = supabase
    .channel(`sync_records_${profiloLocaleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: SCHEMA_SYNC, table: 'sync_records', filter: `profilo_locale_id=eq.${profiloLocaleId}` },
      (payload) => {
        const record = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
        if (record) applicaRecordRemoto(record);
      }
    )
    .subscribe();
}

function fermaRealtime() {
  if (canaleRealtime && supabase) {
    supabase.removeChannel(canaleRealtime);
    canaleRealtime = null;
  }
}

// --- Risoluzione conflitti (sempre su scelta esplicita dell'utente) -------------------------

export async function elencoConflitti() {
  return dbGetAll('syncConflitti');
}

// scelta: 'locale' (rimanda la modifica locale, sovrascrivendo il remoto) | 'remoto' (scarta la
// modifica locale in sospeso, applica il valore remoto).
export async function risolviConflitto(chiave, scelta) {
  const conflitto = await dbGet('syncConflitti', chiave);
  if (!conflitto) return { risolto: true };
  const utente = await utenteCorrente();
  if (!utente) throw new Error('Devi essere autenticato per risolvere un conflitto.');

  if (scelta === 'remoto') {
    if (conflitto.eliminatoRemoto) {
      await dbDelete(conflitto.store, conflitto.recordId, { senzaNotifica: true }).catch(() => {});
    } else {
      await dbPut(conflitto.store, conflitto.payloadRemoto, { senzaNotifica: true });
    }
    await dbPut('syncMeta', { chiave, aggiornatoRemoto: conflitto.aggiornatoRemoto }, { senzaNotifica: true });
  } else if (scelta === 'locale') {
    const { data, error } = await supabase.rpc('fp_sync_upsert', {
      p_id: conflitto.recordId,
      p_store: conflitto.store,
      p_profilo_locale_id: profiloLocaleId,
      p_payload: conflitto.operazioneLocale === 'elimina' ? {} : conflitto.payloadLocale,
      p_eliminato: conflitto.operazioneLocale === 'elimina',
      p_base_timestamp: conflitto.aggiornatoRemoto
    });
    if (error) throw error;
    if (data.conflitto) {
      // Cambiato di nuovo nel frattempo: aggiorna il conflitto col nuovo remoto, l'utente dovrà
      // scegliere ancora.
      await dbPut('syncConflitti', {
        ...conflitto,
        payloadRemoto: data.record.payload,
        eliminatoRemoto: data.record.eliminato,
        aggiornatoRemoto: data.record.aggiornato_il
      }, { senzaNotifica: true });
      await aggiornaContatori();
      return { risolto: false };
    }
    await dbPut('syncMeta', { chiave, aggiornatoRemoto: data.record.aggiornato_il }, { senzaNotifica: true });
  } else {
    throw new Error(`Scelta di risoluzione conflitto non valida: ${scelta}`);
  }

  await dbDelete('syncConflitti', chiave, { senzaNotifica: true });
  await aggiornaContatori();
  return { risolto: true };
}

// --- Ciclo di vita del motore -----------------------------------------------------------------

// Chiamata una sola volta all'avvio dell'app (js/app.js), dopo l'inizializzazione dei Profili.
// Se il Sync non è configurato (js/sync/config.js vuoto) non fa nulla: l'app resta puramente
// locale, invariata.
export async function avviaMotoreSync() {
  if (!SYNC_CONFIGURATO || motoreAvviato) return;
  motoreAvviato = true;

  const profilo = await ottieniProfiloAttivo();
  profiloLocaleId = normalizzaChiaveProfilo(profilo.nome);

  annullaOnScrittura = onScrittura(alGancioScrittura);

  // onCambioAuth (supabase-js) chiama subito il callback una prima volta con lo stato di sessione
  // corrente (se già autenticato da un accesso precedente, o null altrimenti), quindi non serve
  // un controllo separato qui sotto: eviterebbe solo di duplicare pull/flush all'avvio.
  annullaOnCambioAuth = onCambioAuth(async (utente) => {
    aggiornaStato({ autenticato: Boolean(utente), email: utente?.email || null });
    if (utente) {
      await pullIniziale();
      avviaRealtime();
      await flushOutbox();
    } else {
      fermaRealtime();
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flushOutbox());
  }

  await aggiornaContatori();
}

export async function sincronizzaOra() {
  if (!SYNC_CONFIGURATO) return;
  const utente = await utenteCorrente();
  if (!utente) return;
  await pullIniziale();
  await flushOutbox();
}

// "Carica sul Cloud" (pulsante esplicito nella tab Sync): accoda TUTTI i record attualmente
// presenti in locale, non solo le modifiche fatte da quando il Sync è attivo. Serve per due
// casi che altrimenti resterebbero scoperti dalla sola sincronizzazione automatica in
// background: la primissima volta che colleghi un dispositivo che aveva già dati PRIMA di
// configurare il Sync (quei record non sono mai passati dall'hook onScrittura, quindi non
// sarebbero mai stati accodati), oppure per forzare un riallineamento se non ti fidi che la
// sincronizzazione automatica sia aggiornata. Sicura da rilanciare più volte: passa comunque
// dalla stessa funzione fp_sync_upsert con rilevamento conflitti, non sovrascrive alla cieca.
export async function caricaTuttoSulCloud() {
  if (!SYNC_CONFIGURATO) return;
  const utente = await utenteCorrente();
  if (!utente || !profiloLocaleId) throw new Error('Devi essere autenticato per caricare i dati sul Cloud.');

  aggiornaStato({ inCorso: true, ultimoErrore: null });
  try {
    for (const storeName of STORE_SINCRONIZZATI) {
      const record = await dbGetAll(storeName);
      for (const r of record) {
        if (!r || !r.id) continue;
        await dbPut('syncOutbox', {
          chiave: chiaveDi(storeName, r.id),
          store: storeName,
          recordId: r.id,
          operazione: 'scrivi',
          payload: r,
          timestampLocale: new Date().toISOString()
        }, { senzaNotifica: true });
      }
    }
    await aggiornaContatori();
    await flushOutbox();
  } finally {
    aggiornaStato({ inCorso: false });
  }
}

// "Scarica dal Cloud" (pulsante esplicito nella tab Sync): rilegge esplicitamente tutto quello
// che c'è sul Cloud per questo account e questo Profilo e lo applica in locale — stesso
// meccanismo del pull automatico all'accesso, richiamabile qui a comando per verificare o
// forzare un aggiornamento. Non tocca eventuali modifiche locali non ancora inviate (vedi
// applicaRecordRemoto: restano intatte, il prossimo invio le confronterà comunque col remoto).
export async function scaricaTuttoDalCloud() {
  if (!SYNC_CONFIGURATO) return;
  const utente = await utenteCorrente();
  if (!utente || !profiloLocaleId) throw new Error('Devi essere autenticato per scaricare i dati dal Cloud.');
  await pullIniziale();
}

// Chiamata dopo il logout (vedi viewImpostazioniSync.js): ferma la sottoscrizione realtime. La
// coda locale (syncOutbox) e i conflitti pendenti restano intatti: se l'utente rifà login, la
// sincronizzazione riparte da dove era rimasta, senza perdere nulla.
export function fermaMotoreSync() {
  fermaRealtime();
}
