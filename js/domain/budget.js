// Dominio: Budget (definizione master) — disponibilità operativa del ciclo corrente (§2.6 FDD).
// Il Budget NON possiede target, data obiettivo o avanzamento percentuale (§5.6).
//
// In questa fase (Fase 0) gestiamo solo la definizione riutilizzabile del Budget.
// La gestione del ciclo vero e proprio (assegnato/utilizzato/residuo per periodo) arriverà
// in Fase 2 con lo store "budgetCicli".

import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { arrotonda } from '../utils/denaro.js';

const STORE = 'budget';

export async function creaBudget(dati) {
  if (!dati.nome || !dati.nome.trim()) {
    throw new Error('Il nome del Budget è obbligatorio.');
  }
  if (!dati.contoId) {
    throw new Error('Ogni Budget deve appartenere ad un Conto.');
  }
  const conto = await dbGet('conti', dati.contoId);
  if (!conto) {
    throw new Error('Il Conto indicato per il Budget non esiste.');
  }
  const now = oggiISO();
  const budget = {
    id: generaId(),
    nome: dati.nome.trim(),
    contoId: dati.contoId,
    categoriaId: dati.categoriaId || null,
    importoAssegnatoDefault: arrotonda(dati.importoAssegnatoDefault) || 0,
    inclusoProspettiDefault: dati.inclusoProspettiDefault !== false,
    stato: 'attivo',
    dataCreazione: now,
    dataModifica: now
  };
  await dbAdd(STORE, budget);
  return budget;
}

const CAMPI_NUMERICI = ['importoAssegnatoDefault'];

function normalizzaModifiche(modifiche) {
  const normalizzato = { ...modifiche };
  for (const campo of CAMPI_NUMERICI) {
    if (normalizzato[campo] != null) normalizzato[campo] = arrotonda(normalizzato[campo]);
  }
  return normalizzato;
}

export async function aggiornaBudget(id, modifiche) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Budget non trovato.');
  const aggiornato = {
    ...esistente,
    ...normalizzaModifiche(modifiche),
    id: esistente.id,
    dataModifica: oggiISO()
  };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

export async function elencoCicliPerBudget(id) {
  const cicli = await dbGetAll('budgetCicli');
  return cicli.filter((c) => c.budgetId === id);
}

// Elimina il Budget e, a cascata, il suo storico di Cicli (Mese) — decisione esplicita
// dell'utente: "devo poterlo eliminare con le dovute precauzioni". La UI interroga prima
// elencoCicliPerBudget() per mostrare un avviso preciso su cosa verrà perso, poi chiama questa
// funzione. Gli eventuali Trasferimenti già avvenuti (avanzo/sforamento di quei Cicli) NON
// vengono toccati: restano nel Registro Movimenti come storico reale già accaduto, mostrando
// "Budget eliminato" come riferimento — stesso trattamento già riservato a qualunque altra
// entità eliminata di cui un movimento storico conserva solo il riferimento.
export async function eliminaBudget(id) {
  const cicli = await elencoCicliPerBudget(id);
  for (const c of cicli) await dbDelete('budgetCicli', c.id);
  await dbDelete(STORE, id);
}

export async function elencoBudget() {
  return dbGetAll(STORE);
}

export async function elencoBudgetPerConto(contoId) {
  const tutti = await dbGetAll(STORE);
  return tutti.filter((b) => b.contoId === contoId);
}
