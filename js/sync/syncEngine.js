// Motore di Sync Cloud — Fase 6, versione semplificata.
//
// Modello volutamente semplice, "a istantanea completa", esattamente come le altre app
// dell'utente (Vacation Planner, Preventivi 3D): DUE azioni esplicite, senza sincronizzazione
// automatica in background, senza rilevamento conflitti, senza scelte successive.
//
// - Carica sul Cloud: esporta l'intero database del Profilo attivo (stesso identico formato del
//   Backup locale, domain/backup.js → esportaTutto()) e lo salva in un'UNICA riga su Supabase,
//   sovrascrivendo quella precedente per questo account+Profilo. Fine, nessun'altra domanda.
// - Scarica dal Cloud: legge quella riga e la applica in locale con domain/backup.js →
//   importaTutto() — la stessa funzione già usata per importare un file di Backup locale, quindi
//   sostituisce interamente i dati locali. Fine, nessun'altra domanda.
//
// Chi vince in caso di dati diversi tra locale e Cloud lo decide solo l'azione scelta
// dall'utente (Carica = vince il locale, Scarica = vince il Cloud): nessun confronto automatico
// di timestamp, nessuna fusione parziale, nessuna coda. Più semplice, più prevedibile, più
// facile da verificare che abbia funzionato.
//
// Isolamento tra Profili locali: l'app supporta più Profili completamente separati (ciascuno
// con un proprio database IndexedDB fisico, vedi js/profili.js), ma un accesso Supabase è
// legato al browser, non al Profilo. La riga su Supabase è quindi identificata da
// (account, nome del Profilo attivo normalizzato) — non l'id del Profilo, che è generato in
// modo indipendente su ogni dispositivo e quindi diverso anche per lo "stesso" Profilo su
// macchine diverse. Se rinomini un Profilo già collegato al Sync, il nuovo nome è una
// partizione diversa: rinominalo allo stesso modo su tutti i dispositivi.

import { supabase, SYNC_CONFIGURATO } from './supabaseClient.js';
import { utenteCorrente, onCambioAuth } from './auth.js';
import { ottieniProfiloAttivo } from '../profili.js';
import { esportaTutto, importaTutto } from '../domain/backup.js';

let profiloLocaleId = null;
let motoreAvviato = false;

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

function richiediUtenteEProfilo() {
  if (!SYNC_CONFIGURATO) throw new Error('Sync Cloud non configurato: vedi SETUP-SUPABASE.md.');
  if (!profiloLocaleId) throw new Error('Profilo locale non ancora pronto: riprova tra un istante.');
}

// Chiamata una sola volta all'avvio dell'app (js/app.js), dopo l'inizializzazione dei Profili.
// Se il Sync non è configurato (js/sync/config.js vuoto) non fa nulla: l'app resta puramente
// locale, invariata. Non avvia alcuna sincronizzazione automatica: si limita a tenere lo stato
// (autenticato o no) aggiornato per la tab Sync e per il badge in Dashboard.
export async function avviaMotoreSync() {
  if (!SYNC_CONFIGURATO || motoreAvviato) return;
  motoreAvviato = true;

  const profilo = await ottieniProfiloAttivo();
  profiloLocaleId = normalizzaChiaveProfilo(profilo.nome);

  onCambioAuth((utente) => {
    aggiornaStato({ autenticato: Boolean(utente), email: utente?.email || null });
  });
}

// "Carica sul Cloud": sovrascrive la riga del Cloud per questo account+Profilo con l'intero
// database locale. Nessuna domanda successiva: l'utente ha scelto, il locale vince.
export async function caricaSulCloud() {
  richiediUtenteEProfilo();
  const utente = await utenteCorrente();
  if (!utente) throw new Error('Devi accedere prima di caricare i dati sul Cloud.');

  aggiornaStato({ inCorso: true, ultimoErrore: null });
  try {
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
  } catch (err) {
    aggiornaStato({ ultimoErrore: err.message });
    throw err;
  } finally {
    aggiornaStato({ inCorso: false });
  }
}

// "Scarica dal Cloud": legge la riga del Cloud per questo account+Profilo e sostituisce
// interamente i dati locali (stessa funzione usata per importare un Backup locale). Nessuna
// domanda successiva: l'utente ha scelto, il Cloud vince. Il chiamante (viewImpostazioniSync.js)
// mostra la conferma PRIMA di invocare questa funzione, sullo stesso modello già usato per
// l'import di un Backup locale.
export async function scaricaDalCloud() {
  richiediUtenteEProfilo();
  const utente = await utenteCorrente();
  if (!utente) throw new Error('Devi accedere prima di scaricare i dati dal Cloud.');

  aggiornaStato({ inCorso: true, ultimoErrore: null });
  try {
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
    await importaTutto(data.payload);
    aggiornaStato({ ultimoScaricamento: data.aggiornato_il });
    return data.aggiornato_il;
  } catch (err) {
    aggiornaStato({ ultimoErrore: err.message });
    throw err;
  } finally {
    aggiornaStato({ inCorso: false });
  }
}
