// Motore di Sync Cloud — Fase 6.
//
// Modello "a istantanea completa", come le altre app dell'utente (Vacation Planner, Preventivi
// 3D): Carica sovrascrive il Cloud con i dati locali, Scarica sovrascrive i dati locali con
// quelli del Cloud. Nessun rilevamento conflitti per singolo record, nessuna scelta da fare
// dopo — chi vince lo decide solo l'azione scelta (Carica = locale, Scarica = Cloud).
//
// Automatico, come richiesto esplicitamente: ogni modifica locale programma un caricamento
// automatico (con qualche secondo di attesa, per non spammare la rete a ogni singolo tasto);
// all'apertura dell'app (o al login), se già autenticato, scarica automaticamente una volta sola
// per sessione — così si parte sempre allineati all'ultimo caricamento fatto da un altro
// dispositivo. I due pulsanti "Carica sul Cloud"/"Scarica dal Cloud" restano comunque disponibili
// per farlo a mano in qualunque momento, con conferma esplicita.
//
// Unico rischio da conoscere, inevitabile con un modello "vince tutto o niente" senza
// rilevamento conflitti: se lavori offline su un dispositivo e poi apri l'app su un altro
// dispositivo prima di aver potuto caricare dal primo, lo scaricamento automatico del secondo
// dispositivo non vede quelle modifiche (non sono ancora sul Cloud). Per uso personale su pochi
// dispositivi, quasi sempre online, è un rischio pratico molto basso.
//
// Isolamento tra Profili locali: l'app supporta più Profili completamente separati (ciascuno
// con un proprio database IndexedDB fisico, vedi js/profili.js), ma un accesso Supabase è
// legato al browser, non al Profilo. La riga su Supabase è identificata da (account, nome del
// Profilo attivo normalizzato) — non l'id del Profilo, generato in modo indipendente su ogni
// dispositivo. Se rinomini un Profilo già collegato al Sync, rinominalo allo stesso modo su
// tutti i dispositivi.

import { onScrittura } from '../storage.js';
import { supabase, SYNC_CONFIGURATO } from './supabaseClient.js';
import { utenteCorrente, onCambioAuth } from './auth.js';
import { ottieniProfiloAttivo } from '../profili.js';
import { esportaTutto, importaTutto } from '../domain/backup.js';

const RITARDO_AUTO_CARICA_MS = 4000;

let profiloLocaleId = null;
let motoreAvviato = false;
let operazioneInCorso = false;
let sospendiAutoCarica = false;
let timerAutoCarica = null;
let scaricamentoAutomaticoFatto = false;

let stato = {
  configurato: SYNC_CONFIGURATO,
  autenticato: false,
  email: null,
  inCorso: false,
  ultimoCaricamento: null,
  ultimoScaricamento: null,
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

function normalizzaChiaveProfilo(nome) {
  return (nome || '').trim().toLowerCase();
}

// Esegue fn con un mutex semplice: se un'operazione (automatica o manuale) è già in corso, le
// chiamate successive vengono ignorate silenziosamente invece di accodarsi o sovrapporsi — è il
// motivo per cui i pulsanti Carica/Scarica restano disabilitati mentre stato.inCorso è vero (li
// gestisce la UI, vedi viewImpostazioniSync.js), e per cui un caricamento automatico non parte
// mai a metà di uno scaricamento (o viceversa).
async function eseguiOperazione(fn) {
  if (operazioneInCorso) return;
  operazioneInCorso = true;
  aggiornaStato({ inCorso: true, ultimoErrore: null });
  try {
    await fn();
  } catch (err) {
    aggiornaStato({ ultimoErrore: err.message });
    throw err;
  } finally {
    operazioneInCorso = false;
    aggiornaStato({ inCorso: false });
  }
}

async function eseguiCaricamento() {
  const utente = await utenteCorrente();
  if (!utente) throw new Error('Devi accedere prima di caricare i dati sul Cloud.');
  const pacchetto = await esportaTutto();
  const adesso = new Date().toISOString();
  const { error } = await supabase
    .from('cloud_snapshot')
    .upsert(
      { user_id: utente.id, profilo_locale_id: profiloLocaleId, payload: pacchetto, aggiornato_il: adesso },
      { onConflict: 'user_id,profilo_locale_id' }
    );
  if (error) throw error;
  aggiornaStato({ ultimoCaricamento: adesso });
}

async function eseguiScaricamento() {
  const utente = await utenteCorrente();
  if (!utente) throw new Error('Devi accedere prima di scaricare i dati dal Cloud.');
  const { data, error } = await supabase
    .from('cloud_snapshot')
    .select('payload, aggiornato_il')
    .eq('profilo_locale_id', profiloLocaleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const profilo = await ottieniProfiloAttivo();
    throw new Error(`Nessun dato sul Cloud per il Profilo "${profilo.nome}". Usa prima "Carica sul Cloud" dal dispositivo che ha già i tuoi dati.`);
  }
  sospendiAutoCarica = true;
  if (timerAutoCarica) { clearTimeout(timerAutoCarica); timerAutoCarica = null; }
  try {
    await importaTutto(data.payload);
  } finally {
    sospendiAutoCarica = false;
  }
  aggiornaStato({ ultimoScaricamento: data.aggiornato_il });
  return data.aggiornato_il;
}

// "Carica sul Cloud" (pulsante, o automatico dopo una modifica locale): sovrascrive la riga del
// Cloud per questo account+Profilo con l'intero database locale. Nessuna domanda successiva.
export async function caricaSulCloud() {
  if (!SYNC_CONFIGURATO) throw new Error('Sync Cloud non configurato: vedi SETUP-SUPABASE.md.');
  if (!profiloLocaleId) throw new Error('Profilo locale non ancora pronto: riprova tra un istante.');
  return eseguiOperazione(eseguiCaricamento);
}

// "Scarica dal Cloud" (pulsante, o automatico all'apertura dell'app): sostituisce interamente i
// dati locali con quelli del Cloud per questo account+Profilo. Nessuna domanda successiva — il
// chiamante (viewImpostazioniSync.js) mostra la conferma PRIMA di invocarla, per l'azione
// manuale; quella automatica all'avvio non la mostra (vedi nota in cima al file).
export async function scaricaDalCloud() {
  if (!SYNC_CONFIGURATO) throw new Error('Sync Cloud non configurato: vedi SETUP-SUPABASE.md.');
  if (!profiloLocaleId) throw new Error('Profilo locale non ancora pronto: riprova tra un istante.');
  return eseguiOperazione(eseguiScaricamento);
}

function programmaCaricamentoAutomatico() {
  if (sospendiAutoCarica || !stato.autenticato) return;
  if (timerAutoCarica) clearTimeout(timerAutoCarica);
  timerAutoCarica = setTimeout(() => {
    timerAutoCarica = null;
    caricaSulCloud().catch((err) => console.error('[sync] caricamento automatico fallito:', err.message));
  }, RITARDO_AUTO_CARICA_MS);
}

// Chiamata una sola volta all'avvio dell'app (js/app.js), dopo l'inizializzazione dei Profili.
// Se il Sync non è configurato (js/sync/config.js vuoto) non fa nulla: l'app resta puramente
// locale, invariata.
export async function avviaMotoreSync() {
  if (!SYNC_CONFIGURATO || motoreAvviato) return;
  motoreAvviato = true;

  const profilo = await ottieniProfiloAttivo();
  profiloLocaleId = normalizzaChiaveProfilo(profilo.nome);

  onScrittura(() => programmaCaricamentoAutomatico());

  onCambioAuth(async (utente) => {
    aggiornaStato({ autenticato: Boolean(utente), email: utente?.email || null });
    // Una sola volta per sessione (non ad ogni evento di auth, es. refresh del token): allinea
    // questo dispositivo all'ultimo caricamento fatto altrove appena si apre l'app da autenticati.
    if (utente && !scaricamentoAutomaticoFatto) {
      scaricamentoAutomaticoFatto = true;
      scaricaDalCloud().catch((err) => console.error('[sync] scaricamento automatico fallito:', err.message));
    }
  });
}
