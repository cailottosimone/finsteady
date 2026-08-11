// Profili — isolamento completo tra "utenze" diverse dello stesso Financial Planner (es. una
// persona diversa, o ricominciare da capo senza perdere i dati esistenti).
//
// Scelta architetturale: NESSUN filtro applicativo (un campo "profiloId" su ogni record) — un
// database IndexedDB fisicamente separato per ciascun Profilo. È l'unico modo per garantire che
// due Profili non possano MAI interagire tra loro, anche per errore in una query dimenticata:
// non è la stessa base dati, punto. Cambiare Profilo significa cambiare quale database si apre
// (vedi db-schema.js: impostaNomeDatabase), e richiede un ricaricamento della pagina — la
// connessione a un database viene messa in cache al primo utilizzo (storage.js), quindi non può
// essere cambiata a metà sessione.
//
// Il registro dei Profili stesso (elenco + quale è attivo) vive in un database IndexedDB
// SEPARATO e FISSO (mai cambia nome), del tutto indipendente dai database dei singoli Profili.

const DB_REGISTRO = 'financial-planner-profili-registro';
const DB_REGISTRO_VERSIONE = 1;
const STORE_PROFILI = 'profili';
const STORE_STATO = 'statoGlobale';
const CHIAVE_STATO = 'globale';

// Nome del database che l'app usava PRIMA dell'introduzione dei Profili — diventa
// automaticamente il database del primo Profilo, migrazione trasparente senza perdita di dati.
const DB_STORICO_PREESISTENTE = 'financial-planner-db';

let dbRegistroPromise = null;

function apriRegistro() {
  if (dbRegistroPromise) return dbRegistroPromise;
  dbRegistroPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_REGISTRO, DB_REGISTRO_VERSIONE);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PROFILI)) {
        db.createObjectStore(STORE_PROFILI, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STATO)) {
        db.createObjectStore(STORE_STATO, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
  return dbRegistroPromise;
}

function richiestaAPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function registroTransazione(storeName, modo) {
  const db = await apriRegistro();
  const tx = db.transaction(storeName, modo);
  return tx.objectStore(storeName);
}

function generaId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function oggiISO() {
  return new Date().toISOString();
}

export async function elencoProfili() {
  const store = await registroTransazione(STORE_PROFILI, 'readonly');
  const tutti = await richiestaAPromise(store.getAll());
  return tutti.sort((a, b) => new Date(a.dataCreazione) - new Date(b.dataCreazione));
}

async function ottieniStatoGlobale() {
  const store = await registroTransazione(STORE_STATO, 'readonly');
  return richiestaAPromise(store.get(CHIAVE_STATO));
}

async function impostaStatoGlobale(stato) {
  const store = await registroTransazione(STORE_STATO, 'readwrite');
  return richiestaAPromise(store.put({ id: CHIAVE_STATO, ...stato }));
}

// Chiamata una sola volta all'avvio dell'app (prima di mostrare qualunque vista): garantisce che
// esista almeno un Profilo (creando quello di migrazione dal database preesistente, se è la
// prima volta che questa versione dell'app viene eseguita) e restituisce il Profilo attivo.
export async function inizializzaProfili() {
  let profili = await elencoProfili();

  if (profili.length === 0) {
    const migrato = {
      id: generaId(),
      nome: 'Predefinito',
      dbName: DB_STORICO_PREESISTENTE,
      dataCreazione: oggiISO()
    };
    const store = await registroTransazione(STORE_PROFILI, 'readwrite');
    await richiestaAPromise(store.add(migrato));
    await impostaStatoGlobale({ profiloAttivoId: migrato.id });
    profili = [migrato];
  }

  let stato = await ottieniStatoGlobale();
  if (!stato || !profili.some((p) => p.id === stato.profiloAttivoId)) {
    // Nessuno stato salvato, o punta a un Profilo nel frattempo eliminato: torna al primo.
    stato = { profiloAttivoId: profili[0].id };
    await impostaStatoGlobale(stato);
  }

  return profili.find((p) => p.id === stato.profiloAttivoId);
}

export async function ottieniProfiloAttivo() {
  const [profili, stato] = await Promise.all([elencoProfili(), ottieniStatoGlobale()]);
  return profili.find((p) => p.id === stato?.profiloAttivoId) || profili[0];
}

export async function creaProfilo(nome) {
  if (!nome || !nome.trim()) throw new Error('Il nome del Profilo è obbligatorio.');
  const profilo = {
    id: generaId(),
    nome: nome.trim(),
    dbName: `financial-planner-db-${generaId()}`,
    dataCreazione: oggiISO()
  };
  const store = await registroTransazione(STORE_PROFILI, 'readwrite');
  await richiestaAPromise(store.add(profilo));
  return profilo;
}

export async function rinominaProfilo(id, nome) {
  if (!nome || !nome.trim()) throw new Error('Il nome del Profilo è obbligatorio.');
  const store = await registroTransazione(STORE_PROFILI, 'readwrite');
  const esistente = await richiestaAPromise(store.get(id));
  if (!esistente) throw new Error('Profilo non trovato.');
  await richiestaAPromise(store.put({ ...esistente, nome: nome.trim() }));
}

// Elimina il Profilo dal registro E cancella fisicamente il suo database (azione distruttiva e
// irreversibile su TUTTI i suoi dati — la UI deve chiedere una doppia conferma esplicita).
// Non consente di eliminare il Profilo attivo (va cambiato profilo prima) né l'ultimo rimasto.
export async function eliminaProfilo(id) {
  const [profili, statoAttuale] = await Promise.all([elencoProfili(), ottieniStatoGlobale()]);
  if (profili.length <= 1) throw new Error('Non puoi eliminare l\'unico Profilo esistente.');
  if (statoAttuale?.profiloAttivoId === id) {
    throw new Error('Non puoi eliminare il Profilo attivo: cambia prima profilo.');
  }
  const profilo = profili.find((p) => p.id === id);
  if (!profilo) throw new Error('Profilo non trovato.');

  const store = await registroTransazione(STORE_PROFILI, 'readwrite');
  await richiestaAPromise(store.delete(id));

  await new Promise((resolve, reject) => {
    const richiesta = indexedDB.deleteDatabase(profilo.dbName);
    richiesta.onsuccess = () => resolve();
    richiesta.onerror = () => reject(richiesta.error);
    richiesta.onblocked = () => resolve(); // il database verrà comunque rimosso appena libero
  });
}

export async function impostaProfiloAttivo(id) {
  const profili = await elencoProfili();
  if (!profili.some((p) => p.id === id)) throw new Error('Profilo non trovato.');
  await impostaStatoGlobale({ profiloAttivoId: id });
}
