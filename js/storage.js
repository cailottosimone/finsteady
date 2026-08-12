// storage.js — UNICO punto di accesso a IndexedDB per Financial Planner.
//
// Regola architetturale rigida: nessun altro modulo dell'app deve aprire connessioni,
// transazioni o object store direttamente. Ogni lettura/scrittura passa da qui.
// I moduli di dominio (js/domain/*) chiamano queste funzioni generiche.
//
// onScrittura/notifica: hook generico "dopo ogni scrittura andata a buon fine", usato dal Sync
// Cloud (js/sync/syncEngine.js) per sapere quando programmare un caricamento automatico —
// storage.js resta comunque agnostico rispetto al sync: non sa nulla di Supabase, si limita a
// notificare "è successo qualcosa" a chi si è iscritto.

import { DB_NAME, DB_VERSION, STORE_DEFINITIONS } from './db-schema.js';

let dbPromise = null;
let listeners = [];

// callback(storeName, operazione) — operazione: 'scrivi' | 'elimina'. Ritorna una funzione per
// annullare l'iscrizione.
export function onScrittura(callback) {
  listeners.push(callback);
  return () => { listeners = listeners.filter((l) => l !== callback); };
}

function notifica(storeName, operazione) {
  listeners.slice().forEach((callback) => {
    try {
      callback(storeName, operazione);
    } catch (err) {
      console.error('[storage] un listener onScrittura ha generato un errore:', err);
    }
  });
}

function apriConnessione() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const def of STORE_DEFINITIONS) {
        if (!db.objectStoreNames.contains(def.nome)) {
          const store = db.createObjectStore(def.nome, { keyPath: def.keyPath });
          for (const idx of def.indici) {
            store.createIndex(idx.nome, idx.campo, idx.opzioni || {});
          }
        }
        // Migrazione additiva: se in futuro uno store esiste già ma manca un indice nuovo,
        // andrà gestito qui confrontando store.indexNames prima di createIndex.
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

function transazione(storeName, modo) {
  return apriConnessione().then((db) => {
    const tx = db.transaction(storeName, modo);
    return { tx, store: tx.objectStore(storeName) };
  });
}

function richiestaAPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbAdd(storeName, oggetto) {
  const { store } = await transazione(storeName, 'readwrite');
  const risultato = await richiestaAPromise(store.add(oggetto));
  notifica(storeName, 'scrivi');
  return risultato;
}

export async function dbPut(storeName, oggetto) {
  const { store } = await transazione(storeName, 'readwrite');
  const risultato = await richiestaAPromise(store.put(oggetto));
  notifica(storeName, 'scrivi');
  return risultato;
}

export async function dbGet(storeName, id) {
  const { store } = await transazione(storeName, 'readonly');
  return richiestaAPromise(store.get(id));
}

export async function dbGetAll(storeName) {
  const { store } = await transazione(storeName, 'readonly');
  return richiestaAPromise(store.getAll());
}

export async function dbDelete(storeName, id) {
  const { store } = await transazione(storeName, 'readwrite');
  const risultato = await richiestaAPromise(store.delete(id));
  notifica(storeName, 'elimina');
  return risultato;
}

export async function dbGetAllByIndex(storeName, indexName, valore) {
  const { store } = await transazione(storeName, 'readonly');
  const index = store.index(indexName);
  return richiestaAPromise(index.getAll(valore));
}

export async function dbClear(storeName) {
  const { store } = await transazione(storeName, 'readwrite');
  return richiestaAPromise(store.clear());
}
