// Dominio: Backup — esporta/importa l'intero contenuto del database in un file JSON, così
// l'utente può portare la propria configurazione su un altro PC (nuovo requisito esplicito).
//
// Non è un'entità del modello del FDD: è puramente un meccanismo tecnico di trasporto dei dati,
// non introduce alcun nuovo concetto finanziario.

import { dbGetAll, dbAdd, dbClear } from '../storage.js';
import { STORE_DEFINITIONS, DB_VERSION } from '../db-schema.js';

export async function esportaTutto() {
  const dati = {};
  for (const def of STORE_DEFINITIONS) {
    dati[def.nome] = await dbGetAll(def.nome);
  }
  return {
    app: 'financial-planner',
    versioneSchema: DB_VERSION,
    dataEsportazione: new Date().toISOString(),
    dati
  };
}

// Sostituisce interamente il contenuto di ogni store con quello del pacchetto importato.
// Azione distruttiva e irreversibile sui dati correnti: la UI deve chiedere conferma esplicita
// prima di chiamare questa funzione.
export async function importaTutto(pacchetto) {
  if (!pacchetto || typeof pacchetto !== 'object' || !pacchetto.dati) {
    throw new Error('Il file selezionato non è un backup valido di Financial Planner.');
  }
  for (const def of STORE_DEFINITIONS) {
    await dbClear(def.nome);
    const record = Array.isArray(pacchetto.dati[def.nome]) ? pacchetto.dati[def.nome] : [];
    for (const r of record) {
      await dbAdd(def.nome, r);
    }
  }
}
