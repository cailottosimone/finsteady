// Dominio: Obiettivo — finalità economica interna ad un Fondo (§2.5 / §5.5 FDD).
// Non può MAI esistere senza Fondo, né direttamente in un Conto o in un Budget.

import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete, dbGetAllByIndex } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { arrotonda } from '../utils/denaro.js';

const STORE = 'obiettivi';

// Verifica il principio di unicità del denaro (§5.2): il totale accumulato negli Obiettivi
// di un Fondo non può superare il saldo reale del Fondo stesso.
//
// Tolleranza di mezzo centesimo: sommare più valori già puliti a 2 decimali (es. 385.00 + 385.00
// + 385.00) può comunque produrre un residuo infinitesimale in virgola mobile (1155.0000000000002
// invece di 1155) per i limiti dell'aritmetica binaria. Senza tolleranza, un'operazione del tutto
// legittima verrebbe bloccata da un errore che non ha alcun significato finanziario reale.
async function verificaCoerenzaConFondo(fondoId, saldoAccumulatoProposto, idObiettivoEscluso) {
  const fondo = await dbGet('fondi', fondoId);
  if (!fondo) throw new Error('Il Fondo indicato per l\'Obiettivo non esiste.');

  const obiettiviDelFondo = await dbGetAllByIndex(STORE, 'fondoId', fondoId);
  const totaleAltriObiettivi = obiettiviDelFondo
    .filter((o) => o.id !== idObiettivoEscluso)
    .reduce((somma, o) => somma + (Number(o.saldoAccumulato) || 0), 0);

  const totaleProposto = arrotonda(totaleAltriObiettivi + (Number(saldoAccumulatoProposto) || 0));
  if (totaleProposto > fondo.saldo + 0.005) {
    throw new Error(
      `Il saldo accumulato totale degli Obiettivi (${totaleProposto}) supererebbe il saldo del Fondo (${fondo.saldo}). ` +
      'Correggi l\'importo o versa prima denaro nel Fondo.'
    );
  }
}

export async function creaObiettivo(dati) {
  if (!dati.nome || !dati.nome.trim()) {
    throw new Error('Il nome dell\'Obiettivo è obbligatorio.');
  }
  if (!dati.fondoId) {
    throw new Error('Ogni Obiettivo deve appartenere ad un Fondo.');
  }
  const saldoAccumulato = arrotonda(dati.saldoAccumulato) || 0;
  await verificaCoerenzaConFondo(dati.fondoId, saldoAccumulato, null);

  const now = oggiISO();
  const obiettivo = {
    id: generaId(),
    fondoId: dati.fondoId,
    nome: dati.nome.trim(),
    importoTarget: arrotonda(dati.importoTarget) || 0,
    dataPrevista: dati.dataPrevista || null,
    categoriaId: dati.categoriaId || null,
    saldoAccumulato,
    stato: dati.stato || 'in corso',
    dataCreazione: now,
    dataModifica: now
  };
  await dbAdd(STORE, obiettivo);
  return obiettivo;
}

const CAMPI_NUMERICI = ['importoTarget', 'saldoAccumulato'];

function normalizzaModifiche(modifiche) {
  const normalizzato = { ...modifiche };
  for (const campo of CAMPI_NUMERICI) {
    if (normalizzato[campo] != null) normalizzato[campo] = arrotonda(normalizzato[campo]);
  }
  return normalizzato;
}

export async function aggiornaObiettivo(id, modifiche) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Obiettivo non trovato.');

  const modificheNormalizzate = normalizzaModifiche(modifiche);
  const fondoId = modificheNormalizzate.fondoId || esistente.fondoId;
  const saldoAccumulato = modificheNormalizzate.saldoAccumulato != null
    ? modificheNormalizzate.saldoAccumulato : esistente.saldoAccumulato;

  await verificaCoerenzaConFondo(fondoId, saldoAccumulato, id);

  const aggiornato = {
    ...esistente,
    ...modificheNormalizzate,
    id: esistente.id,
    dataModifica: oggiISO()
  };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// Elimina l'Obiettivo e, a cascata, ogni movimento (e i relativi Storni) che lo referenzia
// direttamente (righe di Allocazione, Uscite, Trasferimenti, Rettifiche) — altrimenti quei
// movimenti resterebbero orfani, puntando a un Obiettivo non più esistente.
export async function eliminaObiettivo(id) {
  const [righe, uscite, trasferimenti, rettifiche, storni] = await Promise.all([
    dbGetAll('allocazioniRighe'), dbGetAll('uscite'), dbGetAll('trasferimenti'), dbGetAll('rettifiche'), dbGetAll('storni')
  ]);

  const righeDaRimuovere = righe.filter((r) => r.tipoDestinazione === 'obiettivo' && r.destinazioneId === id);
  const usciteDaRimuovere = uscite.filter((u) => u.obiettivoId === id);
  const trasferimentiDaRimuovere = trasferimenti.filter((t) =>
    (t.tipoOrigine === 'obiettivo' && t.origineId === id) || (t.tipoDestinazione === 'obiettivo' && t.destinazioneId === id)
  );
  const rettificheDaRimuovere = rettifiche.filter((r) => (r.tipoEntita || 'conto') === 'obiettivo' && r.entitaId === id);

  const idMovimentiRimossi = new Set([
    ...righeDaRimuovere.map((r) => r.id), ...usciteDaRimuovere.map((u) => u.id),
    ...trasferimentiDaRimuovere.map((t) => t.id), ...rettificheDaRimuovere.map((r) => r.id)
  ]);
  for (const s of storni) {
    if (idMovimentiRimossi.has(s.movimentoId)) await dbDelete('storni', s.id);
  }
  for (const r of righeDaRimuovere) await dbDelete('allocazioniRighe', r.id);
  for (const u of usciteDaRimuovere) await dbDelete('uscite', u.id);
  for (const t of trasferimentiDaRimuovere) await dbDelete('trasferimenti', t.id);
  for (const r of rettificheDaRimuovere) await dbDelete('rettifiche', r.id);

  await dbDelete(STORE, id);
}

export async function elencoObiettiviPerFondo(fondoId) {
  return dbGetAllByIndex(STORE, 'fondoId', fondoId);
}

export async function elencoObiettivi() {
  return dbGetAll(STORE);
}

// Aggiorna in blocco la data di scadenza (dataPrevista) di TUTTI gli Obiettivi di un Fondo —
// utile dopo aver duplicato un Fondo (es. "Spese 2027" → "Spese 2028"): invece di modificare
// ciascun Obiettivo uno per uno, un'unica azione esplicita (con conferma) applica la stessa
// nuova scadenza a tutti. Nessun altro campo viene toccato (nome, target, saldo restano
// invariati); ogni Obiettivo passa comunque per aggiornaObiettivo, quindi resta soggetto alle
// stesse verifiche di coerenza con il proprio Fondo.
export async function aggiornaScadenzaTuttiGliObiettivi(fondoId, nuovaDataPrevista) {
  if (!nuovaDataPrevista) throw new Error('Indica una data di scadenza valida.');
  const obiettivi = await elencoObiettiviPerFondo(fondoId);
  const aggiornati = [];
  for (const o of obiettivi) {
    aggiornati.push(await aggiornaObiettivo(o.id, { dataPrevista: nuovaDataPrevista }));
  }
  return aggiornati;
}
