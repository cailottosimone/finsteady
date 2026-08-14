// Dominio: Rettifica — unico modo per correggere il saldo di un Conto, un Fondo o un Obiettivo
// dopo la loro creazione (arrotondamenti, interessi, competenze bancarie, correzione di un
// errore di inserimento). Decisione esplicita dell'utente: "tutto ciò che ha un saldo deve
// essere modificabile solo tramite movimenti/rettifiche, non a mano senza lasciare traccia" —
// lo stesso principio già applicato al Conto ora si estende a Fondo e Obiettivo.
//
// Evento storico immutabile: si corregge con uno Storno, mai con modifica o cancellazione.
// A differenza degli altri movimenti, la descrizione è OBBLIGATORIA: è l'unica cosa che dà
// senso a un numero che altrimenti apparirebbe "dal nulla".
//
// Compatibilità con dati precedenti (additiva, non distruttiva): le Rettifiche create prima
// di questa generalizzazione hanno un campo "contoId" invece di "tipoEntita"/"entitaId".
// elencoRettifiche le normalizza in lettura, senza mai riscrivere i record originali.

import { dbAdd, dbGet, dbGetAll, dbPut, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { ottieniConto, aggiornaConto } from './conti.js';
import { ottieniFondo, aggiornaFondo, verificaRiduzioneCoerente } from './fondi.js';
import { aggiornaObiettivo } from './obiettivi.js';
import { registraStorno, eliminaStorniPerMovimento } from './storni.js';

const STORE = 'rettifiche';
const TIPI_VALIDI = ['conto', 'fondo', 'obiettivo'];

function normalizza(rettifica) {
  if (rettifica.tipoEntita) return rettifica;
  // Record precedenti alla generalizzazione: erano sempre e solo su un Conto.
  return { ...rettifica, tipoEntita: 'conto', entitaId: rettifica.contoId };
}

// segno = +1 per applicare, -1 per stornare (movimento inverso).
async function applicaEffetto(rettifica, segno) {
  const delta = segno * rettifica.importo;

  if (rettifica.tipoEntita === 'conto') {
    const conto = await ottieniConto(rettifica.entitaId);
    if (!conto) throw new Error('Conto non trovato.');
    await aggiornaConto(rettifica.entitaId, { saldoReale: conto.saldoReale + delta });
    return;
  }

  if (rettifica.tipoEntita === 'fondo') {
    const fondo = await ottieniFondo(rettifica.entitaId);
    if (!fondo) throw new Error('Fondo non trovato.');
    if (delta < 0) await verificaRiduzioneCoerente(rettifica.entitaId, fondo.saldo + delta);
    await aggiornaFondo(rettifica.entitaId, { saldo: fondo.saldo + delta });
    return;
  }

  if (rettifica.tipoEntita === 'obiettivo') {
    const obiettivo = await dbGet('obiettivi', rettifica.entitaId);
    if (!obiettivo) throw new Error('Obiettivo non trovato.');
    const fondo = await ottieniFondo(obiettivo.fondoId);
    // Il saldo dell'Obiettivo è una quota del Fondo: la Rettifica deve muovere anche il Fondo
    // della stessa cifra, altrimenti si violerebbe l'unicità del denaro (§5.2).
    await aggiornaFondo(obiettivo.fondoId, { saldo: fondo.saldo + delta });
    await aggiornaObiettivo(rettifica.entitaId, { saldoAccumulato: obiettivo.saldoAccumulato + delta });
  }
}

export async function creaRettifica(dati) {
  if (!TIPI_VALIDI.includes(dati.tipoEntita)) throw new Error('Seleziona su cosa applicare la Rettifica (Conto, Fondo o Obiettivo).');
  if (!dati.entitaId) throw new Error('Seleziona l\'elemento da rettificare.');
  const importo = Number(dati.importo);
  if (!importo) throw new Error('L\'importo della Rettifica non può essere zero.');
  if (!dati.descrizione || !dati.descrizione.trim()) {
    throw new Error('La descrizione è obbligatoria per una Rettifica: spiega perché stai correggendo il saldo.');
  }

  if (dati.tipoEntita === 'fondo' && importo < 0) {
    const fondo = await ottieniFondo(dati.entitaId);
    if (!fondo) throw new Error('Il Fondo selezionato non esiste.');
    if (fondo.saldo + importo < 0) throw new Error(`Il Fondo ha solo ${fondo.saldo} €: non può scendere sotto zero.`);
    await verificaRiduzioneCoerente(dati.entitaId, fondo.saldo + importo);
  }
  if (dati.tipoEntita === 'obiettivo' && importo < 0) {
    const obiettivo = await dbGet('obiettivi', dati.entitaId);
    if (!obiettivo) throw new Error('L\'Obiettivo selezionato non esiste.');
    if (obiettivo.saldoAccumulato + importo < 0) throw new Error(`L'Obiettivo ha solo ${obiettivo.saldoAccumulato} €: non può scendere sotto zero.`);
  }
  if (dati.tipoEntita === 'conto') {
    const conto = await ottieniConto(dati.entitaId);
    if (!conto) throw new Error('Il Conto selezionato non esiste.');
    if (conto.tipologia === 'spesa' && Math.abs(conto.saldoReale + importo) > 0.005) {
      throw new Error('Un Conto di tipo "Spesa" non può avere un saldo diverso da zero: questa Rettifica lo porterebbe fuori da questo vincolo.');
    }
  }

  const now = oggiISO();
  const rettifica = {
    id: generaId(),
    data: dati.data || now,
    tipoEntita: dati.tipoEntita,
    entitaId: dati.entitaId,
    importo, // positivo = aumenta il saldo, negativo = lo riduce
    descrizione: dati.descrizione.trim(),
    stornata: false,
    dataCreazione: now
  };

  await applicaEffetto(rettifica, +1);
  await dbAdd(STORE, rettifica);
  return rettifica;
}

export async function stornaRettifica(id, descrizioneStorno) {
  const grezza = await dbGet(STORE, id);
  if (!grezza) throw new Error('Rettifica non trovata.');
  const rettifica = normalizza(grezza);
  if (rettifica.stornata) throw new Error('Questa Rettifica è già stata stornata.');

  await applicaEffetto(rettifica, -1);
  await dbPut(STORE, { ...grezza, stornata: true });
  return registraStorno({ tipoMovimento: 'rettifica', movimentoId: id, descrizione: descrizioneStorno });
}

// Eliminazione DIRETTA (senza storno, senza annullare effetti). Solo per pulizia di dati rotti.
export async function eliminaRettifica(id) {
  await eliminaStorniPerMovimento(id);
  await dbDelete(STORE, id);
}

export async function elencoRettifiche() {
  const tutte = await dbGetAll(STORE);
  return tutte.map(normalizza).sort((a, b) => new Date(b.data) - new Date(a.data));
}
