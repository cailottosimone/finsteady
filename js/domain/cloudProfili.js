// Dominio: Cloud Sync multi-Profilo — a differenza di js/data/syncProfilo.js (che sincronizza
// SOLO il Profilo attualmente ATTIVO, tramite storage.js), questo modulo scarica un Profilo
// cloud in un Profilo locale NUOVO, che non è ancora quello attivo. Per questo apre una
// connessione IndexedDB diretta al database del Profilo appena creato — SECONDA eccezione
// consapevole alla regola "solo storage.js accede a IndexedDB" (la prima è
// domain/backupProfili.js, stesso motivo: storage.js è agganciato a un solo database per
// sessione, quello del Profilo attivo).
//
// Non è un'entità del modello del FDD: è un meccanismo tecnico di trasporto dati tra
// dispositivi, non introduce alcun nuovo concetto finanziario.

import { creaProfilo } from '../profili.js';
import { elencoProfiliCloud, pullChanges, upsertProfiloCloud } from '../data/cloud.js';
import { getCurrentUser } from '../data/auth.js';

function richiestaAPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Profili disponibili sul cloud per l'utente autenticato (registro leggero: nome, quando
 * aggiornato, quanti record) — usato dalla vista Cloud Sync per proporre "Scarica come nuovo
 * Profilo". */
export async function elencoProfiliCloudPerScaricare() {
  const user = getCurrentUser();
  if (!user) throw new Error('Devi essere autenticato al cloud.');
  const profili = await elencoProfiliCloud();
  if (profili === null) throw new Error('Cloud non raggiungibile ora: riprova più tardi.');
  return profili;
}

/** Crea un nuovo Profilo locale e lo popola con tutti i record vivi del Profilo cloud scelto,
 * poi lo collega (_syncMeta) così da quel momento in poi, quando diventa il Profilo attivo,
 * js/data/syncProfilo.js lo sincronizza automaticamente come ogni altro Profilo collegato.
 * Non cambia il Profilo attivo: la UI, dopo la chiamata, offre di passare al nuovo Profilo. */
export async function scaricaProfiloComeNuovo(cloudId, nomeSuggerito) {
  const user = getCurrentUser();
  if (!user) throw new Error('Devi essere autenticato al cloud.');

  const nuovoProfilo = await creaProfilo(nomeSuggerito || 'Profilo dal cloud');

  // Apre (e implicitamente crea, tramite il ciclo di vita standard di IndexedDB) il database del
  // nuovo Profilo con la stessa versione/struttura corrente — leggo la versione da un modulo che
  // già la conosce, per non duplicarla qui.
  const { DB_VERSION } = await import('../db-schema.js');
  const db = await apriDbConStruttura(nuovoProfilo.dbName, DB_VERSION);

  try {
    const righe = await pullChanges(cloudId, null); // null = tutto, dal primo popolamento
    if (righe === null) throw new Error('Cloud non raggiungibile ora: riprova più tardi.');

    let ultimoAggiornamento = null;
    for (const riga of righe) {
      const tx = db.transaction(riga.store, 'readwrite');
      await richiestaAPromise(tx.objectStore(riga.store).put({ ...riga.dati, _syncUpdatedAt: riga.updatedAt }));
      if (!ultimoAggiornamento || riga.updatedAt > ultimoAggiornamento) ultimoAggiornamento = riga.updatedAt;
    }

    const txMeta = db.transaction('_syncMeta', 'readwrite');
    await richiestaAPromise(txMeta.objectStore('_syncMeta').put({
      id: 'globale', cloudId, linkedUserId: user.id, lastPulledAt: ultimoAggiornamento
    }));
  } finally {
    db.close();
  }

  // Aggiorna il registro cloud col nome scelto localmente per questo Profilo (può differire dal
  // nome originale, se l'utente lo ha rinominato durante il download).
  try {
    await upsertProfiloCloud(cloudId, nuovoProfilo.nome, null);
  } catch { /* non essenziale */ }

  return nuovoProfilo;
}

// Apre il database creando anche gli store tecnici di Cloud Sync se mancanti (un Profilo appena
// creato da js/profili.js non è mai stato aperto prima da storage.js, quindi la sua struttura
// non esiste ancora finché non lo si apre almeno una volta con onupgradeneeded).
async function apriDbConStruttura(dbName, versione) {
  const { STORE_DEFINITIONS } = await import('../db-schema.js');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, versione);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const def of STORE_DEFINITIONS) {
        if (!db.objectStoreNames.contains(def.nome)) {
          const store = db.createObjectStore(def.nome, { keyPath: def.keyPath });
          for (const idx of def.indici) store.createIndex(idx.nome, idx.campo, idx.opzioni || {});
        }
      }
      if (!db.objectStoreNames.contains('_outbox')) db.createObjectStore('_outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('_syncMeta')) db.createObjectStore('_syncMeta', { keyPath: 'id' });
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}
