// Definizione dello schema IndexedDB per Financial Planner.
//
// Principio architetturale: questo file è l'UNICO punto in cui viene definita la struttura
// del database (nomi store, keyPath, indici). Le migrazioni future devono essere ADDITIVE:
// si aggiungono store o indici, non si eliminano né si sovrascrivono dati esistenti.
//
// Vengono creati fin da subito tutti gli store previsti dal Functional Design Document v1.0,
// anche se alcuni verranno utilizzati solo dalle fasi successive di sviluppo (Piano, Allocazioni,
// Consuntivi, Prospetti, Cicli Budget). Questo evita di dover incrementare la versione del DB
// e gestire upgrade complessi ad ogni fase.

// DB_NAME di default: il database "storico" dell'app prima dell'introduzione dei Profili.
// Diventa automaticamente il database del primo Profilo (migrazione trasparente, nessun dato
// perso). impostaNomeDatabase() lo sovrascrive PRIMA di ogni operazione, in base al Profilo
// attivo scelto in js/profili.js — va chiamato una sola volta, all'avvio dell'app, prima che
// qualunque modulo di dominio effettui la prima connessione (storage.js mette in cache la
// connessione al primo utilizzo: cambiare DB_NAME dopo non avrebbe più effetto in questa stessa
// sessione, per questo un cambio di Profilo richiede un ricaricamento della pagina).
export let DB_NAME = 'financial-planner-db';
export function impostaNomeDatabase(nome) {
  DB_NAME = nome;
}

// v3 → v4: aggiunta additiva dello store 'consuntivoObiettivoRighe' (Fase 3: il Consuntivo
// fotografa anche il dettaglio per Obiettivo, non solo Budget e Fondi). Nessuno store
// esistente viene toccato o modificato.
// v4 → v5: aggiunta additiva dello store 'allegati' (ricevute/documenti opzionali collegati a
// un'Entrata o un'Uscita). Nessuno store esistente viene toccato o modificato.
// v5 → v6: aggiunta additiva dello store 'impostazioniDashboard' (quali Azioni mostrare in
// evidenza nella Dashboard invece che dentro "Altre azioni"). Nessuno store esistente viene
// toccato o modificato.
// v6 → v7: aggiunta additiva dello store 'impostazioniSaluteFinanziaria' (Fase 5 — quale Fondo è
// designato come Fondo Emergenza, e il periodo scelto per Crescita patrimoniale/Tasso di
// risparmio). Nessuno store esistente viene toccato o modificato.
// v7 → v8: aggiunta additiva dello store 'impostazioniAllocazione' (dove instradare
// automaticamente l'eccesso quando un Piano, in Registra Entrata, non copre l'intera
// entrata — Conto o Fondo designato, invece di lasciarlo sempre come liquidità residua
// generica). Nessuno store esistente viene toccato o modificato.
// v8 → v9: aggiunta additiva, poi rimossa (vedi nota sotto), degli store 'syncOutbox',
// 'syncMeta' e 'syncConflitti' per una prima versione del Sync Cloud a sincronizzazione
// automatica per singolo record. Sostituita da un modello più semplice ("Carica sul Cloud" /
// "Scarica dal Cloud" a istantanea completa, js/sync/syncEngine.js) che non ha bisogno di
// nessuna coda o stato tecnico locale: usa direttamente domain/backup.js. Questi tre store non
// compaiono più qui sotto, quindi non vengono più creati su database nuovi; su database che li
// avevano già creati restano semplicemente inutilizzati e vuoti (rimuoverli davvero
// richiederebbe eliminarli in un upgrade IndexedDB, non necessario: non contengono mai dati
// dell'utente, solo stato tecnico transitorio).
export const DB_VERSION = 9;

// Ogni voce: { nome store, keyPath, indici: [{ nome, campo, opzioni }] }
export const STORE_DEFINITIONS = [
  {
    nome: 'conti',
    keyPath: 'id',
    indici: [
      { nome: 'stato', campo: 'stato' },
      { nome: 'ordinamento', campo: 'ordinamento' }
    ]
  },
  {
    nome: 'categorie',
    keyPath: 'id',
    indici: [
      { nome: 'ambito', campo: 'ambito' }
    ]
  },
  {
    nome: 'fondi',
    keyPath: 'id',
    indici: [
      { nome: 'contoId', campo: 'contoId' },
      { nome: 'categoriaId', campo: 'categoriaId' }
    ]
  },
  {
    nome: 'obiettivi',
    keyPath: 'id',
    indici: [
      { nome: 'fondoId', campo: 'fondoId' },
      { nome: 'stato', campo: 'stato' }
    ]
  },
  {
    nome: 'budget',
    keyPath: 'id',
    indici: [
      { nome: 'contoId', campo: 'contoId' },
      { nome: 'categoriaId', campo: 'categoriaId' }
    ]
  },
  // Store usato dalla Fase 2 (istanza di Budget per singolo ciclo/periodo)
  {
    nome: 'budgetCicli',
    keyPath: 'id',
    indici: [
      { nome: 'budgetId', campo: 'budgetId' },
      { nome: 'periodoInizio', campo: 'periodoInizio' },
      { nome: 'stato', campo: 'stato' }
    ]
  },
  // Store usato dalla Fase 2 (config. mese solare vs ciclo custom)
  {
    nome: 'impostazioniCiclo',
    keyPath: 'id',
    indici: []
  },
  // Store usati dalla Fase 1
  {
    nome: 'piano',
    keyPath: 'id',
    indici: [
      { nome: 'attivo', campo: 'attivo' }
    ]
  },
  {
    nome: 'pianoVoci',
    keyPath: 'id',
    indici: [
      { nome: 'pianoId', campo: 'pianoId' },
      { nome: 'destinazioneId', campo: 'destinazioneId' }
    ]
  },
  {
    nome: 'allocazioni',
    keyPath: 'id',
    indici: [
      { nome: 'data', campo: 'data' },
      { nome: 'contoOrigineId', campo: 'contoOrigineId' },
      { nome: 'stato', campo: 'stato' }
    ]
  },
  {
    nome: 'allocazioniRighe',
    keyPath: 'id',
    indici: [
      { nome: 'allocazioneId', campo: 'allocazioneId' },
      { nome: 'destinazioneId', campo: 'destinazioneId' }
    ]
  },
  // Uscita: pagamento reale che riduce un Fondo (o un suo Obiettivo). Mai un Budget (§5.18 FDD).
  {
    nome: 'uscite',
    keyPath: 'id',
    indici: [
      { nome: 'fondoId', campo: 'fondoId' },
      { nome: 'data', campo: 'data' }
    ]
  },
  // Trasferimento: movimento reale tra due entità che detengono valore (Conto, Fondo, Obiettivo).
  {
    nome: 'trasferimenti',
    keyPath: 'id',
    indici: [
      { nome: 'data', campo: 'data' }
    ]
  },
  // Rettifica: unico modo per correggere il saldoReale di un Conto dopo la sua creazione
  // (arrotondamenti, interessi, competenze bancarie, correzioni). Evento storico immutabile
  // come tutti gli altri movimenti: si corregge con uno Storno, mai modificando il Conto a mano.
  {
    nome: 'rettifiche',
    keyPath: 'id',
    indici: [
      { nome: 'contoId', campo: 'contoId' },
      { nome: 'data', campo: 'data' }
    ]
  },
  // Storno: evento che annulla l'effetto di un movimento precedente (riga di Allocazione,
  // Uscita o Trasferimento), senza mai modificare o eliminare il movimento originale.
  {
    nome: 'storni',
    keyPath: 'id',
    indici: [
      { nome: 'movimentoId', campo: 'movimentoId' },
      { nome: 'tipoMovimento', campo: 'tipoMovimento' }
    ]
  },
  // Store usati dalla Fase 3
  {
    nome: 'consuntivi',
    keyPath: 'id',
    indici: []
  },
  {
    nome: 'consuntivoBudgetRighe',
    keyPath: 'id',
    indici: [
      { nome: 'consuntivoId', campo: 'consuntivoId' }
    ]
  },
  {
    nome: 'consuntivoFondoRighe',
    keyPath: 'id',
    indici: [
      { nome: 'consuntivoId', campo: 'consuntivoId' }
    ]
  },
  {
    nome: 'consuntivoObiettivoRighe',
    keyPath: 'id',
    indici: [
      { nome: 'consuntivoId', campo: 'consuntivoId' }
    ]
  },
  // Store usati dalla Fase 4
  {
    nome: 'prospetti',
    keyPath: 'id',
    indici: []
  },
  {
    nome: 'prospettoElementi',
    keyPath: 'id',
    indici: [
      { nome: 'prospettoId', campo: 'prospettoId' }
    ]
  },
  // Allegati opzionali (ricevute/documenti) collegati a un'Entrata (Allocazione) o un'Uscita.
  {
    nome: 'allegati',
    keyPath: 'id',
    indici: [
      { nome: 'movimentoId', campo: 'movimentoId' }
    ]
  },
  // Preferenze Dashboard: quali Azioni mostrare in evidenza invece che dentro "Altre azioni".
  // Un solo record fisso (id: 'globale').
  {
    nome: 'impostazioniDashboard',
    keyPath: 'id',
    indici: []
  },
  // Preferenze Salute Finanziaria (Fase 5): quale Fondo è il Fondo Emergenza, periodo scelto
  // per Crescita patrimoniale/Tasso di risparmio. Un solo record fisso (id: 'globale').
  {
    nome: 'impostazioniSaluteFinanziaria',
    keyPath: 'id',
    indici: []
  },
  // Preferenze Registra Entrata: dove instradare automaticamente l'eccesso quando un Piano
  // non copre l'intera entrata (Conto o Fondo designato). Un solo record fisso (id: 'globale').
  {
    nome: 'impostazioniAllocazione',
    keyPath: 'id',
    indici: []
  }
];
