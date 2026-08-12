// storage.js — UNICO punto di accesso a IndexedDB per Financial Planner.
//
// Regola architetturale rigida: nessun altro modulo dell'app deve aprire connessioni,
// transazioni o object store direttamente. Ogni lettura/scrittura passa da qui.
// I moduli di dominio (js/domain/*) chiamano queste funzioni generiche.
//
// Cloud Sync (v0.27): questo file gestisce anche i due store TECNICI '_outbox' e '_syncMeta'
// (vedi db-schema.js) e implementa il SOFT DELETE — dbDelete non rimuove più fisicamente un
// record ma lo marca con deletedAt, e dbGet/dbGetAll/dbGetAllByIndex lo filtrano
// automaticamente. Necessario per propagare le cancellazioni tra dispositivi tramite il Cloud
// Sync: nessun modulo di dominio deve cambiare, il comportamento visto da loro è identico a
// prima (un record cancellato sparisce comunque da ogni lettura).
//
// Ogni scrittura/cancellazione su uno store di dominio (SYNCABLE_STORES) viene automaticamente
// accodata in '_outbox': è js/data/syncProfilo.js a svuotarla verso il cloud, questo file non
// sa nulla di Supabase né di rete.

import { DB_NAME, DB_VERSION, STORE_DEFINITIONS, SYNCABLE_STORES } from './db-schema.js';

const STORE_OUTBOX = '_outbox';
const STORE_SYNC_META = '_syncMeta';
const CHIAVE_SYNC_META = 'globale';

let dbPromise = null;

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
      // Store tecnici di Cloud Sync (v9): mai esportati/importati come dati applicativi.
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_META)) {
        db.createObjectStore(STORE_SYNC_META, { keyPath: 'id' });
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

function oggiISO() {
  return new Date().toISOString();
}

function eVivo(record) {
  return !record.deletedAt;
}

/** Accoda un record nella coda di sincronizzazione (outbox), una riga per (store, id): scritture
 * ripetute sullo stesso record prima che parta il push si sovrascrivono da sole. Solo per gli
 * store di dominio sincronizzabili (SYNCABLE_STORES) — mai per '_outbox'/'_syncMeta' stessi, per
 * non creare una ricorsione. Fallisce in silenzio: il Cloud Sync è un livello opzionale, non
 * deve mai far fallire una scrittura locale. */
async function accodaOutbox(storeName, id) {
  if (!SYNCABLE_STORES.includes(storeName)) return;
  try {
    const { store } = await transazione(STORE_OUTBOX, 'readwrite');
    await richiestaAPromise(store.put({ id: `${storeName}::${id}`, store: storeName, recordId: id, accodatoIl: oggiISO() }));
  } catch (err) {
    console.warn('Impossibile accodare la modifica per il Cloud Sync:', err);
  }
}

export async function dbAdd(storeName, oggetto) {
  const { store } = await transazione(storeName, 'readwrite');
  const risultato = await richiestaAPromise(store.add(oggetto));
  await accodaOutbox(storeName, oggetto.id);
  return risultato;
}

export async function dbPut(storeName, oggetto) {
  // Qualunque put rappresenta lo stato corrente e valido del record: azzera sempre deletedAt,
  // anche per un record che in precedenza fosse stato marcato cancellato (caso limite, ma così
  // non può mai restare "invisibile" per errore dopo un aggiornamento legittimo).
  const record = { ...oggetto, deletedAt: null };
  const { store } = await transazione(storeName, 'readwrite');
  const risultato = await richiestaAPromise(store.put(record));
  await accodaOutbox(storeName, record.id);
  return risultato;
}

export async function dbGet(storeName, id, includiCancellati = false) {
  const { store } = await transazione(storeName, 'readonly');
  const record = await richiestaAPromise(store.get(id));
  if (!record) return record;
  return includiCancellati || eVivo(record) ? record : undefined;
}

export async function dbGetAll(storeName, includiCancellati = false) {
  const { store } = await transazione(storeName, 'readonly');
  const tutti = await richiestaAPromise(store.getAll());
  return includiCancellati ? tutti : tutti.filter(eVivo);
}

/** Soft delete: il record resta nello store con deletedAt valorizzato, così la cancellazione può
 * essere propagata agli altri dispositivi via Cloud Sync invece di sparire solo localmente. Da
 * ogni altra funzione di lettura di questo file, un record cancellato è comunque invisibile: il
 * comportamento visto dai moduli di dominio non cambia rispetto a prima. */
export async function dbDelete(storeName, id) {
  const { store } = await transazione(storeName, 'readwrite');
  const esistente = await richiestaAPromise(store.get(id));
  if (!esistente) return;
  const now = oggiISO();
  await richiestaAPromise(store.put({ ...esistente, deletedAt: now, dataModifica: now }));
  await accodaOutbox(storeName, id);
}

export async function dbGetAllByIndex(storeName, indexName, valore, includiCancellati = false) {
  const { store } = await transazione(storeName, 'readonly');
  const index = store.index(indexName);
  const tutti = await richiestaAPromise(index.getAll(valore));
  return includiCancellati ? tutti : tutti.filter(eVivo);
}

export async function dbClear(storeName) {
  const { store } = await transazione(storeName, 'readwrite');
  return richiestaAPromise(store.clear());
}

/** Scrittura "grezza" usata SOLO dal motore di Cloud Sync (js/data/syncProfilo.js) quando
 * applica un record già arrivato dal cloud: a differenza di dbPut non tocca deletedAt (arriva
 * già corretto dal server, potrebbe essere proprio una cancellazione da propagare) e non lo
 * rimette in outbox (altrimenti un pull rimanderebbe subito un push dello stesso record, in un
 * ping-pong inutile — il dato è già sincronizzato per definizione, essendo appena arrivato da lì). */
export async function dbPutGrezzo(storeName, record) {
  const { store } = await transazione(storeName, 'readwrite');
  return richiestaAPromise(store.put(record));
}

/* ---------------------------------------------------------------------- */
/* Outbox — coda delle modifiche in sospeso verso il cloud                 */
/* (uso interno di js/data/syncProfilo.js)                                 */
/* ---------------------------------------------------------------------- */

export async function outboxList() {
  const { store } = await transazione(STORE_OUTBOX, 'readonly');
  const tutti = await richiestaAPromise(store.getAll());
  return tutti.sort((a, b) => (a.accodatoIl || '').localeCompare(b.accodatoIl || ''));
}

export async function outboxCount() {
  const { store } = await transazione(STORE_OUTBOX, 'readonly');
  return richiestaAPromise(store.count());
}

export async function outboxRimuovi(id) {
  const { store } = await transazione(STORE_OUTBOX, 'readwrite');
  return richiestaAPromise(store.delete(id));
}

/** Rimette in outbox TUTTI i record attualmente presenti (cancellati inclusi, per propagare
 * anche i tombstone): usato una tantum al primo collegamento del Profilo attivo al cloud, per
 * spingere tutto ciò che già esiste in locale. */
export async function outboxAccodaTutto() {
  for (const nome of SYNCABLE_STORES) {
    const tutti = await dbGetAll(nome, true);
    for (const r of tutti) await accodaOutbox(nome, r.id);
  }
}

/* ---------------------------------------------------------------------- */
/* Stato del Cloud Sync per il Profilo attivo (singleton locale)           */
/* ---------------------------------------------------------------------- */

export async function syncMetaOttieni() {
  const { store } = await transazione(STORE_SYNC_META, 'readonly');
  const record = await richiestaAPromise(store.get(CHIAVE_SYNC_META));
  return record || { id: CHIAVE_SYNC_META, cloudId: null, linkedUserId: null, lastPulledAt: null };
}

export async function syncMetaImposta(patch) {
  const attuale = await syncMetaOttieni();
  const { store } = await transazione(STORE_SYNC_META, 'readwrite');
  return richiestaAPromise(store.put({ ...attuale, ...patch, id: CHIAVE_SYNC_META }));
}
