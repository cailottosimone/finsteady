// Dominio: Trasferimento — movimento reale tra due entità che detengono valore: Conto, Fondo
// o Obiettivo (decisione esplicita dell'utente: "non è un'operazione tra Fondi, è un'operazione
// tra entità che detengono valore").
//
// Principio applicato (dedotto tecnicamente, in caso di dubbio va rivalidato con l'utente):
// il saldoReale di un Conto viene modificato SOLO quando il Conto di partenza e quello di
// arrivo sono realmente diversi (il denaro fisicamente cambia banca/contenitore). Se un
// Fondo/Obiettivo cede o riceve valore restando all'interno dello stesso Conto, cambia solo
// l'"etichetta" interna (quanto è earmarked vs quanto è liquidità libera), perché quel denaro
// era già conteggiato nel saldoReale di quel Conto: toccarlo di nuovo lo conterebbe due volte,
// violando l'unicità del denaro (§5.2 FDD).
//
// Evento storico immutabile: si corregge con uno Storno, mai con modifica o cancellazione.

import { dbAdd, dbGet, dbGetAll, dbPut, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { arrotonda } from '../utils/denaro.js';
import { ottieniFondo, aggiornaFondo, verificaRiduzioneCoerente } from './fondi.js';
import { aggiornaObiettivo } from './obiettivi.js';
import { ottieniConto, aggiornaConto } from './conti.js';
import { verificaIntegritaConto } from '../engine/integrityCheck.js';
import { registraStorno, eliminaStorniPerMovimento } from './storni.js';

const STORE = 'trasferimenti';
const STORE_CICLI = 'budgetCicli';
const TIPI_VALIDI = ['conto', 'fondo', 'obiettivo', 'budget'];

// Il Ciclo Budget è gestito da domain/budgetCicli.js, ma qui si usa storage.js direttamente
// (non si importa quel modulo) per evitare una dipendenza circolare: budgetCicli.js chiama
// creaTrasferimento per spostare un residuo, quindi trasferimenti.js non può a sua volta
// dipendere da budgetCicli.js.
async function ottieniCicloApertoDelBudget(budgetId) {
  const cicli = await dbGetAll(STORE_CICLI);
  const aperto = cicli.find((c) => c.budgetId === budgetId && c.stato === 'aperto');
  if (!aperto) throw new Error('Questo Budget non ha un Ciclo aperto: apri un Ciclo prima di trasferire da/verso di esso.');
  return aperto;
}

async function contoDiEntita(tipo, id) {
  if (tipo === 'conto') return id;
  if (tipo === 'fondo') {
    const fondo = await dbGet('fondi', id);
    if (!fondo) throw new Error('Fondo non trovato.');
    return fondo.contoId;
  }
  if (tipo === 'obiettivo') {
    const obiettivo = await dbGet('obiettivi', id);
    if (!obiettivo) throw new Error('Obiettivo non trovato.');
    const fondo = await dbGet('fondi', obiettivo.fondoId);
    if (!fondo) throw new Error('Fondo dell\'Obiettivo non trovato.');
    return fondo.contoId;
  }
  if (tipo === 'budget') {
    const budget = await dbGet('budget', id);
    if (!budget) throw new Error('Budget non trovato.');
    return budget.contoId;
  }
  throw new Error('Tipo di entità non riconosciuto.');
}

// segno = +1 per applicare l'effetto "in uscita" su un'entità, -1 per l'effetto "in entrata"
// (o per stornare). Aggiorna SOLO l'earmarking (Fondo/Obiettivo/Ciclo Budget aperto); il Conto
// non viene toccato qui: il movimento reale tra Conti è gestito separatamente in applicaTrasferimento.
async function applicaEarmark(tipo, id, importo, segno) {
  if (tipo === 'conto') return; // nessun earmarking sul Conto stesso
  if (tipo === 'fondo') {
    const fondo = await ottieniFondo(id);
    await aggiornaFondo(id, { saldo: fondo.saldo - segno * importo });
    return;
  }
  if (tipo === 'obiettivo') {
    const obiettivo = await dbGet('obiettivi', id);
    const fondo = await ottieniFondo(obiettivo.fondoId);
    // Fondo prima, Obiettivo dopo: stesso ordine usato ovunque per non violare la coerenza.
    await aggiornaFondo(obiettivo.fondoId, { saldo: fondo.saldo - segno * importo });
    await aggiornaObiettivo(id, { saldoAccumulato: obiettivo.saldoAccumulato - segno * importo });
    return;
  }
  if (tipo === 'budget') {
    const ciclo = await ottieniCicloApertoDelBudget(id);
    await dbPut(STORE_CICLI, { ...ciclo, importoAssegnato: arrotonda(ciclo.importoAssegnato - segno * importo) });
  }
}

async function applicaTrasferimento(trasferimento, segno) {
  const { tipoOrigine, origineId, tipoDestinazione, destinazioneId, importo } = trasferimento;

  const contoOrigine = await contoDiEntita(tipoOrigine, origineId);
  const contoDestinazione = await contoDiEntita(tipoDestinazione, destinazioneId);

  // segno=+1: applica (origine cede, destinazione riceve). segno=-1: storna (movimento inverso).
  await applicaEarmark(tipoOrigine, origineId, importo, segno);
  await applicaEarmark(tipoDestinazione, destinazioneId, importo, -segno);

  // Il denaro reale cambia Conto solo se i due Conti sono realmente diversi.
  if (contoOrigine !== contoDestinazione) {
    const contoO = await ottieniConto(contoOrigine);
    const contoD = await ottieniConto(contoDestinazione);
    await aggiornaConto(contoOrigine, { saldoReale: contoO.saldoReale - segno * importo });
    await aggiornaConto(contoDestinazione, { saldoReale: contoD.saldoReale + segno * importo });
  }
}

export async function creaTrasferimento(dati) {
  const importo = Number(dati.importo);
  if (!importo || importo <= 0) throw new Error('L\'importo del Trasferimento deve essere maggiore di zero.');
  if (!TIPI_VALIDI.includes(dati.tipoOrigine) || !TIPI_VALIDI.includes(dati.tipoDestinazione)) {
    throw new Error('Tipo di origine o destinazione non valido.');
  }
  if (!dati.origineId || !dati.destinazioneId) {
    throw new Error('Seleziona sia l\'origine sia la destinazione del Trasferimento.');
  }
  if (dati.tipoOrigine === dati.tipoDestinazione && dati.origineId === dati.destinazioneId) {
    throw new Error('Origine e destinazione non possono coincidere.');
  }

  // Validazioni di disponibilità, specifiche per tipo di origine.
  if (dati.tipoOrigine === 'fondo') {
    const fondo = await dbGet('fondi', dati.origineId);
    if (!fondo) throw new Error('Fondo di origine non trovato.');
    if (fondo.saldo < importo) throw new Error(`Il Fondo ha solo ${fondo.saldo} € disponibili.`);
    await verificaRiduzioneCoerente(dati.origineId, fondo.saldo - importo);
  } else if (dati.tipoOrigine === 'obiettivo') {
    const obiettivo = await dbGet('obiettivi', dati.origineId);
    if (!obiettivo) throw new Error('Obiettivo di origine non trovato.');
    if (obiettivo.saldoAccumulato < importo) throw new Error(`L'Obiettivo ha solo ${obiettivo.saldoAccumulato} € accumulati.`);
  } else if (dati.tipoOrigine === 'conto') {
    const conto = await dbGet('conti', dati.origineId);
    if (!conto) throw new Error('Conto di origine non trovato.');
    const fondi = await dbGetAll('fondi');
    const verifica = verificaIntegritaConto(conto, fondi);
    if (verifica.liquiditaNonAllocata < importo) {
      throw new Error(
        `Il Conto ha solo ${verifica.liquiditaNonAllocata} € di liquidità non allocata: il resto è già earmarked nei Fondi.`
      );
    }
  } else if (dati.tipoOrigine === 'budget') {
    const ciclo = await ottieniCicloApertoDelBudget(dati.origineId);
    if (ciclo.importoAssegnato < importo) {
      throw new Error(`Il Ciclo Budget ha solo ${ciclo.importoAssegnato} € ancora assegnati.`);
    }
  }
  if (dati.tipoDestinazione === 'budget') {
    await ottieniCicloApertoDelBudget(dati.destinazioneId); // lancia errore se non esiste un Ciclo aperto
  }
  if (dati.tipoDestinazione === 'conto') {
    const contoDest = await dbGet('conti', dati.destinazioneId);
    if (!contoDest) throw new Error('Conto di destinazione non trovato.');
    if (contoDest.tipologia === 'spesa') {
      throw new Error('Un Conto di tipo "Spesa" non può ricevere denaro: deve restare sempre a saldo zero.');
    }
  }

  const now = oggiISO();
  const trasferimento = {
    id: generaId(),
    data: dati.data || now,
    tipoOrigine: dati.tipoOrigine,
    origineId: dati.origineId,
    tipoDestinazione: dati.tipoDestinazione,
    destinazioneId: dati.destinazioneId,
    importo,
    descrizione: dati.descrizione || '',
    stornata: false,
    dataCreazione: now
  };

  await applicaTrasferimento(trasferimento, +1);
  await dbAdd(STORE, trasferimento);
  return trasferimento;
}

export async function stornaTrasferimento(id, descrizioneStorno) {
  const trasferimento = await dbGet(STORE, id);
  if (!trasferimento) throw new Error('Trasferimento non trovato.');
  if (trasferimento.stornata) throw new Error('Questo Trasferimento è già stato stornato.');

  await applicaTrasferimento(trasferimento, -1);
  await dbPut(STORE, { ...trasferimento, stornata: true });
  return registraStorno({ tipoMovimento: 'trasferimento', movimentoId: id, descrizione: descrizioneStorno });
}

// Eliminazione DIRETTA (senza storno, senza annullare effetti). Solo per pulizia di dati rotti.
export async function eliminaTrasferimento(id) {
  await eliminaStorniPerMovimento(id);
  await dbDelete(STORE, id);
}

export async function ottieniTrasferimento(id) {
  return dbGet(STORE, id);
}

export async function elencoTrasferimenti() {
  const tutti = await dbGetAll(STORE);
  return tutti.sort((a, b) => new Date(b.data) - new Date(a.data));
}

// --- Movimenti speciali di chiusura Ciclo Budget (avanzo trasferito a un Fondo, o sforamento
// coperto da un Fondo) ---
//
// Segnalato dall'utente: un Budget non detiene mai patrimonio reale. Il denaro che "aveva a
// disposizione" era già virtualizzato al momento dell'Entrata che lo aveva generato — non
// risiede realmente sul Conto del Budget (tipicamente un Conto "Spesa", che deve restare
// sempre a zero). Quando il Ciclo si chiude con un avanzo o uno sforamento, quel valore diventa
// (o smette di essere) patrimonio VERO solo dal lato del Fondo. A differenza di un
// Trasferimento generico (dove il Conto reale si muove solo se origine e destinazione sono
// Conti realmente diversi), qui la regola è sempre la stessa indipendentemente dal Conto del
// Budget:
// - il saldoReale del Conto del FONDO viene sempre aggiornato: +importo se il Fondo riceve un
//   avanzo (nuovo patrimonio reale riconosciuto), -importo se il Fondo copre uno sforamento
//   (patrimonio reale consumato);
// - il saldoReale del Conto del BUDGET non viene MAI toccato, coincida o meno con quello del
//   Fondo.
// L'earmarking interno (Ciclo Budget ↔ saldo Fondo) resta invariato rispetto a un Trasferimento
// normale: cambia solo quale Conto reale viene movimentato.
async function applicaMovimentoCiclo(trasferimento, segno) {
  const { tipoOrigine, origineId, tipoDestinazione, destinazioneId, importo, causaleCiclo } = trasferimento;

  await applicaEarmark(tipoOrigine, origineId, importo, segno);
  await applicaEarmark(tipoDestinazione, destinazioneId, importo, -segno);

  // Il lato "patrimoniale" del movimento è quello diverso da 'budget': un Fondo o un suo
  // Obiettivo. In entrambi i casi il Conto reale da movimentare è quello del Fondo (per un
  // Obiettivo, il Fondo a cui appartiene) — riusa contoDiEntita, già in grado di risolvere
  // entrambi i casi.
  const tipoControparte = tipoOrigine === 'budget' ? tipoDestinazione : tipoOrigine;
  const idControparte = tipoOrigine === 'budget' ? destinazioneId : origineId;
  const contoId = await contoDiEntita(tipoControparte, idControparte);
  const conto = await ottieniConto(contoId);
  // direzione: +1 per un avanzo (la controparte riceve), -1 per uno sforamento (la controparte cede).
  // segno=+1 applica nel verso naturale della causale, segno=-1 storna (verso opposto).
  const direzione = causaleCiclo === 'avanzo' ? 1 : -1;
  await aggiornaConto(contoId, { saldoReale: conto.saldoReale + segno * direzione * importo });
}

export async function creaMovimentoChiusuraCiclo({ causaleCiclo, budgetId, tipoControparte, controparteId, importo }) {
  if (!['avanzo', 'sforamento'].includes(causaleCiclo)) {
    throw new Error('Causale non valida per un movimento di chiusura Ciclo.');
  }
  if (!['fondo', 'obiettivo'].includes(tipoControparte)) {
    throw new Error('Seleziona un Fondo o un Obiettivo come controparte del movimento.');
  }
  const importoNum = Number(importo);
  if (!importoNum || importoNum <= 0) throw new Error('Importo non valido per il movimento di chiusura Ciclo.');

  const budget = await dbGet('budget', budgetId);
  if (!budget) throw new Error('Budget non trovato.');

  let saldoDisponibileControparte;
  if (tipoControparte === 'fondo') {
    const fondo = await dbGet('fondi', controparteId);
    if (!fondo) throw new Error('Fondo non trovato.');
    saldoDisponibileControparte = fondo.saldo;
  } else {
    const obiettivo = await dbGet('obiettivi', controparteId);
    if (!obiettivo) throw new Error('Obiettivo non trovato.');
    saldoDisponibileControparte = obiettivo.saldoAccumulato;
  }

  if (causaleCiclo === 'sforamento') {
    if (saldoDisponibileControparte < importoNum) {
      throw new Error(`La controparte scelta ha solo ${saldoDisponibileControparte} € disponibili per coprire lo sforamento.`);
    }
    // Il controllo di coerenza rispetto agli Obiettivi (saldo Obiettivi <= saldo Fondo) ha senso
    // solo quando è il Fondo stesso a cedere: se cede un Obiettivo, il suo saldo si riduce e
    // quello del Fondo con lui, nello stesso ordine già usato ovunque (Fondo prima, Obiettivo dopo).
    if (tipoControparte === 'fondo') {
      await verificaRiduzioneCoerente(controparteId, saldoDisponibileControparte - importoNum);
    }
  }

  const now = oggiISO();
  const trasferimento = {
    id: generaId(),
    data: now,
    tipoOrigine: causaleCiclo === 'avanzo' ? 'budget' : tipoControparte,
    origineId: causaleCiclo === 'avanzo' ? budgetId : controparteId,
    tipoDestinazione: causaleCiclo === 'avanzo' ? tipoControparte : 'budget',
    destinazioneId: causaleCiclo === 'avanzo' ? controparteId : budgetId,
    importo: importoNum,
    descrizione: causaleCiclo === 'avanzo'
      ? `AVANZO BUDGET: residuo positivo di Ciclo trasferito a${tipoControparte === 'fondo' ? ' un Fondo' : ' un Obiettivo'}`
      : `SFORAMENTO BUDGET: sforamento coperto da${tipoControparte === 'fondo' ? ' un Fondo' : ' un Obiettivo'}`,
    causaleCiclo, // 'avanzo' | 'sforamento' — assente su un Trasferimento normale
    stornata: false,
    dataCreazione: now
  };

  await applicaMovimentoCiclo(trasferimento, +1);
  await dbAdd(STORE, trasferimento);
  return trasferimento;
}

// Storno dedicato: usa applicaMovimentoCiclo (non applicaTrasferimento) per invertire
// correttamente il movimento asimmetrico. Non esposto come azione manuale "Storna" nel Registro
// Movimenti (la UI lo nasconde per le righe con causaleCiclo): l'unico modo corretto per
// annullarlo è "Riapri Ciclo", che tiene sincronizzato anche lo stato del Ciclo stesso.
export async function stornaMovimentoChiusuraCiclo(id, descrizioneStorno) {
  const trasferimento = await dbGet(STORE, id);
  if (!trasferimento) throw new Error('Movimento di chiusura Ciclo non trovato.');
  if (trasferimento.stornata) throw new Error('Questo movimento è già stato stornato.');

  await applicaMovimentoCiclo(trasferimento, -1);
  await dbPut(STORE, { ...trasferimento, stornata: true });
  return registraStorno({ tipoMovimento: 'trasferimento', movimentoId: id, descrizione: descrizioneStorno });
}
