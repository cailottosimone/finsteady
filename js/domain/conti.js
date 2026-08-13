// Dominio: Conto — rappresenta dove si trova realmente il denaro (§2.3 FDD).
// Ogni accesso ai dati passa da storage.js. Nessuna logica di UI qui.
//
// "tipologia" è ora una scelta fissa (decisione esplicita dell'utente, in evoluzione rispetto
// al FDD originale che la considerava puramente organizzativa): un Conto "spesa" non può avere
// un saldo diverso da zero. Il controllo blocca i casi diretti e sicuri da bloccare (creazione,
// Rettifica); per qualunque altro percorso che potesse comunque produrre un saldo diverso da
// zero su un Conto Spesa, la Verifica di Integrità Patrimoniale lo segnala esplicitamente
// (vedi engine/integrityCheck.js) — non blocchiamo scritture generiche di saldoReale qui dentro
// (es. durante un'Allocazione) per non rischiare di lasciare un'operazione a metà.

import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { arrotonda } from '../utils/denaro.js';

const STORE = 'conti';
export const TIPOLOGIE_CONTO = ['risparmio', 'spesa'];

export async function creaConto(dati) {
  if (!dati.nome || !dati.nome.trim()) {
    throw new Error('Il nome del Conto è obbligatorio.');
  }
  const saldoIniziale = arrotonda(dati.saldoReale) || 0;
  if (dati.tipologia === 'spesa' && Math.abs(saldoIniziale) > 0.005) {
    throw new Error('Un Conto di tipo "Spesa" non può avere un saldo diverso da zero.');
  }
  const now = oggiISO();
  const conto = {
    id: generaId(),
    nome: dati.nome.trim(),
    descrizione: dati.descrizione ? dati.descrizione.trim() : '',
    istituto: dati.istituto ? dati.istituto.trim() : '',
    saldoReale: saldoIniziale,
    valuta: dati.valuta || 'EUR',
    tipologia: TIPOLOGIE_CONTO.includes(dati.tipologia) ? dati.tipologia : 'risparmio',
    ordinamento: Number(dati.ordinamento) || 0,
    inclusoProspettiDefault: dati.inclusoProspettiDefault !== false,
    stato: 'attivo',
    dataCreazione: now,
    dataModifica: now
  };
  await dbAdd(STORE, conto);
  return conto;
}

// Campi che devono sempre essere numeri, indipendentemente dal fatto che la modifica
// arrivi da un form HTML (che fornisce sempre stringhe) o da codice interno.
const CAMPI_NUMERICI = ['saldoReale', 'ordinamento'];

function normalizzaModifiche(modifiche) {
  const normalizzato = { ...modifiche };
  for (const campo of CAMPI_NUMERICI) {
    if (normalizzato[campo] != null) normalizzato[campo] = Number(normalizzato[campo]);
  }
  if (normalizzato.saldoReale != null) normalizzato.saldoReale = arrotonda(normalizzato.saldoReale);
  return normalizzato;
}

export async function aggiornaConto(id, modifiche) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Conto non trovato.');
  const normalizzate = normalizzaModifiche(modifiche);

  // Controllo attivo solo quando la tipologia viene esplicitamente impostata in questa chiamata
  // (azione diretta e isolata, es. dal form "Modifica Conto"): non blocchiamo qui le scritture
  // generiche del saldo che arrivano da operazioni più ampie (Allocazione, Trasferimento), per
  // non rischiare di interrompere a metà un'operazione articolata su più entità. Quei casi
  // restano coperti dalla segnalazione nella Verifica di Integrità Patrimoniale.
  if (normalizzate.tipologia === 'spesa') {
    const nuovoSaldo = normalizzate.saldoReale != null ? normalizzate.saldoReale : esistente.saldoReale;
    if (Math.abs(nuovoSaldo) > 0.005) {
      throw new Error('Un Conto di tipo "Spesa" non può avere un saldo diverso da zero.');
    }
  }

  const aggiornato = {
    ...esistente,
    ...normalizzate,
    id: esistente.id, // l'id non è mai modificabile
    dataModifica: oggiISO()
  };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

export async function impostaStatoConto(id, nuovoStato) {
  return aggiornaConto(id, { stato: nuovoStato });
}

// Un Conto può essere eliminato solo se non contiene Fondi né Budget (integrità > comodità, §5.21).
// A cascata, elimina anche ogni movimento (e i relativi Storni) che referenzia questo Conto
// direttamente — altrimenti quei movimenti resterebbero orfani, puntando a un Conto inesistente.
export async function eliminaConto(id) {
  const [fondi, budget] = await Promise.all([
    dbGetAll('fondi'),
    dbGetAll('budget')
  ]);
  const haFondi = fondi.some((f) => f.contoId === id);
  const haBudget = budget.some((b) => b.contoId === id);
  if (haFondi || haBudget) {
    throw new Error('Impossibile eliminare il Conto: contiene Fondi o Budget collegati. Spostali o eliminali prima.');
  }

  const [righe, trasferimenti, rettifiche, storni] = await Promise.all([
    dbGetAll('allocazioniRighe'), dbGetAll('trasferimenti'), dbGetAll('rettifiche'), dbGetAll('storni')
  ]);

  const righeDaRimuovere = righe.filter((r) => r.contoMovimentoId === id);
  const trasferimentiDaRimuovere = trasferimenti.filter((t) =>
    (t.tipoOrigine === 'conto' && t.origineId === id) || (t.tipoDestinazione === 'conto' && t.destinazioneId === id)
  );
  const rettificheDaRimuovere = rettifiche.filter((r) => (r.tipoEntita || 'conto') === 'conto' && (r.entitaId || r.contoId) === id);

  const idMovimentiRimossi = new Set([
    ...righeDaRimuovere.map((r) => r.id), ...trasferimentiDaRimuovere.map((t) => t.id), ...rettificheDaRimuovere.map((r) => r.id)
  ]);
  for (const s of storni) {
    if (idMovimentiRimossi.has(s.movimentoId)) await dbDelete('storni', s.id);
  }
  for (const r of righeDaRimuovere) await dbDelete('allocazioniRighe', r.id);
  for (const t of trasferimentiDaRimuovere) await dbDelete('trasferimenti', t.id);
  for (const r of rettificheDaRimuovere) await dbDelete('rettifiche', r.id);

  await dbDelete(STORE, id);
}

export async function elencoConti() {
  const conti = await dbGetAll(STORE);
  return conti.sort((a, b) => (a.ordinamento || 0) - (b.ordinamento || 0));
}

export async function ottieniConto(id) {
  return dbGet(STORE, id);
}
