// Dominio: Backup multi-Profilo — a differenza di domain/backup.js (che esporta/importa SOLO il
// database del Profilo attualmente ATTIVO, tramite storage.js), questo modulo deve poter
// leggere/scrivere anche i database di Profili NON attivi, senza cambiare Profilo attivo né
// ricaricare la pagina.
//
// Per questo apre connessioni IndexedDB dirette e indipendenti (una alla volta, per nome di
// database, chiusa subito dopo l'operazione): l'UNICA eccezione consapevole alla regola "solo
// storage.js accede a IndexedDB", perché qui il database di destinazione non è quello dell'app
// corrente ma quello di un Profilo arbitrario, identificato per nome — storage.js mette in
// cache un'unica connessione al DB_NAME attivo e non è pensato per gestirne altre in parallelo.
//
// Non è un'entità del modello del FDD: è puramente un meccanismo tecnico di trasporto dei dati
// tra Profili/dispositivi (nuovo requisito esplicito), non introduce alcun nuovo concetto
// finanziario.

import { elencoProfili, ottieniProfiloAttivo, creaProfilo } from '../profili.js';
import { STORE_DEFINITIONS, DB_VERSION } from '../db-schema.js';
import { oggiISO } from '../utils/dateUtils.js';

function apriDbPerNome(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const def of STORE_DEFINITIONS) {
        if (!db.objectStoreNames.contains(def.nome)) {
          const store = db.createObjectStore(def.nome, { keyPath: def.keyPath });
          for (const idx of def.indici) {
            store.createIndex(idx.nome, idx.campo, idx.opzioni || {});
          }
        }
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function richiestaAPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Dal v0.27 (Cloud Sync) storage.js usa il soft delete: un record cancellato resta nello store
// con deletedAt valorizzato (tombstone), per poter propagare la cancellazione tra dispositivi.
// Questo modulo apre connessioni dirette bypassando storage.js, quindi deve filtrare i
// tombstone da solo — altrimenti un backup/trasferimento tra Profili "resusciterebbe" record
// che l'utente aveva cancellato.
function eVivo(record) {
  return !record.deletedAt;
}

async function leggiTuttiGliStore(db) {
  const dati = {};
  for (const def of STORE_DEFINITIONS) {
    const tx = db.transaction(def.nome, 'readonly');
    const tutti = await richiestaAPromise(tx.objectStore(def.nome).getAll());
    dati[def.nome] = tutti.filter(eVivo);
  }
  return dati;
}

async function scriviTuttiGliStore(db, dati) {
  for (const def of STORE_DEFINITIONS) {
    const tx = db.transaction(def.nome, 'readwrite');
    const store = tx.objectStore(def.nome);
    await richiestaAPromise(store.clear());
    const record = Array.isArray(dati[def.nome]) ? dati[def.nome] : [];
    for (const r of record) {
      await richiestaAPromise(store.add(r));
    }
  }
}

async function esportaContenutoProfilo(profilo) {
  const db = await apriDbPerNome(profilo.dbName);
  const dati = await leggiTuttiGliStore(db);
  db.close();
  return { profiloId: profilo.id, nome: profilo.nome, dati };
}

// Esporta un singolo Profilo (di default quello attivo, o l'id indicato), incapsulato nello
// stesso involucro usato per l'export completo — così l'import riconosce sempre lo stesso
// formato, che si tratti di uno o più Profili.
export async function esportaProfiloSingolo(profiloId) {
  const profili = await elencoProfili();
  const profilo = profiloId ? profili.find((p) => p.id === profiloId) : await ottieniProfiloAttivo();
  if (!profilo) throw new Error('Profilo non trovato.');
  const contenuto = await esportaContenutoProfilo(profilo);
  return {
    app: 'financial-planner',
    formatoBackup: 'profilo-singolo',
    versioneSchema: DB_VERSION,
    dataEsportazione: oggiISO(),
    profili: [contenuto]
  };
}

// Esporta TUTTI i Profili registrati in un unico file, per backup totale o migrazione integrale
// di dispositivo.
export async function esportaTuttiIProfili() {
  const profili = await elencoProfili();
  const contenuti = [];
  for (const p of profili) {
    contenuti.push(await esportaContenutoProfilo(p));
  }
  return {
    app: 'financial-planner',
    formatoBackup: 'multi-profilo',
    versioneSchema: DB_VERSION,
    dataEsportazione: oggiISO(),
    profili: contenuti
  };
}

// Riconosce sia il nuovo formato ('profili': [...]) sia quello precedente all'introduzione dei
// Profili (un unico 'dati' senza involucro) — in quel caso trattato come un unico Profilo senza
// id né nome noti, da abbinare per l'utente al Profilo attivo o a uno nuovo.
function estraiProfiliDaPacchetto(pacchetto) {
  if (!pacchetto || typeof pacchetto !== 'object') {
    throw new Error('Il file selezionato non è un backup valido di FinSteady.');
  }
  if (Array.isArray(pacchetto.profili)) {
    if (pacchetto.profili.length === 0) throw new Error('Il file non contiene alcun Profilo da importare.');
    return pacchetto.profili;
  }
  if (pacchetto.dati) {
    return [{ profiloId: null, nome: null, dati: pacchetto.dati }];
  }
  throw new Error('Il file selezionato non è un backup valido di FinSteady.');
}

// Analizza un pacchetto di import e lo confronta con i Profili già presenti in locale, così la
// UI può mostrare un riepilogo esplicito (nessuna sovrascrittura senza che l'utente lo veda
// prima) e lasciare scegliere, per ciascun Profilo del file, se sostituire un Profilo esistente,
// importarlo come nuovo Profilo separato, o saltarlo. L'indice nell'array è la chiave stabile
// che collega ogni voce al Profilo corrispondente nel pacchetto originale (usata poi da
// importaPacchetto).
export async function analizzaPacchettoImport(pacchetto) {
  const profiliFile = estraiProfiliDaPacchetto(pacchetto);
  const profiliLocali = await elencoProfili();
  const attivo = await ottieniProfiloAttivo();
  const mappaLocali = new Map(profiliLocali.map((p) => [p.id, p]));

  return profiliFile.map((pf, indice) => {
    const numeroRecord = Object.values(pf.dati || {}).reduce(
      (tot, arr) => tot + (Array.isArray(arr) ? arr.length : 0), 0
    );
    // Formato precedente ai Profili (profiloId assente): l'unico confronto sensato in locale è
    // col Profilo attivo, dato che è lì che sarebbe finito quel backup prima di questa modifica.
    const esistenteLocale = pf.profiloId ? (mappaLocali.get(pf.profiloId) || null) : attivo;
    return {
      indice,
      nomeFile: pf.nome || '(Profilo di un file del formato precedente, senza nome)',
      numeroRecord,
      esistenteLocale: esistenteLocale
        ? { id: esistenteLocale.id, nome: esistenteLocale.nome, dataCreazione: esistenteLocale.dataCreazione }
        : null
    };
  });
}

// voci: il risultato di analizzaPacchettoImport, con in più il campo 'azione' scelto
// dall'utente per ciascun elemento ('sostituisci' | 'nuovo' | 'salta').
export async function importaPacchetto(pacchetto, voci) {
  const profiliFile = estraiProfiliDaPacchetto(pacchetto);

  for (const voce of voci) {
    if (voce.azione === 'salta') continue;
    const pf = profiliFile[voce.indice];
    if (!pf) continue;

    if (voce.azione === 'sostituisci' && voce.esistenteLocale) {
      const profiliLocaliAttuali = await elencoProfili();
      const profiloLocale = profiliLocaliAttuali.find((p) => p.id === voce.esistenteLocale.id);
      if (!profiloLocale) throw new Error(`Profilo locale "${voce.esistenteLocale.nome}" non più trovato.`);
      const db = await apriDbPerNome(profiloLocale.dbName);
      await scriviTuttiGliStore(db, pf.dati);
      db.close();
    } else {
      const nuovoProfilo = await creaProfilo(pf.nome || 'Profilo importato');
      const db = await apriDbPerNome(nuovoProfilo.dbName);
      await scriviTuttiGliStore(db, pf.dati);
      db.close();
    }
  }
}
