// Dominio: Categoria — solo raggruppamento (§2.7 / §5.17 FDD). Non influenza mai i calcoli.
//
// Revisione del modello (richiesta esplicita dell'utente): la Categoria appartiene ora
// all'Obiettivo e al Budget, non più al Fondo. Il Fondo identifica DOVE si accantona il denaro
// (es. "Spese 2027"), la Categoria identifica PER QUALE AMBITO DI VITA quel denaro è destinato
// (es. Auto, Casa, Salute), permettendo report trasversali indipendenti dal Fondo/anno.
//
// Nota di migrazione (additiva, non distruttiva): eventuali Categorie create in precedenza con
// ambito "fondo" restano nel database ma non vengono più mostrate né utilizzabili in questa UI,
// poiché il concetto non esiste più nel modello. Se ti servono ancora, ricreale con ambito
// "obiettivo" o "budget": nessun dato esistente viene cancellato automaticamente.

import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';

const STORE = 'categorie';
const AMBITI_VALIDI = ['obiettivo', 'budget'];

export async function creaCategoria(dati) {
  if (!dati.nome || !dati.nome.trim()) {
    throw new Error('Il nome della Categoria è obbligatorio.');
  }
  if (!AMBITI_VALIDI.includes(dati.ambito)) {
    throw new Error('Ambito Categoria non valido: deve essere "obiettivo" o "budget".');
  }
  const categoria = {
    id: generaId(),
    nome: dati.nome.trim(),
    ambito: dati.ambito,
    ordinamento: Number(dati.ordinamento) || 0
  };
  await dbAdd(STORE, categoria);
  return categoria;
}

export async function aggiornaCategoria(id, modifiche) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Categoria non trovata.');
  const aggiornata = { ...esistente, ...modifiche, id: esistente.id };
  if (aggiornata.ordinamento != null) aggiornata.ordinamento = Number(aggiornata.ordinamento);
  await dbPut(STORE, aggiornata);
  return aggiornata;
}

export async function eliminaCategoria(id) {
  const [obiettivi, budget] = await Promise.all([dbGetAll('obiettivi'), dbGetAll('budget')]);
  const inUso = obiettivi.some((o) => o.categoriaId === id) || budget.some((b) => b.categoriaId === id);
  if (inUso) {
    throw new Error('Impossibile eliminare la Categoria: è collegata a Obiettivi o Budget esistenti.');
  }
  await dbDelete(STORE, id);
}

export async function elencoCategorie(ambito) {
  const tutte = await dbGetAll(STORE);
  const filtrate = ambito
    ? tutte.filter((c) => c.ambito === ambito)
    : tutte.filter((c) => AMBITI_VALIDI.includes(c.ambito));
  return filtrate.sort((a, b) => (a.ordinamento || 0) - (b.ordinamento || 0));
}
