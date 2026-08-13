// Dominio: Uscita — pagamento reale che riduce il saldo di un Fondo (o di uno specifico
// Obiettivo al suo interno). Riguarda esclusivamente Fondi/Obiettivi: mai i Budget, la cui
// spesa non viene registrata nel dettaglio (§5.18 FDD, confermato esplicitamente dall'utente).
//
// Evento storico immutabile: si corregge con uno Storno (domain/storni.js), mai con modifica
// o cancellazione diretta.

import { dbAdd, dbGet, dbGetAll, dbPut, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { ottieniFondo, aggiornaFondo, verificaRiduzioneCoerente } from './fondi.js';
import { aggiornaObiettivo } from './obiettivi.js';
import { ottieniConto, aggiornaConto } from './conti.js';
import { registraStorno, eliminaStorniPerMovimento } from './storni.js';

const STORE = 'uscite';

// segno = +1 per applicare l'effetto dell'Uscita, -1 per stornarlo (movimento inverso).
async function applicaEffetto(uscita, segno) {
  const fondo = await ottieniFondo(uscita.fondoId);
  if (!fondo) throw new Error('Fondo non trovato.');

  if (uscita.obiettivoId) {
    const obiettivo = await dbGet('obiettivi', uscita.obiettivoId);
    if (!obiettivo) throw new Error('Obiettivo non trovato.');
    // Stesso ordine di scrittura usato nell'Allocazione: prima il Fondo, poi l'Obiettivo,
    // così il controllo di coerenza in aggiornaObiettivo non fallisce mai per un ordine sbagliato.
    await aggiornaFondo(uscita.fondoId, { saldo: fondo.saldo - segno * uscita.importo });
    await aggiornaObiettivo(uscita.obiettivoId, { saldoAccumulato: obiettivo.saldoAccumulato - segno * uscita.importo });
  } else {
    await aggiornaFondo(uscita.fondoId, { saldo: fondo.saldo - segno * uscita.importo });
  }

  // Movimento REALE sul Conto (bug corretto, stessa classe di quello già risolto per l'Entrata):
  // il denaro di un'Uscita non solo lascia il Fondo, lascia fisicamente il Conto a cui il Fondo
  // appartiene (va a pagare qualcosa fuori dal sistema). Senza questo, il Fondo si riduce ma il
  // Conto resta invariato, creando esattamente la stessa incoerenza già vista con l'Entrata.
  const conto = await ottieniConto(fondo.contoId);
  await aggiornaConto(fondo.contoId, { saldoReale: conto.saldoReale - segno * uscita.importo });
}

export async function creaUscita(dati) {
  if (!dati.fondoId) throw new Error('Seleziona il Fondo da cui proviene l\'Uscita.');
  const importo = Number(dati.importo);
  if (!importo || importo <= 0) throw new Error('L\'importo dell\'Uscita deve essere maggiore di zero.');

  const fondo = await ottieniFondo(dati.fondoId);
  if (!fondo) throw new Error('Il Fondo selezionato non esiste.');

  if (dati.obiettivoId) {
    const obiettivo = await dbGet('obiettivi', dati.obiettivoId);
    if (!obiettivo) throw new Error('L\'Obiettivo selezionato non esiste.');
    if (obiettivo.saldoAccumulato < importo) {
      throw new Error(`L'Obiettivo ha solo ${obiettivo.saldoAccumulato} € accumulati: non puoi registrare un'Uscita di ${importo} €.`);
    }
  } else {
    if (fondo.saldo < importo) {
      throw new Error(`Il Fondo ha solo ${fondo.saldo} € disponibili: non puoi registrare un'Uscita di ${importo} €.`);
    }
    await verificaRiduzioneCoerente(dati.fondoId, fondo.saldo - importo);
  }

  const now = oggiISO();
  const uscita = {
    id: generaId(),
    data: dati.data || now,
    fondoId: dati.fondoId,
    obiettivoId: dati.obiettivoId || null,
    importo,
    descrizione: dati.descrizione || '',
    stornata: false,
    dataCreazione: now
  };

  await applicaEffetto(uscita, +1);
  await dbAdd(STORE, uscita);
  return uscita;
}

export async function stornaUscita(id, descrizioneStorno) {
  const uscita = await dbGet(STORE, id);
  if (!uscita) throw new Error('Uscita non trovata.');
  if (uscita.stornata) throw new Error('Questa Uscita è già stata stornata.');

  await applicaEffetto(uscita, -1);
  await dbPut(STORE, { ...uscita, stornata: true });
  return registraStorno({ tipoMovimento: 'uscita', movimentoId: id, descrizione: descrizioneStorno });
}

// Eliminazione DIRETTA (senza storno, senza annullare effetti). Solo per pulizia di dati rotti.
export async function eliminaUscita(id) {
  await eliminaStorniPerMovimento(id);
  await dbDelete(STORE, id);
}

export async function elencoUscite() {
  const tutte = await dbGetAll(STORE);
  return tutte.sort((a, b) => new Date(b.data) - new Date(a.data));
}
