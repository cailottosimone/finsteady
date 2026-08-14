// Dominio: Fondo — porzione di patrimonio destinata ad uno scopo, appartiene ad un Conto (§2.4 FDD).
// Il Fondo NON è un conto, NON rappresenta una spesa: descrive solo la destinazione del denaro.

import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { arrotonda } from '../utils/denaro.js';

const STORE = 'fondi';

export async function creaFondo(dati) {
  if (!dati.nome || !dati.nome.trim()) {
    throw new Error('Il nome del Fondo è obbligatorio.');
  }
  if (!dati.contoId) {
    throw new Error('Ogni Fondo deve appartenere ad un Conto.');
  }
  const conto = await dbGet('conti', dati.contoId);
  if (!conto) {
    throw new Error('Il Conto indicato per il Fondo non esiste.');
  }
  const now = oggiISO();
  const fondo = {
    id: generaId(),
    nome: dati.nome.trim(),
    descrizione: dati.descrizione ? dati.descrizione.trim() : '',
    contoId: dati.contoId,
    saldo: arrotonda(dati.saldo) || 0,
    obiettivoComplessivoImporto: dati.obiettivoComplessivoImporto != null
      ? arrotonda(dati.obiettivoComplessivoImporto) : null,
    inclusoProspettiDefault: dati.inclusoProspettiDefault !== false,
    stato: 'attivo',
    dataCreazione: now,
    dataModifica: now
  };
  await dbAdd(STORE, fondo);
  return fondo;
}

const CAMPI_NUMERICI = ['saldo', 'obiettivoComplessivoImporto'];

function normalizzaModifiche(modifiche) {
  const normalizzato = { ...modifiche };
  for (const campo of CAMPI_NUMERICI) {
    if (normalizzato[campo] != null) normalizzato[campo] = arrotonda(normalizzato[campo]);
  }
  return normalizzato;
}

export async function aggiornaFondo(id, modifiche) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Fondo non trovato.');

  // Non è consentito spostare un Fondo che possiede Obiettivi senza avviso esplicito:
  // qui ci limitiamo a permettere l'aggiornamento; l'avviso di ambiguità architetturale
  // (cambio Conto con Obiettivi attivi) è demandato alla UI, che deve chiedere conferma.
  const aggiornato = {
    ...esistente,
    ...normalizzaModifiche(modifiche),
    id: esistente.id,
    dataModifica: oggiISO()
  };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// Un Fondo può essere eliminato solo se non contiene Obiettivi (§2.5: l'Obiettivo non può
// esistere senza Fondo, quindi eliminare il Fondo lascerebbe Obiettivi orfani).
// A cascata, elimina anche ogni movimento (e i relativi Storni) che referenzia questo Fondo
// direttamente — altrimenti quei movimenti resterebbero orfani, puntando a un Fondo inesistente.
export async function eliminaFondo(id) {
  const obiettivi = await dbGetAll('obiettivi');
  const haObiettivi = obiettivi.some((o) => o.fondoId === id);
  if (haObiettivi) {
    throw new Error('Impossibile eliminare il Fondo: contiene Obiettivi. Rimuovili o spostali prima.');
  }

  const [righe, uscite, trasferimenti, rettifiche, storni] = await Promise.all([
    dbGetAll('allocazioniRighe'), dbGetAll('uscite'), dbGetAll('trasferimenti'), dbGetAll('rettifiche'), dbGetAll('storni')
  ]);

  const righeDaRimuovere = righe.filter((r) => r.tipoDestinazione === 'fondo' && r.destinazioneId === id);
  const usciteDaRimuovere = uscite.filter((u) => u.fondoId === id);
  const trasferimentiDaRimuovere = trasferimenti.filter((t) =>
    (t.tipoOrigine === 'fondo' && t.origineId === id) || (t.tipoDestinazione === 'fondo' && t.destinazioneId === id)
  );
  const rettificheDaRimuovere = rettifiche.filter((r) => (r.tipoEntita || 'conto') === 'fondo' && r.entitaId === id);

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

export async function elencoFondi() {
  return dbGetAll(STORE);
}

export async function elencoFondiPerConto(contoId) {
  const tutti = await dbGetAll(STORE);
  return tutti.filter((f) => f.contoId === contoId);
}

export async function ottieniFondo(id) {
  return dbGet(STORE, id);
}

// Verifica che una riduzione diretta del saldo di un Fondo (es. Uscita o Trasferimento che
// escono dal Fondo senza passare da un Obiettivo specifico) non porti il saldo sotto la somma
// degli Obiettivi già accumulati al suo interno (§5.2 unicità del denaro).
// Tolleranza di mezzo centesimo: vedi nota identica in domain/obiettivi.js, stesso motivo
// (somma di valori già arrotondati che può produrre rumore infinitesimale in virgola mobile).
export async function verificaRiduzioneCoerente(fondoId, nuovoSaldoProposto) {
  const obiettivi = await dbGetAll('obiettivi');
  const totaleObiettivi = arrotonda(obiettivi
    .filter((o) => o.fondoId === fondoId)
    .reduce((s, o) => s + (Number(o.saldoAccumulato) || 0), 0));
  if (nuovoSaldoProposto < totaleObiettivi - 0.005) {
    throw new Error(
      `Il Fondo ha ${totaleObiettivi} € già accumulati nei suoi Obiettivi: non può scendere sotto questa soglia.`
    );
  }
}

// --- Gestione dei Fondi annuali (§ revisione del modello) ---
//
// Ogni Fondo rappresenta un esercizio finanziario autonomo (es. "Spese 2026", "Spese 2027").
// Alla chiusura dell'anno l'utente compie 4 azioni distinte e deliberate, mai automatiche
// nel loro insieme:
//   1. crea il nuovo Fondo dell'anno successivo (+ copia degli Obiettivi, senza saldo)
//   2. trasferisce manualmente l'eventuale saldo residuo (azione separata, non qui)
//   3. archivia il Fondo dell'anno concluso (azione separata, esplicita)

// Azione 1: crea il nuovo Fondo e vi copia gli Obiettivi del Fondo di origine, mantenendo
// nome, importo target, data prevista e categoria, ma azzerando il saldo accumulato
// (il saldo si costruisce da zero nel nuovo esercizio; l'eventuale importo da trasferire
// resta una scelta manuale dell'utente, non automatizzata da questa funzione).
export async function creaFondoAnnualeSuccessivo(fondoOrigineId, datiNuovoFondo) {
  const fondoOrigine = await dbGet(STORE, fondoOrigineId);
  if (!fondoOrigine) throw new Error('Fondo di origine non trovato.');

  const nuovoFondo = await creaFondo({
    nome: datiNuovoFondo.nome,
    descrizione: datiNuovoFondo.descrizione || fondoOrigine.descrizione,
    contoId: datiNuovoFondo.contoId || fondoOrigine.contoId,
    saldo: 0,
    obiettivoComplessivoImporto: fondoOrigine.obiettivoComplessivoImporto,
    inclusoProspettiDefault: fondoOrigine.inclusoProspettiDefault
  });

  const obiettiviOrigine = await dbGetAllByIndexObiettivi(fondoOrigineId);
  const now = oggiISO();
  const obiettiviCopiati = [];
  for (const o of obiettiviOrigine) {
    const copia = {
      id: generaId(),
      fondoId: nuovoFondo.id,
      nome: o.nome,
      importoTarget: o.importoTarget,
      dataPrevista: o.dataPrevista,
      categoriaId: o.categoriaId || null,
      saldoAccumulato: 0, // esplicitamente NON copiato, come richiesto
      stato: 'in corso',
      dataCreazione: now,
      dataModifica: now
    };
    await dbAdd('obiettivi', copia);
    obiettiviCopiati.push(copia);
  }

  return { nuovoFondo, obiettiviCopiati };
}

// Piccolo helper locale per non introdurre una dipendenza circolare con domain/obiettivi.js
async function dbGetAllByIndexObiettivi(fondoId) {
  const tutti = await dbGetAll('obiettivi');
  return tutti.filter((o) => o.fondoId === fondoId);
}

// Azione 3: archivia il Fondo dell'anno concluso. È un'azione separata e deliberata:
// non avviene automaticamente alla creazione del Fondo successivo, perché l'utente potrebbe
// dover prima completare il trasferimento manuale del saldo residuo.
export async function archiviaFondo(id) {
  return aggiornaFondo(id, { stato: 'archiviato' });
}

export async function riattivaFondo(id) {
  return aggiornaFondo(id, { stato: 'attivo' });
}
