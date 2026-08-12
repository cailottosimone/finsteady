// Dominio: Prospetto (Fase 4) — simulazione pura, mai persistita nei dati reali: proietta la
// crescita di Fondi/Obiettivi applicando ripetutamente le Voci di un Piano scelto,
// su un orizzonte temporale esplicito (data inizio + numero di mesi, oppure data inizio + data
// fine).
//
// "Non modifica alcun dato" (definizione del modello concettuale): il Prospetto salva solo la
// propria CONFIGURAZIONE. Il calcolo della proiezione è sempre ricalcolato dal vivo, mai
// persistito — stessa filosofia di calcolo dinamico già usata per Obiettivi/Fondi (§2.5/§5.7
// FDD). Più Prospetti sono sempre liberamente confrontabili tra loro.
//
// CONCATENAMENTO (segnalato dall'utente): un Prospetto può "partire da" un altro Prospetto
// invece che dalla situazione reale attuale — la sua data inizio diventa automaticamente la
// data fine dell'altro + 1 giorno, e i suoi saldi di partenza vengono ereditati dal risultato
// finale proiettato di quello — non dai saldi reali. Concatenabile per un numero qualunque di
// passaggi (A→B→C→...), con protezione esplicita contro catene circolari.

import { dbAdd, dbGet, dbGetAll, dbGetAllByIndex, dbPut, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO, formattaData } from '../utils/dateUtils.js';
import { elencoVociPerPiano } from './piano.js';
import { elencoFondi } from './fondi.js';
import { elencoObiettivi } from './obiettivi.js';
import { elencoBudget } from './budget.js';
import { calcolaProiezione, applicaImportoADestinazione } from '../engine/prospettoCalc.js';
import { calcolaRichiestaDaPiano } from '../engine/allocationEngine.js';
import { arrotonda } from '../utils/denaro.js';

const STORE = 'prospetti';
const STORE_ELEMENTI = 'prospettoElementi';

// Descrizione fissa assegnata alle righe generate da trasferisciRidistribuisciProspetto —
// usata anche dalla UI (viewProspetti.js) per distinguere Movimenti manuali (nessuna di queste
// descrizioni) da Trasferimenti/Ridistribuzioni (questa descrizione; distinti tra loro dal
// numero di destinazioni con lo stesso gruppoId: una sola = Trasferimento, più di una =
// Ridistribuzione) e da ricalcolaProspetto per individuare le righe da correggere.
export const DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE = 'Trasferimento/ridistribuzione a fine Prospetto';

// new Date("YYYY-MM-DD") viene interpretato come mezzanotte UTC, non mezzanotte locale: nei
// fusi orari indietro rispetto a UTC questo fa scivolare la data indietro di un giorno una volta
// letta con i getter locali (getDate/getMonth/getFullYear). Non si manifesta con un fuso avanti
// rispetto a UTC (es. l'Italia), ma resta un parsing scorretto in generale — qui si costruisce
// sempre la data esplicitamente in locale.
function parseDataLocale(valore) {
  const s = String(valore).slice(0, 10);
  const [anno, mese, giorno] = s.split('-').map(Number);
  return new Date(anno, mese - 1, giorno);
}

function formatDataLocale(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Conta quante volte il giorno `giorno` di ogni mese ricorre tra dataAncoraggio (inclusa, se la
// sua occorrenza in quel mese non è già passata rispetto a dataAncoraggio) e dataFine (inclusa).
// Gestisce i mesi più corti del giorno richiesto (es. giorno 31 in un mese di 30 giorni) usando
// l'ultimo giorno disponibile di quel mese.
//
// Regola cruciale, segnalata due volte dall'utente con esempi precisi: la prima occorrenza è la
// più vicina data (a partire dal mese di dataAncoraggio) che sia >= dataAncoraggio — MAI ">"
// (altrimenti, quando dataAncoraggio stesso è il giorno del ciclo, verrebbe scartato per
// errore: es. Prospetto dall'1 ottobre al 31 dicembre con ciclo il giorno 1 deve contare 3,
// non 2). Se invece dataAncoraggio è una data arbitraria diversa dal giorno del ciclo (es.
// "oggi" 26 luglio con stipendio il 15), la stessa regola sposta correttamente la prima
// occorrenza al mese successivo (15 luglio è già passato rispetto al 26) — es. dal 26 luglio a
// fine anno con stipendio il 15: 5 occorrenze (agosto-dicembre), non 6; con stipendio il 28
// (non ancora passato il 26 luglio): 6 occorrenze (anche luglio).
function contaOccorrenzeGiorno(dataAncoraggio, giorno, dataFine) {
  const fine = parseDataLocale(dataFine);
  let cursore = new Date(dataAncoraggio.getFullYear(), dataAncoraggio.getMonth(), 1);

  const ultimoGiornoQuestoMese = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 0).getDate();
  const candidataQuestoMese = new Date(cursore.getFullYear(), cursore.getMonth(), Math.min(giorno, ultimoGiornoQuestoMese));
  if (candidataQuestoMese < dataAncoraggio) {
    cursore = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 1);
  }

  let occorrenze = 0;
  while (true) {
    const ultimoGiornoMese = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 0).getDate();
    const candidata = new Date(cursore.getFullYear(), cursore.getMonth(), Math.min(giorno, ultimoGiornoMese));
    if (candidata > fine) break;
    occorrenze++;
    cursore = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 1);
  }
  return occorrenze;
}

// Stessa identica logica di contaOccorrenzeGiorno, ma restituisce l'elenco delle date effettive
// invece di limitarsi a contarle — necessaria per posizionare gli eventi di un Piano o di un
// movimento ripetitivo sul calendario reale (grafico dettagliato del Prospetto).
function generaOccorrenzeGiorno(dataAncoraggio, giorno, dataFine) {
  const fine = parseDataLocale(dataFine);
  let cursore = new Date(dataAncoraggio.getFullYear(), dataAncoraggio.getMonth(), 1);

  const ultimoGiornoQuestoMese = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 0).getDate();
  const candidataQuestoMese = new Date(cursore.getFullYear(), cursore.getMonth(), Math.min(giorno, ultimoGiornoQuestoMese));
  if (candidataQuestoMese < dataAncoraggio) {
    cursore = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 1);
  }

  const date = [];
  while (true) {
    const ultimoGiornoMese = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 0).getDate();
    const candidata = new Date(cursore.getFullYear(), cursore.getMonth(), Math.min(giorno, ultimoGiornoMese));
    if (candidata > fine) break;
    date.push(candidata);
    cursore = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 1);
  }
  return date;
}


// Data fine effettiva di un Prospetto: esplicita per l'orizzonte "data", calcolata da
// dataInizio + numeroMesi per l'orizzonte "mesi".
export function calcolaDataFineEffettiva(prospetto) {
  if (prospetto.tipoOrizzonte === 'data') return prospetto.dataFine;
  const inizio = parseDataLocale(prospetto.dataInizio || formatDataLocale(new Date()));
  const fine = new Date(inizio.getFullYear(), inizio.getMonth() + Number(prospetto.numeroMesi || 1), inizio.getDate());
  return formatDataLocale(fine);
}

// Un Prospetto bloccato non può essere modificato (configurazione, movimenti manuali, saldi di
// partenza personalizzati, voci di autonomia, Trasferisci/Ridistribuisci, Obiettivi monitorati):
// un solo tasto per evitare modifiche involontarie a una simulazione già definita. Calcolare la
// proiezione, confrontare, stampare o duplicare restano sempre liberi anche da bloccato.
async function garantisciProspettoModificabile(prospettoId) {
  const p = await dbGet(STORE, prospettoId);
  if (p?.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
}

async function verificaNonCircolare(prospettoId, origineId) {
  let corrente = origineId;
  const visitati = new Set();
  while (corrente) {
    if (corrente === prospettoId) {
      throw new Error('Concatenamento circolare: un Prospetto non può partire (anche indirettamente) da se stesso.');
    }
    if (visitati.has(corrente)) break;
    visitati.add(corrente);
    const p = await dbGet(STORE, corrente);
    if (!p) break;
    corrente = p.prospettoOrigineId;
  }
}

export async function elencoProspetti() {
  const tutti = await dbGetAll(STORE);
  return tutti.sort((a, b) => new Date(b.dataCreazione) - new Date(a.dataCreazione));
}

function validaParametriOrizzonte({ tipoOrizzonte, numeroMesi, dataFine }) {
  if (!['mesi', 'data'].includes(tipoOrizzonte)) throw new Error('Tipo di orizzonte non valido.');
  if (tipoOrizzonte === 'mesi' && (!numeroMesi || Number(numeroMesi) <= 0)) {
    throw new Error('Indica un numero di mesi maggiore di zero.');
  }
  if (tipoOrizzonte === 'data' && !dataFine) {
    throw new Error('Indica la data fino a cui proiettare.');
  }
}

async function risolviDataInizio(prospettoOrigineId, dataInizio) {
  if (!prospettoOrigineId) return dataInizio || formatDataLocale(new Date());
  const origine = await dbGet(STORE, prospettoOrigineId);
  if (!origine) throw new Error('Il Prospetto di origine selezionato non esiste.');
  const fineOrigine = parseDataLocale(calcolaDataFineEffettiva(origine));
  fineOrigine.setDate(fineOrigine.getDate() + 1);
  return formatDataLocale(fineOrigine);
}

export async function creaProspetto({
  nome, pianoId, tipoOrizzonte, numeroMesi, dataFine, importoEntrataPerCiclo, dataInizio, prospettoOrigineId, giornoCiclo
}) {
  if (!nome || !nome.trim()) throw new Error('Il nome del Prospetto è obbligatorio.');
  validaParametriOrizzonte({ tipoOrizzonte, numeroMesi, dataFine });

  const haPiano = !!pianoId;
  let importo = 0;
  if (haPiano) {
    importo = Number(importoEntrataPerCiclo);
    if (!importo || importo <= 0) throw new Error('Indica un importo di entrata ipotizzato per ciclo maggiore di zero.');
  }

  const origineId = prospettoOrigineId || null;
  const dataInizioEffettiva = await risolviDataInizio(origineId, dataInizio);
  if (tipoOrizzonte === 'data' && parseDataLocale(dataFine) < parseDataLocale(dataInizioEffettiva)) {
    throw new Error('La data fine non può essere precedente alla data inizio.');
  }
  // Giorno del ciclo (es. il giorno dello stipendio): può differire dal giorno di dataInizio,
  // quando si comincia a proiettare da una data arbitraria (es. "oggi") diversa dal giorno in
  // cui il ciclo realmente si apre — segnalato dall'utente con un esempio preciso. Se non
  // indicato, di default coincide con il giorno di dataInizio (il caso più comune: si apre il
  // Prospetto esattamente il giorno in cui arriva lo stipendio).
  const giornoCicloEffettivo = giornoCiclo ? Number(giornoCiclo) : parseDataLocale(dataInizioEffettiva).getDate();
  if (giornoCicloEffettivo < 1 || giornoCicloEffettivo > 31) throw new Error('Indica un giorno del ciclo valido (1-31).');

  const prospetto = {
    id: generaId(),
    nome: nome.trim(),
    pianoId: haPiano ? pianoId : null,
    dataInizio: dataInizioEffettiva,
    giornoCiclo: giornoCicloEffettivo,
    prospettoOrigineId: origineId,
    tipoOrizzonte,
    numeroMesi: tipoOrizzonte === 'mesi' ? Number(numeroMesi) : null,
    dataFine: tipoOrizzonte === 'data' ? dataFine : null,
    importoEntrataPerCiclo: importo,
    bloccato: false,
    obiettiviMonitorati: null,
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE, prospetto);
  return prospetto;
}

export async function aggiornaProspetto(id, {
  nome, pianoId, tipoOrizzonte, numeroMesi, dataFine, importoEntrataPerCiclo, dataInizio, prospettoOrigineId, giornoCiclo
}) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Prospetto non trovato.');
  if (esistente.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
  if (!nome || !nome.trim()) throw new Error('Il nome del Prospetto è obbligatorio.');
  validaParametriOrizzonte({ tipoOrizzonte, numeroMesi, dataFine });

  const haPiano = !!pianoId;
  let importo = 0;
  if (haPiano) {
    importo = Number(importoEntrataPerCiclo);
    if (!importo || importo <= 0) throw new Error('Indica un importo di entrata ipotizzato per ciclo maggiore di zero.');
  }

  const origineId = prospettoOrigineId || null;
  if (origineId) {
    if (origineId === id) throw new Error('Un Prospetto non può partire da se stesso.');
    await verificaNonCircolare(id, origineId);
  }
  const dataInizioEffettiva = await risolviDataInizio(origineId, dataInizio || esistente.dataInizio);
  if (tipoOrizzonte === 'data' && parseDataLocale(dataFine) < parseDataLocale(dataInizioEffettiva)) {
    throw new Error('La data fine non può essere precedente alla data inizio.');
  }
  const giornoCicloEffettivo = giornoCiclo ? Number(giornoCiclo) : (esistente.giornoCiclo || parseDataLocale(dataInizioEffettiva).getDate());
  if (giornoCicloEffettivo < 1 || giornoCicloEffettivo > 31) throw new Error('Indica un giorno del ciclo valido (1-31).');

  const aggiornato = {
    ...esistente,
    nome: nome.trim(),
    pianoId: haPiano ? pianoId : null,
    dataInizio: dataInizioEffettiva,
    giornoCiclo: giornoCicloEffettivo,
    prospettoOrigineId: origineId,
    tipoOrizzonte,
    numeroMesi: tipoOrizzonte === 'mesi' ? Number(numeroMesi) : null,
    dataFine: tipoOrizzonte === 'data' ? dataFine : null,
    importoEntrataPerCiclo: importo
  };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

export async function eliminaProspetto(id) {
  const elementi = await dbGetAllByIndex(STORE_ELEMENTI, 'prospettoId', id);
  await Promise.all(elementi.map((e) => dbDelete(STORE_ELEMENTI, e.id)));
  await dbDelete(STORE, id);
}

// Blocca/sblocca un Prospetto: da bloccato, la sua configurazione non è più modificabile (vedi
// garantisciProspettoModificabile). Bypassa volutamente quel controllo: sbloccare deve essere
// sempre possibile. Calcolare/vedere la proiezione, confrontare, stampare e duplicare restano
// sempre liberi, anche da bloccato.
export async function impostaBloccoProspetto(id, bloccato) {
  const esistente = await dbGet(STORE, id);
  if (!esistente) throw new Error('Prospetto non trovato.');
  const aggiornato = { ...esistente, bloccato: !!bloccato };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// Quali Obiettivi includere nel calcolo di "Obiettivi finanziati"/"Obiettivi in ritardo" di
// questo specifico Prospetto (Salute Finanziaria) — utile quando il Prospetto convive con
// Obiettivi non pertinenti al periodo simulato (es. Obiettivi già pianificati per l'anno
// successivo). `null` = non ancora configurato esplicitamente: si mantiene il comportamento
// storico (tutti gli Obiettivi proiettati), per non alterare Prospetti creati prima di questa
// funzionalità. Un array (anche vuoto) è invece una scelta esplicita dell'utente e va sempre
// rispettata così com'è.
export async function impostaObiettiviMonitoratiProspetto(prospettoId, idObiettivi) {
  await garantisciProspettoModificabile(prospettoId);
  const esistente = await dbGet(STORE, prospettoId);
  if (!esistente) throw new Error('Prospetto non trovato.');
  const aggiornato = { ...esistente, obiettiviMonitorati: Array.isArray(idObiettivi) ? idObiettivi : null };
  await dbPut(STORE, aggiornato);
  return aggiornato;
}

// Duplica un Prospetto e tutta la sua configurazione (movimenti manuali, saldi di partenza
// personalizzati, voci di autonomia, Obiettivi monitorati): 100% nuove entità, nessun
// collegamento con l'originale. La copia nasce sempre sbloccata, così da poter essere
// modificata subito. I gruppi di movimenti (gruppoId, es. una Ridistribuzione) restano
// riconoscibili come gruppo anche nella copia, con un nuovo gruppoId generato una sola volta
// per gruppo.
export async function duplicaProspetto(id) {
  const originale = await dbGet(STORE, id);
  if (!originale) throw new Error('Prospetto non trovato.');
  const copia = {
    ...originale,
    id: generaId(),
    nome: `Copia di ${originale.nome}`,
    bloccato: false,
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE, copia);

  const elementiOriginali = await dbGetAllByIndex(STORE_ELEMENTI, 'prospettoId', id);
  const mappaGruppi = new Map(); // vecchio gruppoId -> nuovo gruppoId
  const elementiCopiati = [];
  for (const el of elementiOriginali) {
    let nuovoGruppoId = el.gruppoId;
    if (el.gruppoId) {
      if (!mappaGruppi.has(el.gruppoId)) mappaGruppi.set(el.gruppoId, generaId());
      nuovoGruppoId = mappaGruppi.get(el.gruppoId);
    }
    const copiaElemento = { ...el, id: generaId(), prospettoId: copia.id, gruppoId: nuovoGruppoId };
    await dbAdd(STORE_ELEMENTI, copiaElemento);
    elementiCopiati.push(copiaElemento);
  }
  return { copia, elementiCopiati };
}

// --- Movimenti manuali del Prospetto ---
//
// Oltre al Piano, un Prospetto può includere movimenti manuali ipotizzati
// dall'utente, non legati a nessun Piano. Tre tipi:
// - 'ripetitivo': si applica una volta per ciclo fino al proprio numero di occorrenze (per
//   l'orizzonte "data", dipende dal giorno del mese scelto rispetto alla data inizio);
// - 'singolo': si applica una sola volta, nel ciclo in cui cade la sua data (rispetto alla
//   data inizio del Prospetto — non necessariamente "oggi", se il Prospetto è concatenato);
// - le righe di "Trasferisci/Ridistribuisci Prospetto" sono anch'esse 'singolo', create in
//   blocco all'ultimo ciclo dell'orizzonte (vedi trasferisciRidistribuisciProspetto).
// Tutti riguardano solo Fondi/Obiettivi. Pura simulazione: non modifica alcun dato reale.
//
// DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE (esportata più sotto) marca le righe generate da
// trasferisciRidistribuisciProspetto: usata dalla UI per distinguere Movimenti manuali (nessuna
// di queste descrizioni) da Trasferimenti/Ridistribuzioni (questa descrizione, distinti tra
// loro dal numero di destinazioni nello stesso gruppoId: una sola = Trasferimento, più di una =
// Ridistribuzione).
export async function elencoMovimentiProspetto(prospettoId) {
  const tutti = await dbGetAllByIndex(STORE_ELEMENTI, 'prospettoId', prospettoId);
  return tutti
    .filter((e) => (e.categoria || 'movimento') === 'movimento')
    .sort((a, b) => new Date(a.dataCreazione) - new Date(b.dataCreazione));
}

function validaDatiComuniMovimento(dati) {
  if (!['ripetitivo', 'singolo'].includes(dati.tipo)) throw new Error('Tipo di movimento non valido.');
  if (dati.tipo === 'ripetitivo') {
    const giorno = Number(dati.giornoMese);
    if (!giorno || giorno < 1 || giorno > 31) throw new Error('Indica un giorno del mese valido (1-31).');
  } else if (!dati.data) {
    throw new Error('Indica la data in cui applicare il movimento.');
  }
}

export async function aggiungiMovimentoProspetto(prospettoId, dati) {
  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');
  if (prospetto.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
  validaDatiComuniMovimento(dati);
  if (!['fondo', 'obiettivo'].includes(dati.tipoDestinazione)) throw new Error('Seleziona un Fondo o un Obiettivo come destinazione.');
  if (!dati.destinazioneId) throw new Error('Seleziona una destinazione per il movimento.');
  const importo = Number(dati.importo);
  if (!importo) throw new Error('Indica un importo diverso da zero (positivo per un\'entrata, negativo per un\'uscita).');

  const id = generaId();
  const movimento = {
    id,
    gruppoId: id,
    categoria: 'movimento',
    prospettoId,
    tipo: dati.tipo,
    giornoMese: dati.tipo === 'ripetitivo' ? Number(dati.giornoMese) : null,
    data: dati.tipo === 'singolo' ? dati.data : null,
    importo,
    tipoDestinazione: dati.tipoDestinazione,
    destinazioneId: dati.destinazioneId,
    descrizione: dati.descrizione ? dati.descrizione.trim() : '',
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE_ELEMENTI, movimento);
  return movimento;
}

// Crea più righe di movimento in un colpo solo, quando un unico evento va distribuito su più
// Obiettivi di un Fondo — stesso principio usato in Piano→"Collega Movimenti". Le righe
// condividono un gruppoId, per poterle riconoscere ed eliminare insieme.
export async function aggiungiMovimentiProspettoMultipli(prospettoId, datiComuni, righe) {
  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');
  if (prospetto.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
  validaDatiComuniMovimento(datiComuni);
  if (!righe || righe.length === 0) throw new Error('Seleziona almeno un Obiettivo su cui distribuire il movimento.');

  const gruppoId = generaId();
  const creati = [];
  for (const riga of righe) {
    const importo = Number(riga.importo);
    if (!importo) continue;
    const movimento = {
      id: generaId(),
      gruppoId,
      categoria: 'movimento',
      prospettoId,
      tipo: datiComuni.tipo,
      giornoMese: datiComuni.tipo === 'ripetitivo' ? Number(datiComuni.giornoMese) : null,
      data: datiComuni.tipo === 'singolo' ? datiComuni.data : null,
      importo,
      tipoDestinazione: 'obiettivo',
      destinazioneId: riga.destinazioneId,
      descrizione: datiComuni.descrizione ? datiComuni.descrizione.trim() : '',
      dataCreazione: oggiISO()
    };
    await dbAdd(STORE_ELEMENTI, movimento);
    creati.push(movimento);
  }
  if (creati.length === 0) throw new Error('Nessun importo diverso da zero da distribuire: nulla è stato creato.');
  return creati;
}

// "Trasferisci/Ridistribuisci Prospetto" — segnalato dall'utente con un esempio concreto: il
// Fondo "Spese 2026" avanza 300€ a fine anno nella simulazione, che si vogliono spostare su
// "Spese 2027" per avere una vista corretta. Preleva il saldo finale proiettato di un
// Fondo/Obiettivo/Conto e lo sposta su una o più destinazioni, all'ultimo ciclo dell'orizzonte —
// pura simulazione: crea movimenti 'singolo' raggruppati (uno o più in uscita dall'origine, uno
// o più in entrata sulle destinazioni), riusando l'infrastruttura già esistente. NESSUNA
// validazione reale viene richiamata qui (a differenza di un vero Trasferimento): non è
// patrimonio reale, è solo un numero proiettato che cambia colonna nella simulazione — può
// scendere sotto qualunque soglia, incluso il totale dei suoi Obiettivi.
//
// Origine 'conto': il Conto non è mai proiettato direttamente (§ solo Fondi/Obiettivi crescono
// nel tempo nel modello) — prelevarne "il saldo complessivo" significa prelevare per intero
// ciascuno dei suoi Fondi, liberando l'intero patrimonio che il Conto rappresenta nella
// proiezione. Per questo, con origine 'conto', le destinazioni devono sommare esattamente al
// saldo proiettato del Conto (nessun euro creato o perso, anche in simulazione).
// destinazioni: [{ tipo: 'fondo'|'obiettivo', id, importo }]
// Costruisce le righe di drenaggio di un Fondo per un importo dato (parziale o pari all'intero
// saldo), gerarchicamente: prima il residuo non vincolato (Fondo.saldo meno la somma dei suoi
// Obiettivi), poi — solo se l'importo richiesto lo supera — proporzionalmente dagli Obiettivi
// stessi. Se l'importo richiesto coincide con l'intero saldo del Fondo, questo equivale a
// drenare per intero ciascun Obiettivo più il residuo (nessun caso speciale separato).
//
// Necessario perché drenare un Fondo genericamente (tipoDestinazione:'fondo') riduce solo il
// suo saldo aggregato, mai il saldoAccumulato dei suoi Obiettivi — bug segnalato dall'utente
// con un esempio preciso: Obiettivo partito da 50, cresciuto a 80; un drenaggio generico
// lasciava saldoAccumulato a 80 pur avendo prelevato il Fondo; riassegnando poi 60
// all'Obiettivo (drill-down gerarchico in ingresso) si arrivava a 140 invece di 60.
function costruisciRigheDrenaggioFondo(fondoProiettato, obiettiviDelFondoProiettati, importoDaDrenare) {
  const totaleObiettivi = arrotonda(obiettiviDelFondoProiettati.reduce((s, o) => s + o.saldoAccumulato, 0));
  const residuoNonVincolato = arrotonda(fondoProiettato.saldo - totaleObiettivi);
  const righe = [];

  let daDrenare = importoDaDrenare;
  const dalResiduo = Math.min(daDrenare, Math.max(residuoNonVincolato, 0));
  if (Math.abs(dalResiduo) >= 0.005) {
    righe.push({ tipoDestinazione: 'fondo', destinazioneId: fondoProiettato.id, importo: -dalResiduo });
    daDrenare = arrotonda(daDrenare - dalResiduo);
  }

  if (daDrenare >= 0.005 && totaleObiettivi > 0) {
    let cumulato = 0;
    obiettiviDelFondoProiettati.forEach((o, indice) => {
      const quota = indice === obiettiviDelFondoProiettati.length - 1
        ? arrotonda(daDrenare - cumulato)
        : arrotonda(daDrenare * (o.saldoAccumulato / totaleObiettivi));
      cumulato = arrotonda(cumulato + quota);
      if (Math.abs(quota) >= 0.005) righe.push({ tipoDestinazione: 'obiettivo', destinazioneId: o.id, importo: -quota });
    });
  }
  return righe;
}

export async function trasferisciRidistribuisciProspetto(prospettoId, { origineTipo, origineId, destinazioni, nonAllocatoUsato = 0 }) {
  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');
  if (prospetto.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
  if (!['fondo', 'obiettivo', 'conto'].includes(origineTipo)) {
    throw new Error('Seleziona un Fondo, un Obiettivo o un Conto come origine.');
  }
  if (!origineId) throw new Error('Seleziona l\'origine da cui prelevare il saldo finale.');
  if (!destinazioni || destinazioni.length === 0) throw new Error('Seleziona almeno una destinazione.');

  const totale = destinazioni.reduce((s, d) => s + (Number(d.importo) || 0), 0);
  if (!totale || totale <= 0) throw new Error('Indica almeno un importo maggiore di zero da distribuire.');

  const nonAllocatoRichiesto = arrotonda(Number(nonAllocatoUsato) || 0);
  if (nonAllocatoRichiesto > 0) {
    const risultatoControllo = await calcolaProiezioneProspettoInterno(prospetto, new Set());
    if (nonAllocatoRichiesto - risultatoControllo.nonAllocatoDisponibile > 0.01) {
      throw new Error(
        `Ci sono solo ${risultatoControllo.nonAllocatoDisponibile.toFixed(2)} € di non allocati disponibili.`
      );
    }
  }
  // Il totale delle destinazioni deve coincidere con l'origine PIÙ l'eventuale quota di non
  // allocati inclusa (richiesto dall'utente: "distribuisci anche i non allocati", aggiungendo
  // al saldo allocabile l'eccesso non usato) — non solo con l'origine da sola.
  const totaleAtteso = (importoOrigine) => arrotonda(importoOrigine + nonAllocatoRichiesto);

  const dataEvento = calcolaDataFineEffettiva(prospetto);
  const gruppoId = generaId();
  const now = oggiISO();
  const descrizione = DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE;
  const creati = [];

  const salvaRigheDrenaggio = async (righeDrenaggio) => {
    for (const r of righeDrenaggio) {
      const riga = {
        id: generaId(), gruppoId, categoria: 'movimento', prospettoId,
        tipo: 'singolo', giornoMese: null, data: dataEvento,
        importo: r.importo, tipoDestinazione: r.tipoDestinazione, destinazioneId: r.destinazioneId,
        descrizione, dataCreazione: now
      };
      await dbAdd(STORE_ELEMENTI, riga);
      creati.push(riga);
    }
  };

  if (origineTipo === 'conto') {
    const risultato = await calcolaProiezioneProspettoInterno(prospetto, new Set());
    const fondiDelConto = risultato.fondiProiettati.filter((f) => {
      const attuale = risultato.fondiAttuali.find((x) => x.id === f.id);
      return attuale && attuale.contoId === origineId;
    });
    if (fondiDelConto.length === 0) throw new Error('Questo Conto non ha Fondi da ridistribuire nella proiezione.');
    const totaleConto = arrotonda(fondiDelConto.reduce((s, f) => s + f.saldo, 0));
    if (Math.abs(totaleAtteso(totaleConto) - totale) > 0.01) {
      throw new Error(
        `Il Conto ha un saldo proiettato di ${totaleConto.toFixed(2)} €${nonAllocatoRichiesto > 0 ? ` (+ ${nonAllocatoRichiesto.toFixed(2)} € non allocati)` : ''}: la somma delle destinazioni (${totale.toFixed(2)} €) deve coincidere esattamente.`
      );
    }
    for (const f of fondiDelConto) {
      const obiettiviDelFondo = risultato.obiettiviProiettati.filter((o) => {
        const attualeO = risultato.obiettiviAttuali.find((x) => x.id === o.id);
        return attualeO && attualeO.fondoId === f.id;
      });
      await salvaRigheDrenaggio(costruisciRigheDrenaggioFondo(f, obiettiviDelFondo, f.saldo));
    }
  } else if (origineTipo === 'fondo') {
    // Stessa correzione, anche per un prelievo parziale (non necessariamente l'intero saldo):
    // serve la proiezione corrente per conoscere gli Obiettivi di questo Fondo.
    const risultato = await calcolaProiezioneProspettoInterno(prospetto, new Set());
    const fondoProiettato = risultato.fondiProiettati.find((f) => f.id === origineId);
    if (!fondoProiettato) throw new Error('Fondo non trovato nella proiezione.');
    if (totale - totaleAtteso(fondoProiettato.saldo) > 0.01) {
      throw new Error(`Il Fondo ha solo ${fondoProiettato.saldo.toFixed(2)} € proiettati${nonAllocatoRichiesto > 0 ? ` (+ ${nonAllocatoRichiesto.toFixed(2)} € non allocati)` : ''}: non puoi prelevarne di più.`);
    }
    const daDrenareOra = Math.min(totale, fondoProiettato.saldo);
    const obiettiviDelFondo = risultato.obiettiviProiettati.filter((o) => {
      const attualeO = risultato.obiettiviAttuali.find((x) => x.id === o.id);
      return attualeO && attualeO.fondoId === origineId;
    });
    await salvaRigheDrenaggio(costruisciRigheDrenaggioFondo(fondoProiettato, obiettiviDelFondo, daDrenareOra));
  } else {
    const risultato = await calcolaProiezioneProspettoInterno(prospetto, new Set());
    const obiettivoProiettato = risultato.obiettiviProiettati.find((o) => o.id === origineId);
    if (!obiettivoProiettato) throw new Error('Obiettivo non trovato nella proiezione.');
    if (totale - totaleAtteso(obiettivoProiettato.saldoAccumulato) > 0.01) {
      throw new Error(`L'Obiettivo ha solo ${obiettivoProiettato.saldoAccumulato.toFixed(2)} € proiettati${nonAllocatoRichiesto > 0 ? ` (+ ${nonAllocatoRichiesto.toFixed(2)} € non allocati)` : ''}: non puoi prelevarne di più.`);
    }
    const daDrenareOra = Math.min(totale, obiettivoProiettato.saldoAccumulato);
    const rigaOrigine = {
      id: generaId(), gruppoId, categoria: 'movimento', prospettoId,
      tipo: 'singolo', giornoMese: null, data: dataEvento,
      importo: -daDrenareOra, tipoDestinazione: origineTipo, destinazioneId: origineId,
      descrizione, dataCreazione: now
    };
    await dbAdd(STORE_ELEMENTI, rigaOrigine);
    creati.push(rigaOrigine);
  }

  if (nonAllocatoRichiesto > 0) {
    const rigaNonAllocato = {
      id: generaId(), gruppoId, categoria: 'movimento', prospettoId,
      tipo: 'singolo', giornoMese: null, data: dataEvento,
      importo: -nonAllocatoRichiesto, tipoDestinazione: 'nonAllocato', destinazioneId: null,
      descrizione, dataCreazione: now
    };
    await dbAdd(STORE_ELEMENTI, rigaNonAllocato);
    creati.push(rigaNonAllocato);
  }

  for (const d of destinazioni) {
    const importo = Number(d.importo);
    if (!importo) continue;
    const riga = {
      id: generaId(), gruppoId, categoria: 'movimento', prospettoId,
      tipo: 'singolo', giornoMese: null, data: dataEvento,
      importo, tipoDestinazione: d.tipo, destinazioneId: d.id,
      descrizione, dataCreazione: now
    };
    await dbAdd(STORE_ELEMENTI, riga);
    creati.push(riga);
  }
  if (creati.length === 0) throw new Error('Nessun movimento creato: verifica gli importi.');
  return creati;
}

// Ricalcola un Prospetto creato PRIMA della correzione del doppio conteggio (segnalato
// dall'utente: un drenaggio generico di un Fondo con Obiettivi non riduceva il loro
// saldoAccumulato, causando importi esagerati quando poi si riassegnava denaro a uno di essi).
// I movimenti "Trasferisci/Ridistribuisci" già salvati contengono ancora gli importi calcolati
// con la vecchia logica: qui si rigiocano in ordine cronologico (l'ordine in cui sono stati
// creati) su una simulazione di lavoro, sostituendo ogni drenaggio generico di un Fondo che ha
// Obiettivi con l'equivalente gerarchico corretto (stesso importo assoluto totale, ripartito
// stavolta correttamente tra residuo non vincolato e Obiettivi) — senza toccare nient'altro:
// Piano, movimenti ripetitivi/singoli "normali" e le righe di destinazione (mai state
// sbagliate) restano identici.
export async function ricalcolaProspetto(prospettoId) {
  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');

  let vociPiano = [];
  if (prospetto.pianoId) vociPiano = await elencoVociPerPiano(prospetto.pianoId);

  const baseline = await risolviBaseline(prospetto, new Set());
  const overrideSaldi = await elencoSaldiPartenzaProspetto(prospettoId);
  const mappaOverrideFondi = new Map(overrideSaldi.filter((o) => o.tipoElemento === 'fondo').map((o) => [o.elementoId, o]));
  const mappaOverrideObiettivi = new Map(overrideSaldi.filter((o) => o.tipoElemento === 'obiettivo').map((o) => [o.elementoId, o]));
  const fondiPartenza = baseline.fondi.map((f) => {
    const override = mappaOverrideFondi.get(f.id);
    return override ? { ...f, saldo: override.saldoIniziale } : f;
  });
  const obiettiviPartenza = baseline.obiettivi.map((o) => {
    const override = mappaOverrideObiettivi.get(o.id);
    return override ? { ...o, saldoAccumulato: override.saldoIniziale } : o;
  });

  const dataInizio = parseDataLocale(prospetto.dataInizio || formatDataLocale(new Date()));
  const dataFineEffettiva = calcolaDataFineEffettiva(prospetto);
  const giornoCiclo = prospetto.giornoCiclo || dataInizio.getDate();
  const numeroCicli = prospetto.tipoOrizzonte === 'mesi'
    ? Math.max(1, prospetto.numeroMesi)
    : contaOccorrenzeGiorno(dataInizio, giornoCiclo, dataFineEffettiva);

  const tuttiIMovimenti = await elencoMovimentiProspetto(prospettoId);
  const movimentiRipetitivi = tuttiIMovimenti.filter((m) => m.tipo === 'ripetitivo').map((m) => ({
    ...m,
    numeroOccorrenze: prospetto.tipoOrizzonte === 'data'
      ? contaOccorrenzeGiorno(dataInizio, m.giornoMese, dataFineEffettiva)
      : numeroCicli
  }));

  // Stato dopo Piano + movimenti ripetitivi (tutti i cicli) — nessuna riga salvata da
  // rileggere per questi, vanno sempre ricalcolati da capo. È il punto di partenza corretto da
  // cui rigiocare i movimenti "singolo" in ordine cronologico: altrimenti la crescita del
  // Piano/ripetitivi andrebbe persa nella simulazione di correzione.
  const risultatoCicli = calcolaProiezione({
    vociPiano,
    importoEntrataPerCiclo: prospetto.importoEntrataPerCiclo,
    numeroCicli,
    fondi: fondiPartenza,
    obiettivi: obiettiviPartenza,
    movimentiManuali: movimentiRipetitivi
  });

  const mappaFondi = new Map(risultatoCicli.fondiProiettati.map((f) => [f.id, { ...f }]));
  const mappaObiettivi = new Map(risultatoCicli.obiettiviProiettati.map((o) => [o.id, { ...o }]));

  const movimentiSingoli = tuttiIMovimenti
    .filter((m) => m.tipo === 'singolo')
    .sort((a, b) => new Date(a.dataCreazione) - new Date(b.dataCreazione));

  let corretti = 0;
  const log = [];
  for (const m of movimentiSingoli) {
    const eDrenaggioDaCorreggere = m.descrizione === DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE
      && m.tipoDestinazione === 'fondo' && Number(m.importo) < 0;

    if (!eDrenaggioDaCorreggere) {
      log.push({ id: m.id, descrizione: m.descrizione, tipoDestinazione: m.tipoDestinazione, importo: m.importo, esito: 'ignorato (non è un drenaggio Fondo da correggere)' });
      applicaImportoADestinazione(m.tipoDestinazione, m.destinazioneId, Number(m.importo), mappaFondi, mappaObiettivi);
      continue;
    }

    const fondo = mappaFondi.get(m.destinazioneId);
    const obiettiviDelFondo = fondo ? [...mappaObiettivi.values()].filter((o) => o.fondoId === m.destinazioneId) : [];
    if (!fondo) {
      log.push({ id: m.id, esito: 'ignorato (Fondo non trovato nella simulazione)' });
      applicaImportoADestinazione(m.tipoDestinazione, m.destinazioneId, Number(m.importo), mappaFondi, mappaObiettivi);
      continue;
    }
    if (obiettiviDelFondo.length === 0) {
      log.push({ id: m.id, fondo: fondo.nome, esito: 'ignorato (il Fondo non ha Obiettivi: nessun doppio conteggio possibile)' });
      applicaImportoADestinazione(m.tipoDestinazione, m.destinazioneId, Number(m.importo), mappaFondi, mappaObiettivi);
      continue;
    }

    const righeCorrette = costruisciRigheDrenaggioFondo(fondo, obiettiviDelFondo, -Number(m.importo));
    const giaCorretto = righeCorrette.length === 1
      && righeCorrette[0].tipoDestinazione === 'fondo'
      && Math.abs(righeCorrette[0].importo - Number(m.importo)) < 0.005;

    if (giaCorretto) {
      log.push({ id: m.id, fondo: fondo.nome, esito: 'già corretto (il Fondo aveva abbastanza residuo non vincolato)' });
      applicaImportoADestinazione(m.tipoDestinazione, m.destinazioneId, Number(m.importo), mappaFondi, mappaObiettivi);
      continue;
    }

    await dbDelete(STORE_ELEMENTI, m.id);
    for (const r of righeCorrette) {
      const nuovaRiga = {
        id: generaId(), gruppoId: m.gruppoId, categoria: 'movimento', prospettoId,
        tipo: 'singolo', giornoMese: null, data: m.data, importo: r.importo,
        tipoDestinazione: r.tipoDestinazione, destinazioneId: r.destinazioneId,
        descrizione: m.descrizione, dataCreazione: m.dataCreazione
      };
      await dbAdd(STORE_ELEMENTI, nuovaRiga);
      applicaImportoADestinazione(nuovaRiga.tipoDestinazione, nuovaRiga.destinazioneId, nuovaRiga.importo, mappaFondi, mappaObiettivi);
    }
    corretti++;
    log.push({ id: m.id, fondo: fondo.nome, importoOriginale: m.importo, righeCorrette, esito: 'corretto' });
  }

  return { righeCorrette: corretti, log };
}

export async function aggiornaMovimentoProspetto(id, dati) {
  const esistente = await dbGet(STORE_ELEMENTI, id);
  if (!esistente) throw new Error('Movimento non trovato.');
  await garantisciProspettoModificabile(esistente.prospettoId);
  validaDatiComuniMovimento(dati);
  if (!['fondo', 'obiettivo'].includes(dati.tipoDestinazione)) throw new Error('Seleziona un Fondo o un Obiettivo come destinazione.');
  if (!dati.destinazioneId) throw new Error('Seleziona una destinazione per il movimento.');
  const importo = Number(dati.importo);
  if (!importo) throw new Error('Indica un importo diverso da zero (positivo per un\'entrata, negativo per un\'uscita).');

  const aggiornato = {
    ...esistente,
    tipo: dati.tipo,
    giornoMese: dati.tipo === 'ripetitivo' ? Number(dati.giornoMese) : null,
    data: dati.tipo === 'singolo' ? dati.data : null,
    importo,
    tipoDestinazione: dati.tipoDestinazione,
    destinazioneId: dati.destinazioneId,
    descrizione: dati.descrizione ? dati.descrizione.trim() : ''
  };
  await dbPut(STORE_ELEMENTI, aggiornato);
  return aggiornato;
}

export async function eliminaMovimentoProspetto(id) {
  const esistente = await dbGet(STORE_ELEMENTI, id);
  if (esistente) await garantisciProspettoModificabile(esistente.prospettoId);
  await dbDelete(STORE_ELEMENTI, id);
}

// Elimina tutte le righe create insieme come distribuzione su più Obiettivi (stesso gruppoId).
export async function eliminaGruppoMovimentiProspetto(gruppoId) {
  const tutti = await dbGetAll(STORE_ELEMENTI);
  const daEliminare = tutti.filter((m) => m.gruppoId === gruppoId);
  if (daEliminare[0]) await garantisciProspettoModificabile(daEliminare[0].prospettoId);
  await Promise.all(daEliminare.map((m) => dbDelete(STORE_ELEMENTI, m.id)));
}

// --- Saldi di partenza personalizzati (Fondo/Obiettivo), specifici di un Prospetto ---
//
// Un saldo di partenza personalizzato sostituisce, SOLO per questo Prospetto e SOLO come punto
// di partenza della sua proiezione, il saldo reale (o ereditato da un Prospetto di origine) di
// un Fondo o di un Obiettivo — come una Rettifica, ma puramente simulata.
export async function elencoSaldiPartenzaProspetto(prospettoId) {
  const tutti = await dbGetAllByIndex(STORE_ELEMENTI, 'prospettoId', prospettoId);
  return tutti.filter((e) => e.categoria === 'overrideSaldo');
}

export async function impostaSaldoPartenzaProspetto(prospettoId, tipoElemento, elementoId, saldoIniziale) {
  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');
  if (prospetto.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
  if (!['fondo', 'obiettivo'].includes(tipoElemento)) throw new Error('Tipo di elemento non valido.');
  const saldo = Number(saldoIniziale);
  if (Number.isNaN(saldo)) throw new Error('Indica un saldo di partenza valido.');

  const esistenti = await elencoSaldiPartenzaProspetto(prospettoId);
  const giaEsistente = esistenti.find((e) => e.tipoElemento === tipoElemento && e.elementoId === elementoId);

  if (giaEsistente) {
    const aggiornato = { ...giaEsistente, saldoIniziale: saldo };
    await dbPut(STORE_ELEMENTI, aggiornato);
    return aggiornato;
  }
  const nuovo = {
    id: generaId(),
    categoria: 'overrideSaldo',
    prospettoId,
    tipoElemento,
    elementoId,
    saldoIniziale: saldo,
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE_ELEMENTI, nuovo);
  return nuovo;
}

export async function rimuoviSaldoPartenzaProspetto(id) {
  const esistente = await dbGet(STORE_ELEMENTI, id);
  if (esistente) await garantisciProspettoModificabile(esistente.prospettoId);
  await dbDelete(STORE_ELEMENTI, id);
}

// --- Modalità di calcolo "mesi di autonomia" per questo Prospetto (Salute Finanziaria) ---
//
// Per ogni Prospetto, l'utente sceglie se ereditare la composizione configurata globalmente in
// Impostazioni → Salute Finanziaria (comportamento di default), oppure personalizzarla per
// questo specifico Prospetto — decisione esplicita dell'utente: "vorrei definire come calcolare
// il necessario mese: eredita da impostazioni oppure aggiungi voce". Le voci personalizzate
// vivono in prospettoElementi (categoria 'voceAutonomia'), stessa infrastruttura già usata per
// movimenti e override di saldo. Tipi di voce: 'pianoCollegato' (eredita i Budget del Piano
// collegato a QUESTO Prospetto — "vuoi ereditare i budget di un piano?"), 'budgetSingolo'
// (un Budget scelto liberamente, indipendente da qualunque Piano), 'risparmioAnnuale' (obiettivo
// complessivo di un Fondo con Obiettivi ÷ 12, valutato sul suo saldo PROIETTATO),
// 'risparmioMensile' (importo a mano, su qualunque Fondo).
export async function impostaModalitaAutonomiaProspetto(prospettoId, modalita) {
  if (!['eredita', 'personalizzata'].includes(modalita)) throw new Error('Modalità non valida.');
  const esistente = await dbGet(STORE, prospettoId);
  if (!esistente) throw new Error('Prospetto non trovato.');
  if (esistente.bloccato) throw new Error('Questo Prospetto è bloccato: sbloccalo prima di modificarlo.');
  await dbPut(STORE, { ...esistente, modalitaAutonomia: modalita });
}

export async function elencoVociAutonomiaProspetto(prospettoId) {
  const tutti = await dbGetAllByIndex(STORE_ELEMENTI, 'prospettoId', prospettoId);
  return tutti.filter((e) => e.categoria === 'voceAutonomia');
}

export async function aggiungiVoceAutonomiaProspetto(prospettoId, voce) {
  await garantisciProspettoModificabile(prospettoId);
  if (!['pianoCollegato', 'budgetSingolo', 'risparmioAnnuale', 'risparmioMensile'].includes(voce.tipo)) {
    throw new Error('Tipo di voce non valido.');
  }
  if (voce.tipo === 'budgetSingolo' && !voce.budgetId) throw new Error('Seleziona un Budget.');
  if (voce.tipo === 'risparmioAnnuale' && !voce.fondoId) throw new Error('Seleziona un Fondo con Obiettivi.');
  if (voce.tipo === 'risparmioMensile') {
    if (!voce.fondoId) throw new Error('Seleziona un Fondo.');
    if (!voce.importo || Number(voce.importo) <= 0) throw new Error('Indica un importo mensile maggiore di zero.');
  }
  const nuova = { id: generaId(), categoria: 'voceAutonomia', prospettoId, dataCreazione: oggiISO(), ...voce };
  await dbAdd(STORE_ELEMENTI, nuova);
  return nuova;
}

export async function rimuoviVoceAutonomiaProspetto(id) {
  const esistente = await dbGet(STORE_ELEMENTI, id);
  if (esistente) await garantisciProspettoModificabile(esistente.prospettoId);
  await dbDelete(STORE_ELEMENTI, id);
}

// Calcola dal vivo la proiezione di un Prospetto salvato. Se il Prospetto è concatenato
// (prospettoOrigineId), il punto di partenza è il risultato finale proiettato del Prospetto di
// origine (risolto ricorsivamente, con protezione anti-circolarità) invece dei saldi reali —
// altrimenti sono i saldi reali attuali. Se il Piano collegato (o le sue Voci) non esiste
// più, segnala l'errore invece di calcolare silenziosamente su dati inesistenti.
export async function calcolaProiezioneProspetto(prospettoId) {
  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');
  return calcolaProiezioneProspettoInterno(prospetto, new Set());
}

const GRANULARITA_VALIDE = ['giorno', 'settimana', 'mese', 'trimestre', 'semestre', 'anno', 'quinquennio'];

function inizioBucket(data, granularita) {
  const y = data.getFullYear(), m = data.getMonth();
  if (granularita === 'giorno') {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }
  if (granularita === 'settimana') {
    const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    const giornoSettimana = (d.getDay() + 6) % 7; // lunedì = 0
    d.setDate(d.getDate() - giornoSettimana);
    return d;
  }
  if (granularita === 'trimestre') return new Date(y, Math.floor(m / 3) * 3, 1);
  if (granularita === 'semestre') return new Date(y, m < 6 ? 0 : 6, 1);
  if (granularita === 'anno') return new Date(y, 0, 1);
  if (granularita === 'quinquennio') return new Date(Math.floor(y / 5) * 5, 0, 1);
  return new Date(y, m, 1); // 'mese', default
}

function prossimoBucket(inizio, granularita) {
  const y = inizio.getFullYear(), m = inizio.getMonth(), d = inizio.getDate();
  if (granularita === 'giorno') return new Date(y, m, d + 1);
  if (granularita === 'settimana') return new Date(y, m, d + 7);
  if (granularita === 'trimestre') return new Date(y, m + 3, 1);
  if (granularita === 'semestre') return new Date(y, m + 6, 1);
  if (granularita === 'anno') return new Date(y + 1, 0, 1);
  if (granularita === 'quinquennio') return new Date(y + 5, 0, 1);
  return new Date(y, m + 1, 1); // 'mese'
}

function etichettaBucket(inizio, granularita) {
  if (granularita === 'giorno') return formattaData(formatDataLocale(inizio));
  if (granularita === 'settimana') return formattaData(formatDataLocale(inizio));
  if (granularita === 'trimestre') return `T${Math.floor(inizio.getMonth() / 3) + 1} ${inizio.getFullYear()}`;
  if (granularita === 'semestre') return `S${inizio.getMonth() < 6 ? 1 : 2} ${inizio.getFullYear()}`;
  if (granularita === 'anno') return `${inizio.getFullYear()}`;
  if (granularita === 'quinquennio') return `${inizio.getFullYear()}-${inizio.getFullYear() + 4}`;
  return inizio.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }); // 'mese'
}

// Traiettoria dettagliata di un Prospetto con DATE REALI (non "cicli" astratti), granularità
// configurabile (settimana/mese/trimestre/semestre/anno/quinquennio) — richiesto dall'utente:
// "se c'è un'entrata il 10 ottobre voglio vedere l'aumento, se c'è un'uscita il 15 voglio
// vedere la diminuzione".
//
// Corregge un bug reale segnalato dall'utente: il grafico precedente si basava sulla
// `traiettoria` del motore (calcolaProiezione), che è per-ciclo e viene registrata PRIMA che i
// movimenti "singolo" (Uscite/Entrate una tantum, e i movimenti generati da Trasferisci/
// Ridistribuisci) vengano applicati — quindi il grafico ignorava completamente ogni Uscita,
// pur essendo le tabelle e "Crescita patrimoniale sull'orizzonte" corretti (quelli usano il
// risultato finale, che i movimenti singolo li include). Qui si costruisce invece una linea
// del tempo di EVENTI con la loro data reale — le Voci di un Piano e i movimenti
// "ripetitivo" sul giorno del ciclo di ciascuna occorrenza, i movimenti "singolo" sulla loro
// data esatta — poi si applicano in ordine cronologico, catturando un punto ad ogni data in cui
// succede qualcosa. Riguarda il patrimonio in Fondi (Budget non vi contribuisce: è liquidità/
// spesa, non patrimonio che cresce nel tempo, coerentemente col resto del modello).
export async function calcolaTraiettoriaDettagliataProspetto(prospettoId, granularita = 'mese') {
  if (!GRANULARITA_VALIDE.includes(granularita)) throw new Error('Granularità non valida.');

  const prospetto = await dbGet(STORE, prospettoId);
  if (!prospetto) throw new Error('Prospetto non trovato.');

  let vociPiano = [];
  if (prospetto.pianoId) vociPiano = await elencoVociPerPiano(prospetto.pianoId);

  const baseline = await risolviBaseline(prospetto, new Set());
  const overrideSaldi = await elencoSaldiPartenzaProspetto(prospettoId);
  const mappaOverrideFondi = new Map(overrideSaldi.filter((o) => o.tipoElemento === 'fondo').map((o) => [o.elementoId, o]));
  const mappaOverrideObiettivi = new Map(overrideSaldi.filter((o) => o.tipoElemento === 'obiettivo').map((o) => [o.elementoId, o]));
  const fondiPartenza = baseline.fondi.map((f) => {
    const override = mappaOverrideFondi.get(f.id);
    return override ? { ...f, saldo: override.saldoIniziale } : f;
  });
  const obiettiviPartenza = baseline.obiettivi.map((o) => {
    const override = mappaOverrideObiettivi.get(o.id);
    return override ? { ...o, saldoAccumulato: override.saldoIniziale } : o;
  });

  const dataInizio = parseDataLocale(prospetto.dataInizio || formatDataLocale(new Date()));
  const dataFineEffettiva = calcolaDataFineEffettiva(prospetto);
  const dataFineComeDate = parseDataLocale(dataFineEffettiva);
  const giornoCiclo = prospetto.giornoCiclo || dataInizio.getDate();
  const numeroCicli = prospetto.tipoOrizzonte === 'mesi'
    ? Math.max(1, prospetto.numeroMesi)
    : contaOccorrenzeGiorno(dataInizio, giornoCiclo, dataFineEffettiva);

  const tuttiIMovimenti = await elencoMovimentiProspetto(prospettoId);

  // Lista di eventi con data esatta: { data, righe: [{tipoDestinazione, destinazioneId, importo}] }
  const eventi = [];

  if (vociPiano.length > 0 && numeroCicli > 0) {
    const dateCicli = generaOccorrenzeGiorno(dataInizio, giornoCiclo, dataFineEffettiva).slice(0, numeroCicli);
    const calcolo = calcolaRichiestaDaPiano(prospetto.importoEntrataPerCiclo, vociPiano);
    const righeFondoObiettivo = calcolo.vociCalcolate
      .filter((v) => v.tipoDestinazione === 'fondo' || v.tipoDestinazione === 'obiettivo')
      .map((v) => ({ tipoDestinazione: v.tipoDestinazione, destinazioneId: v.destinazioneId, importo: v.importoRichiesto }));
    if (righeFondoObiettivo.length > 0) {
      for (const data of dateCicli) eventi.push({ data, righe: righeFondoObiettivo });
    }
  }

  for (const m of tuttiIMovimenti) {
    if (m.tipo === 'ripetitivo') {
      const numeroOccorrenze = prospetto.tipoOrizzonte === 'data'
        ? contaOccorrenzeGiorno(dataInizio, m.giornoMese, dataFineEffettiva)
        : numeroCicli;
      const date = generaOccorrenzeGiorno(dataInizio, m.giornoMese, dataFineEffettiva).slice(0, numeroOccorrenze);
      for (const data of date) {
        eventi.push({ data, righe: [{ tipoDestinazione: m.tipoDestinazione, destinazioneId: m.destinazioneId, importo: Number(m.importo), nota: m.descrizione || '' }] });
      }
    } else {
      const dataMovimento = parseDataLocale(m.data);
      const fuoriOrizzonte = dataMovimento < dataInizio || dataMovimento > dataFineComeDate;
      if (!fuoriOrizzonte) {
        eventi.push({ data: dataMovimento, righe: [{ tipoDestinazione: m.tipoDestinazione, destinazioneId: m.destinazioneId, importo: Number(m.importo), nota: m.descrizione || '' }] });
      }
    }
  }

  eventi.sort((a, b) => a.data - b.data);

  const mappaFondi = new Map(fondiPartenza.map((f) => [f.id, { ...f }]));
  const mappaObiettivi = new Map(obiettiviPartenza.map((o) => [o.id, { ...o }]));

  const sommaFondi = () => arrotonda([...mappaFondi.values()].reduce((s, f) => s + f.saldo, 0));

  // Serie grezza: un punto per ogni data distinta in cui succede almeno un evento (eventi dello
  // stesso giorno si sommano in un unico punto, applicati nell'ordine con cui sono stati creati).
  const serieGrezza = [{ data: dataInizio, sommaFondi: sommaFondi() }];
  let indice = 0;
  while (indice < eventi.length) {
    const dataCorrente = eventi[indice].data;
    while (indice < eventi.length && eventi[indice].data.getTime() === dataCorrente.getTime()) {
      for (const r of eventi[indice].righe) {
        applicaImportoADestinazione(r.tipoDestinazione, r.destinazioneId, r.importo, mappaFondi, mappaObiettivi);
      }
      indice++;
    }
    serieGrezza.push({ data: dataCorrente, sommaFondi: sommaFondi() });
  }

  // Aggregazione per granularità: un punto per periodo, valore = ultimo noto entro la fine del
  // periodo (tipico "downsampling" di una serie storica) — così anche periodi senza eventi
  // mostrano correttamente il valore corrente, non un buco. Ogni punto porta con sé anche
  // l'intervallo di date che rappresenta e l'elenco degli eventi caduti in quel periodo —
  // richiesto dall'utente: il tooltip deve indicare inizio/fine, e i movimenti di un periodo
  // devono poter essere evidenziati cliccando sul punto.
  const mappaNomiFondi = new Map(fondiPartenza.map((f) => [f.id, f.nome]));
  const mappaNomiObiettivi = new Map(obiettiviPartenza.map((o) => [o.id, o.nome]));
  const nomeDestinazione = (tipo, id) => {
    if (tipo === 'fondo') return mappaNomiFondi.get(id) || '(Fondo eliminato)';
    if (tipo === 'obiettivo') return mappaNomiObiettivi.get(id) || '(Obiettivo eliminato)';
    return tipo;
  };
  const eventiPiatti = eventi.flatMap((ev) => ev.righe.map((r) => ({ data: ev.data, ...r })));

  const punti = [];
  let cursoreBucket = inizioBucket(dataInizio, granularita);
  let indiceSerie = 0;
  let indiceEvento = 0;
  while (cursoreBucket <= dataFineComeDate) {
    const fineBucket = prossimoBucket(cursoreBucket, granularita);
    while (indiceSerie + 1 < serieGrezza.length && serieGrezza[indiceSerie + 1].data < fineBucket) {
      indiceSerie++;
    }
    const eventiBucket = [];
    while (indiceEvento < eventiPiatti.length && eventiPiatti[indiceEvento].data < fineBucket) {
      const ev = eventiPiatti[indiceEvento];
      eventiBucket.push({
        data: formatDataLocale(ev.data),
        nome: nomeDestinazione(ev.tipoDestinazione, ev.destinazioneId),
        importo: ev.importo,
        nota: ev.nota || ''
      });
      indiceEvento++;
    }
    const fineBucketInclusa = new Date(fineBucket);
    fineBucketInclusa.setDate(fineBucketInclusa.getDate() - 1);
    const fineEffettivaBucket = fineBucketInclusa > dataFineComeDate ? dataFineComeDate : fineBucketInclusa;
    punti.push({
      etichetta: etichettaBucket(cursoreBucket, granularita),
      inizio: formatDataLocale(cursoreBucket),
      fine: formatDataLocale(fineEffettivaBucket),
      valore: serieGrezza[indiceSerie].sommaFondi,
      eventi: eventiBucket
    });
    cursoreBucket = fineBucket;
  }
  // L'ultimo punto della serie grezza (fine esatta dell'orizzonte) potrebbe cadere oltre l'ultimo
  // bucket generato per via degli arrotondamenti di calendario: lo aggiungo se manca, per essere
  // certi che il grafico finisca esattamente sul valore finale corretto.
  const ultimoValoreReale = serieGrezza[serieGrezza.length - 1].sommaFondi;
  if (punti.length === 0 || punti[punti.length - 1].valore !== ultimoValoreReale) {
    const inizioUltimo = inizioBucket(dataFineComeDate, granularita);
    punti.push({
      etichetta: etichettaBucket(inizioUltimo, granularita),
      inizio: formatDataLocale(inizioUltimo),
      fine: formatDataLocale(dataFineComeDate),
      valore: ultimoValoreReale,
      eventi: eventiPiatti.slice(indiceEvento).map((ev) => ({
        data: formatDataLocale(ev.data), nome: nomeDestinazione(ev.tipoDestinazione, ev.destinazioneId), importo: ev.importo, nota: ev.nota || ''
      }))
    });
  }

  return { punti, granularita, numeroEventi: eventi.length };
}

async function risolviBaseline(prospetto, catenaVisitata) {
  if (!prospetto.prospettoOrigineId) {
    const [fondi, obiettivi] = await Promise.all([elencoFondi(), elencoObiettivi()]);
    return { fondi, obiettivi, reale: true };
  }
  if (catenaVisitata.has(prospetto.id)) {
    throw new Error('Catena di Prospetti circolare rilevata: impossibile calcolare la proiezione.');
  }
  catenaVisitata.add(prospetto.id);
  const origine = await dbGet(STORE, prospetto.prospettoOrigineId);
  if (!origine) {
    throw new Error(`Il Prospetto di origine di "${prospetto.nome}" non esiste più (è stato eliminato?): impossibile calcolare la proiezione.`);
  }
  const risultatoOrigine = await calcolaProiezioneProspettoInterno(origine, catenaVisitata);
  return { fondi: risultatoOrigine.fondiProiettati, obiettivi: risultatoOrigine.obiettiviProiettati, reale: false };
}

async function calcolaProiezioneProspettoInterno(prospetto, catenaVisitata) {
  let vociPiano = [];
  if (prospetto.pianoId) {
    vociPiano = await elencoVociPerPiano(prospetto.pianoId);
    if (vociPiano.length === 0) {
      throw new Error(
        `Il Piano collegato al Prospetto "${prospetto.nome}" non ha (più) Voci: impossibile calcolare una proiezione.`
      );
    }
  }

  const baseline = await risolviBaseline(prospetto, catenaVisitata);
  // Sempre i Fondi REALI di oggi, indipendentemente dalla concatenazione — servono per isolare
  // la quota di un Conto che NON è dentro nessun Fondo (liquidità libera + Budget assegnato),
  // che è sempre reale e mai simulata. Per un Prospetto concatenato, baseline.fondi sono i
  // valori ereditati dal Prospetto di origine (simulati), diversi da questi.
  const fondiReali = baseline.reale ? baseline.fondi : await elencoFondi();
  const [movimenti, overrideSaldi] = await Promise.all([
    elencoMovimentiProspetto(prospetto.id), elencoSaldiPartenzaProspetto(prospetto.id)
  ]);

  const mappaOverrideFondi = new Map(overrideSaldi.filter((o) => o.tipoElemento === 'fondo').map((o) => [o.elementoId, o]));
  const mappaOverrideObiettivi = new Map(overrideSaldi.filter((o) => o.tipoElemento === 'obiettivo').map((o) => [o.elementoId, o]));

  const fondiPartenza = baseline.fondi.map((f) => {
    const override = mappaOverrideFondi.get(f.id);
    return override ? { ...f, saldo: override.saldoIniziale } : f;
  });
  const obiettiviPartenza = baseline.obiettivi.map((o) => {
    const override = mappaOverrideObiettivi.get(o.id);
    return override ? { ...o, saldoAccumulato: override.saldoIniziale } : o;
  });

  // Ancoraggio temporale: la data inizio del Prospetto — "oggi" solo se non concatenato e non
  // impostata esplicitamente (compatibilità con Prospetti creati prima di questa versione, che
  // non avevano ancora una data inizio propria).
  const dataInizio = parseDataLocale(prospetto.dataInizio || formatDataLocale(new Date()));
  const dataFineEffettiva = calcolaDataFineEffettiva(prospetto);
  // Giorno del ciclo (es. il giorno dello stipendio): può differire dal giorno di dataInizio se
  // si proietta da una data arbitraria (es. "oggi") diversa da quando il ciclo si apre davvero.
  // Compatibilità: i Prospetti creati prima di questa correzione non hanno questo campo — di
  // default coincide con il giorno di dataInizio, comportamento identico a prima per loro.
  const giornoCiclo = prospetto.giornoCiclo || dataInizio.getDate();

  const numeroCicli = prospetto.tipoOrizzonte === 'mesi'
    ? Math.max(1, prospetto.numeroMesi)
    : contaOccorrenzeGiorno(dataInizio, giornoCiclo, dataFineEffettiva);

  const movimentiRisolti = movimenti.map((m) => {
    if (m.tipo === 'singolo') {
      // Un movimento "singolo" ha una data precisa e non è legato ad alcun ciclo: basta che
      // cada nel periodo del Prospetto (dataInizio - dataFineEffettiva inclusi). Il concetto di
      // "ciclo" (giorno del mese) riguarda solo il Piano e i movimenti "ripetitivo" —
      // segnalato dall'utente con un esempio preciso: una spesa una tantum il 3 ottobre in un
      // Prospetto dall'1/10 al 31/12 con ciclo il 15 va sempre considerata, anche se cade
      // "prima" della prima occorrenza del giorno del ciclo.
      const dataMovimento = parseDataLocale(m.data);
      const fineOrizzonte = parseDataLocale(dataFineEffettiva);
      const fuoriOrizzonte = dataMovimento < dataInizio || dataMovimento > fineOrizzonte;
      return { ...m, fuoriOrizzonte };
    }
    const numeroOccorrenze = prospetto.tipoOrizzonte === 'data'
      ? contaOccorrenzeGiorno(dataInizio, m.giornoMese, dataFineEffettiva)
      : numeroCicli;
    return { ...m, numeroOccorrenze };
  });

  const proiezione = calcolaProiezione({
    vociPiano,
    importoEntrataPerCiclo: prospetto.importoEntrataPerCiclo,
    numeroCicli,
    fondi: fondiPartenza,
    obiettivi: obiettiviPartenza,
    movimentiManuali: movimentiRisolti
  });

  // Andamento stimato dei Budget: non potendo prevedere la spesa reale (§1.4 modello, nessuna
  // registrazione dettagliata delle spese), si ipotizza che ogni ciclo venga assegnato per
  // intero l'importo previsto — "ho sicuramente destinato X a questo Budget in N cicli"; se poi
  // ne avanzerà o ne servirà di più si vedrà solo nella realtà, a consuntivo.
  //
  // Segnalato dall'utente: in Prospetti concatenati con Piani diversi, i Budget "collegati"
  // devono riflettere il Piano di QUESTO Prospetto, non restare un elenco generico che sembra
  // "ereditato" dal Prospetto precedente. Se il Piano collegato ha Voci verso Budget
  // specifici, l'importo per ciclo è quello calcolato dal Piano (stessa logica già usata
  // per Fondi/Obiettivi: calcolaRichiestaDaPiano). Solo se non c'è un Piano collegato (o non
  // ha Voci verso Budget) si ricade sulla stima generica basata sull'importo di default di tutti
  // i Budget attivi.
  const budgetTutti = await elencoBudget();
  const vociBudgetPiano = vociPiano.filter((v) => v.tipoDestinazione === 'budget');
  let budgetStimati;
  let budgetStimatiDaPiano;
  if (prospetto.pianoId && vociBudgetPiano.length > 0) {
    const mappaBudget = new Map(budgetTutti.map((b) => [b.id, b]));
    const calcoloPiano = calcolaRichiestaDaPiano(prospetto.importoEntrataPerCiclo, vociPiano);
    budgetStimati = calcoloPiano.vociCalcolate
      .filter((v) => v.tipoDestinazione === 'budget')
      .map((v) => ({
        budget: mappaBudget.get(v.destinazioneId) || { id: v.destinazioneId, nome: '(Budget eliminato)' },
        totaleImpegnato: arrotonda(v.importoRichiesto * numeroCicli)
      }));
    budgetStimatiDaPiano = true;
  } else {
    budgetStimati = budgetTutti
      .filter((b) => !b.stato || b.stato === 'attivo')
      .map((b) => ({
        budget: b,
        totaleImpegnato: arrotonda((Number(b.importoAssegnatoDefault) || 0) * numeroCicli)
      }));
    budgetStimatiDaPiano = false;
  }

  // "Non allocati": quanto dell'entrata ipotizzata dal Piano, cicle per ciclo, non è
  // coperto da nessuna Voce — prima spariva silenziosamente dalla proiezione (bug segnalato
  // dall'utente). Ora resta un totale esplicito, sempre visibile, MAI instradato
  // automaticamente in un Fondo/Conto (scelta esplicita dell'utente: "non sono da nessuna
  // parte ma sappiamo che esistono") — riallocabile solo manualmente, dal pulsante "Distribuisci
  // anche i non allocati" in Ridistribuisci. Un movimento con tipoDestinazione 'nonAllocato'
  // (creato da quel pulsante) non tocca alcun Fondo/Obiettivo (l'engine lo ignora, come ogni
  // tipo non riconosciuto) mentre qui riduce il totale ancora disponibile.
  let nonAllocatoPerCiclo = 0;
  if (prospetto.pianoId && vociPiano.length > 0) {
    const calcoloEntrata = calcolaRichiestaDaPiano(prospetto.importoEntrataPerCiclo, vociPiano);
    nonAllocatoPerCiclo = Math.max(0, arrotonda(prospetto.importoEntrataPerCiclo - calcoloEntrata.totaleRichiesto));
  }
  const nonAllocatoLordo = arrotonda(nonAllocatoPerCiclo * numeroCicli);
  const nonAllocatoGiaUsato = arrotonda(
    movimentiRisolti
      .filter((m) => m.tipo === 'singolo' && m.tipoDestinazione === 'nonAllocato' && !m.fuoriOrizzonte)
      .reduce((s, m) => s - Number(m.importo), 0)
  );
  const nonAllocatoDisponibile = arrotonda(Math.max(0, nonAllocatoLordo - nonAllocatoGiaUsato));

  return {
    prospetto,
    numeroCicli,
    dataFineEffettiva,
    fondiAttuali: baseline.fondi,
    fondiReali,
    obiettiviAttuali: baseline.obiettivi,
    baselineReale: baseline.reale,
    fondiPartenza,
    obiettiviPartenza,
    overrideSaldi,
    movimenti: movimentiRisolti,
    budgetStimati,
    budgetStimatiDaPiano,
    nonAllocatoPerCiclo,
    nonAllocatoLordo,
    nonAllocatoDisponibile,
    ...proiezione
  };
}
