// Dominio: Piano — rappresenta uno SCENARIO FINANZIARIO: una strategia di distribuzione delle
// entrate future (§2.8 / §5.13 FDD), non un elenco di movimenti. Non contiene denaro, non
// modifica saldi, non sostituisce Budget/Fondi/Obiettivi (che restano gli elementi permanenti
// del modello): descrive solo COME le entrate future dovranno essere allocate.
//
// Si possono creare più Scenari (es. "Piano Base", "Piano Nuovo Lavoro", "Piano Simulazione").
// Ognuno può essere usato in qualsiasi momento sia per registrare Entrate reali sia solo per
// simulare. "attivo" resta come preferenza di default (preselezionato nei menu), ma NON è più
// un vincolo esclusivo: ogni Piano è sempre utilizzabile, la scelta è sempre esplicita
// dell'utente al momento dell'uso (Registra Entrata, Distribuisci, Ridistribuisci...).

import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete, dbGetAllByIndex } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { calcolaDatiObiettivo } from '../engine/obiettivoCalc.js';

const STORE = 'piano';
const STORE_VOCI = 'pianoVoci';

export async function creaPiano(dati) {
  if (!dati.nome || !dati.nome.trim()) {
    throw new Error('Il nome del Piano è obbligatorio.');
  }
  const now = oggiISO();
  const piano = {
    id: generaId(),
    nome: dati.nome.trim(),
    attivo: false,
    bloccato: false,
    importoEntrataSimulata: null,
    dataCreazione: now,
    dataModifica: now
  };
  await dbAdd(STORE, piano);
  return piano;
}

export async function aggiornaPiano(id, modifiche) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Piano non trovato.');
  if (esistente.bloccato) throw new Error('Questo Piano è bloccato: sbloccalo prima di modificarlo.');
  const aggiornato = { ...esistente, ...modifiche, id: esistente.id, dataModifica: oggiISO() };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// Blocca/sblocca un Piano: da bloccato, nome e Voci non sono più modificabili (né si possono
// aggiungere/eliminare Voci) finché non lo si sblocca di nuovo — un solo tasto per evitare
// modifiche involontarie a una strategia già definita. L'USO del Piano resta sempre libero
// anche da bloccato (attivarlo, usarlo in Registra Entrata/Distribuisci/Ridistribuisci,
// duplicarlo, simulare un'entrata): il blocco impedisce solo la modifica della sua struttura.
// Bypassa volutamente il controllo di aggiornaPiano: sbloccare deve essere sempre possibile.
export async function impostaBloccoPiano(id, bloccato) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Piano non trovato.');
  const aggiornato = { ...esistente, bloccato: !!bloccato, dataModifica: oggiISO() };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// L'entrata simulata è un valore di lavoro per esplorare "cosa succederebbe con X euro", non fa
// parte della strategia vera e propria (Voci): resta modificabile anche a Piano bloccato, e
// serve anche come importo di default proposto quando si crea un Prospetto basato su questo
// Piano (vedi mostraFormProspetto in viewProspetti.js).
export async function impostaEntrataSimulataPiano(id, importo) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Piano non trovato.');
  const valore = Number(importo);
  const aggiornato = { ...esistente, importoEntrataSimulata: Number.isFinite(valore) ? valore : null, dataModifica: oggiISO() };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// Duplica un Piano e tutte le sue Voci: 100% nuove entità, nessun collegamento con l'originale
// (nessuna delle due copie influenza l'altra da questo momento in poi). La copia nasce sempre
// sbloccata e non attiva, così da poter essere modificata subito.
export async function duplicaPiano(id) {
  const originale = await dbGet(STORE, id);
  if (!originale) throw new Error('Piano non trovato.');
  const now = oggiISO();
  const copia = {
    ...originale,
    id: generaId(),
    nome: `Copia di ${originale.nome}`,
    attivo: false,
    bloccato: false,
    dataCreazione: now,
    dataModifica: now
  };
  await dbAdd(STORE, copia);

  const vociOriginali = await elencoVociPerPiano(id);
  const vociCopiate = [];
  for (const v of vociOriginali) {
    const nuovaVoce = { ...v, id: generaId(), pianoId: copia.id };
    await dbAdd(STORE_VOCI, nuovaVoce);
    vociCopiate.push(nuovaVoce);
  }
  return { copia, vociCopiate };
}

// "attivo" torna ad avere un significato vincolante, ma solo per i Budget — decisione esplicita
// dell'utente: "l'obiettivo è che i budget utilizzati dal calcolo mesi emergenza siano gli
// stessi del piano attivo... quando cambio piano, che usa altri budget, non voglio stare a
// modificarli a mano". Attivare un Piano attiva i Budget referenziati dalle sue Voci
// (tipoDestinazione:'budget') e disattiva TUTTI gli altri Budget, compresi quelli non
// collegati a nessun Piano (restano "scollegati", solo un'etichetta informativa in UI — vedi
// viewBudget.js — non cambia se possono avere un ciclo proprio: "Apri Nuovo Ciclo" continua a
// guardare solo il loro stato attivo/inattivo, quale che sia la causa).
export async function impostaPianoAttivo(id) {
  const tutti = await dbGetAll(STORE);
  await Promise.all(tutti.map((p) => dbPut(STORE, { ...p, attivo: p.id === id, dataModifica: oggiISO() })));

  const [voci, tuttiIBudget] = await Promise.all([elencoVociPerPiano(id), dbGetAll('budget')]);
  const budgetIdsDelPiano = new Set(voci.filter((v) => v.tipoDestinazione === 'budget').map((v) => v.destinazioneId));
  await Promise.all(tuttiIBudget.map((b) => {
    const dovrebbeEssereAttivo = budgetIdsDelPiano.has(b.id);
    const statoAttuale = !b.stato || b.stato === 'attivo';
    if (dovrebbeEssereAttivo === statoAttuale) return null;
    return dbPut('budget', { ...b, stato: dovrebbeEssereAttivo ? 'attivo' : 'inattivo' });
  }));
}

export async function ottieniPianoAttivo() {
  const tutti = await dbGetAll(STORE);
  return tutti.find((p) => p.attivo) || null;
}

// Il Piano e le sue Voci sono un'unica unità concettuale (una configurazione, non denaro reale):
// eliminare il Piano elimina anche le sue Voci, senza richiedere conferme separate per ciascuna,
// perché una Voce non ha significato né esistenza indipendente dal proprio Piano.
export async function eliminaPiano(id) {
  const piano = await dbGet(STORE, id);
  if (piano?.bloccato) throw new Error('Questo Piano è bloccato: sbloccalo prima di eliminarlo.');
  const voci = await dbGetAllByIndex(STORE_VOCI, 'pianoId', id);
  await Promise.all(voci.map((v) => dbDelete(STORE_VOCI, v.id)));
  await dbDelete(STORE, id);
}

export async function elencoPiani() {
  return dbGetAll(STORE);
}

// Quali Budget sono referenziati da almeno una Voce di QUALUNQUE Piano (non solo quello
// attivo) — un Budget assente da questo elenco è "scollegato da ogni Piano": può restare
// attivo o inattivo a prescindere (decisione esplicita dell'utente: un Budget scollegato,
// magari vecchio, può comunque servire), ma va reso evidente in UI, distinto da un Budget
// inattivo solo perché appartiene a un Piano diverso da quello attivo.
export async function elencoBudgetIdsCollegati() {
  const [tuttiIPiani, tutteLeVoci] = await Promise.all([dbGetAll(STORE), dbGetAll(STORE_VOCI)]);
  const idPiani = new Set(tuttiIPiani.map((p) => p.id));
  const idBudget = new Set(
    tutteLeVoci
      .filter((v) => v.tipoDestinazione === 'budget' && idPiani.has(v.pianoId))
      .map((v) => v.destinazioneId)
  );
  return idBudget;
}

// --- Voci del Piano ---
//
// Una Voce può essere collegata (collegamentoTipo/collegamentoId) a un Budget o un Obiettivo
// d'origine, tramite "Collega Movimenti" — ma il collegamento è solo un riferimento logico per
// tracciabilità: dopo la creazione, la Voce è un oggetto completamente indipendente. Modificarla
// non tocca in alcun modo il Budget/Obiettivo originale, e viceversa (§"Principio progettuale":
// "i dati permanenti non devono essere duplicati o modificati dai Piani").

export async function creaVocePiano(dati) {
  if (!dati.pianoId) throw new Error('La Voce deve appartenere ad un Piano.');
  const piano = await dbGet(STORE, dati.pianoId);
  if (!piano) throw new Error('Piano non trovato.');
  if (piano.bloccato) throw new Error('Questo Piano è bloccato: sbloccalo prima di aggiungere Voci.');
  if (!['fondo', 'budget', 'obiettivo', 'conto'].includes(dati.tipoDestinazione)) {
    throw new Error('Tipo di destinazione della Voce non valido.');
  }
  if (!dati.destinazioneId) throw new Error('Seleziona una destinazione per la Voce.');
  if (!['fisso', 'percentuale'].includes(dati.modalitaImporto)) {
    throw new Error('Modalità importo non valida.');
  }
  const nomeStore = dati.tipoDestinazione === 'fondo' ? 'fondi'
    : dati.tipoDestinazione === 'budget' ? 'budget'
    : dati.tipoDestinazione === 'conto' ? 'conti' : 'obiettivi';
  const destinazione = await dbGet(nomeStore, dati.destinazioneId);
  if (!destinazione) throw new Error('La destinazione selezionata non esiste.');

  const voce = {
    id: generaId(),
    pianoId: dati.pianoId,
    tipoDestinazione: dati.tipoDestinazione,
    destinazioneId: dati.destinazioneId,
    modalitaImporto: dati.modalitaImporto,
    valore: Number(dati.valore) || 0,
    priorita: Number(dati.priorita) || 0,
    note: dati.note ? dati.note.trim() : '',
    collegamentoTipo: dati.collegamentoTipo || null,
    collegamentoId: dati.collegamentoId || null
  };
  await dbAdd(STORE_VOCI, voce);
  return voce;
}

export async function aggiornaVocePiano(id, modifiche) {
  const esistente = await dbGet(STORE_VOCI, id);
  if (!esistente) throw new Error('Voce del Piano non trovata.');
  const piano = await dbGet(STORE, esistente.pianoId);
  if (piano?.bloccato) throw new Error('Questo Piano è bloccato: sbloccalo prima di modificarne le Voci.');
  const aggiornata = { ...esistente, ...modifiche, id: esistente.id };
  await dbPut(STORE_VOCI, aggiornata);
  return aggiornata;
}

export async function eliminaVocePiano(id) {
  const esistente = await dbGet(STORE_VOCI, id);
  if (esistente) {
    const piano = await dbGet(STORE, esistente.pianoId);
    if (piano?.bloccato) throw new Error('Questo Piano è bloccato: sbloccalo prima di eliminarne le Voci.');
  }
  await dbDelete(STORE_VOCI, id);
}

export async function elencoVociPerPiano(pianoId) {
  const voci = await dbGetAllByIndex(STORE_VOCI, 'pianoId', pianoId);
  return voci.sort((a, b) => (a.priorita || 0) - (b.priorita || 0));
}

// "Collega Movimenti": crea automaticamente una Voce di Piano per ciascun Budget/Fondo/Obiettivo
// selezionato, copiandone nome (implicito, tramite destinazioneId) e importo previsto — per il
// Budget l'importo assegnato di default, per l'Obiettivo il suo importo mensile consigliato
// (calcolato dinamicamente, salvo che l'utente lo abbia sovrascritto dividendo manualmente
// l'importo di un Fondo tra i suoi Obiettivi), per un Fondo collegato direttamente (senza
// dividerlo tra i suoi Obiettivi) l'importo indicato esplicitamente dall'utente. Il collegamento
// è solo un riferimento logico: le Voci create restano poi completamente indipendenti e
// modificabili, senza mai alterare il Budget/Fondo/Obiettivo d'origine.
//
// elementi: [{ tipo: 'budget' | 'fondo' | 'obiettivo', id, valore? }]
// `valore` è obbligatorio per 'fondo' (nessun importo di default sensato per un Fondo intero) ed
// è opzionale per 'obiettivo' (se assente, si ricalcola l'importo mensile consigliato; se
// presente, sovrascrive quel calcolo — usato quando l'importo di un Fondo viene diviso tra più
// dei suoi Obiettivi anziché collegato per intero).
export async function collegaMovimenti(pianoId, elementi) {
  const piano = await dbGet(STORE, pianoId);
  if (piano?.bloccato) throw new Error('Questo Piano è bloccato: sbloccalo prima di collegare movimenti.');
  const vociCreate = [];
  for (const el of elementi) {
    if (el.tipo === 'budget') {
      const budget = await dbGet('budget', el.id);
      if (!budget) continue;
      const voce = await creaVocePiano({
        pianoId,
        tipoDestinazione: 'budget',
        destinazioneId: budget.id,
        modalitaImporto: 'fisso',
        valore: budget.importoAssegnatoDefault,
        priorita: 0,
        collegamentoTipo: 'budget',
        collegamentoId: budget.id
      });
      vociCreate.push(voce);
    } else if (el.tipo === 'obiettivo') {
      const obiettivo = await dbGet('obiettivi', el.id);
      if (!obiettivo) continue;
      const valore = el.valore != null
        ? arrotonda(Number(el.valore))
        : calcolaDatiObiettivo(obiettivo).importoMensileConsigliato;
      const voce = await creaVocePiano({
        pianoId,
        tipoDestinazione: 'obiettivo',
        destinazioneId: obiettivo.id,
        modalitaImporto: 'fisso',
        valore,
        priorita: 0,
        collegamentoTipo: 'obiettivo',
        collegamentoId: obiettivo.id
      });
      vociCreate.push(voce);
    } else if (el.tipo === 'fondo') {
      const fondo = await dbGet('fondi', el.id);
      if (!fondo) continue;
      const voce = await creaVocePiano({
        pianoId,
        tipoDestinazione: 'fondo',
        destinazioneId: fondo.id,
        modalitaImporto: 'fisso',
        valore: arrotonda(Number(el.valore)) || 0,
        priorita: 0,
        collegamentoTipo: 'fondo',
        collegamentoId: fondo.id
      });
      vociCreate.push(voce);
    }
  }
  return vociCreate;
}

function arrotonda(v) {
  const a = Math.round(v * 100) / 100;
  return a === 0 ? 0 : a;
}
