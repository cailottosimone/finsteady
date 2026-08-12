// Dominio: Ciclo Budget (Fase 2) — istanza di un Budget per un determinato periodo, con
// assegnato/utilizzato/residuo. Il periodo è UNICO e globale per tutta l'app (decisione
// esplicita dell'utente): si aprono tutti i Cicli Budget insieme, per lo stesso periodo.
//
// Alla chiusura, il residuo positivo o negativo non si gestisce mai automaticamente: è sempre
// una scelta esplicita dell'utente tra alcune opzioni (assistente, non automatismo, §1.3/§5.9
// FDD). Le opzioni che coinvolgono un Fondo o un suo Obiettivo generano un vero movimento
// (tracciato, stornabile), riusando lo stesso motore già esistente.

import { dbAdd, dbGet, dbGetAll, dbPut, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { arrotonda } from '../utils/denaro.js';
import { ottieniImpostazioniCiclo } from './impostazioniCiclo.js';
import { calcolaPeriodoIniziale, calcolaPeriodoSuccessivo } from '../engine/cicloCalc.js';
import { creaMovimentoChiusuraCiclo, stornaMovimentoChiusuraCiclo, stornaTrasferimento, ottieniTrasferimento } from './trasferimenti.js';

const STORE = 'budgetCicli';

function piuRecentePerFine(cicli) {
  return cicli.reduce((piuRecente, c) => (new Date(c.periodoFine) > new Date(piuRecente.periodoFine) ? c : piuRecente));
}

// Apre un nuovo Ciclo Budget per OGNI Budget attivo, tutti con lo stesso periodo (calcolato
// dalle impostazioni globali). Blocca se esiste già un Ciclo aperto: va chiuso prima.
export async function apriNuovoCiclo() {
  const tuttiICicli = await dbGetAll(STORE);
  if (tuttiICicli.some((c) => c.stato === 'aperto')) {
    throw new Error('Esiste già un Ciclo aperto: chiudilo prima di aprirne uno nuovo.');
  }

  const impostazioni = await ottieniImpostazioniCiclo();
  const cicliChiusi = tuttiICicli.filter((c) => c.stato === 'chiuso');
  const periodo = cicliChiusi.length === 0
    ? calcolaPeriodoIniziale(new Date(), impostazioni)
    : calcolaPeriodoSuccessivo(new Date(piuRecentePerFine(cicliChiusi).periodoFine), impostazioni);

  const budgetAttivi = (await dbGetAll('budget')).filter((b) => b.stato === 'attivo');
  if (budgetAttivi.length === 0) {
    throw new Error('Non esiste alcun Budget attivo: creane almeno uno prima di aprire un Ciclo.');
  }

  const now = oggiISO();
  const nuoviCicli = [];
  for (const b of budgetAttivi) {
    const cicliDelBudget = cicliChiusi.filter((c) => c.budgetId === b.id);
    const ultimo = cicliDelBudget.length > 0 ? piuRecentePerFine(cicliDelBudget) : null;
    const riportoIniziale = ultimo ? arrotonda(ultimo.riportoPerProssimo || 0) : 0;

    const ciclo = {
      id: generaId(),
      budgetId: b.id,
      periodoInizio: periodo.inizio.toISOString(),
      periodoFine: periodo.fine.toISOString(),
      importoAssegnato: arrotonda(b.importoAssegnatoDefault) || 0,
      riportoIniziale,
      importoUtilizzato: null,
      residuo: null,
      residuoAzione: null,
      riportoPerProssimo: null,
      trasferimentoChiusuraId: null,
      controparteTipo: null,
      controparteNome: null,
      stato: 'aperto',
      dataCreazione: now,
      dataChiusura: null
    };
    await dbAdd(STORE, ciclo);
    nuoviCicli.push(ciclo);
  }
  return { periodo, cicli: nuoviCicli };
}

// Chiude un singolo Ciclo Budget. Se il residuo è positivo o negativo, richiede una scelta
// esplicita dell'utente (mai un automatismo):
//  - residuo positivo: 'mantieni' | 'trasferisci_fondo' (richiede fondoId) | 'libera'
//  - residuo negativo: 'riporta' | 'copri_fondo' (richiede fondoId) | 'usa_liquidita'
export async function chiudiCiclo(cicloId, importoUtilizzato, scelta, tipoControparte, controparteId) {
  let ciclo = await dbGet(STORE, cicloId);
  if (!ciclo) throw new Error('Ciclo Budget non trovato.');
  if (ciclo.stato !== 'aperto') throw new Error('Questo Ciclo è già chiuso.');

  // Fotografato PRIMA di generare l'eventuale movimento di chiusura: quel movimento aggiorna
  // anche l'importoAssegnato del Ciclo (per azzerare il residuo internamente), ma nel Consuntivo
  // e nello Storico Cicli l'utente deve vedere l'Assegnato *originale* del periodo — segnalato
  // dall'utente: altrimenti un Assegnato "Budget + sforamento coperto" risulta incomprensibile.
  const importoAssegnatoOriginale = ciclo.importoAssegnato;
  const utilizzato = arrotonda(Number(importoUtilizzato) || 0);
  const residuo = arrotonda(importoAssegnatoOriginale + ciclo.riportoIniziale - utilizzato);

  let riportoPerProssimo = 0;
  let residuoAzione = 'nessuno';
  let trasferimentoChiusuraId = null;
  let controparteTipo = null;
  let controparteNome = null;

  if (residuo > 0.005) {
    if (scelta === 'mantieni') {
      riportoPerProssimo = residuo;
      residuoAzione = 'mantenuto';
    } else if (scelta === 'trasferisci_fondo') {
      if (!controparteId) throw new Error('Seleziona il Fondo o l\'Obiettivo a cui trasferire il residuo.');
      const trasferimento = await creaMovimentoChiusuraCiclo({
        causaleCiclo: 'avanzo', budgetId: ciclo.budgetId, tipoControparte, controparteId, importo: residuo
      });
      trasferimentoChiusuraId = trasferimento.id;
      residuoAzione = 'trasferito';
      controparteTipo = tipoControparte;
      controparteNome = await risolviNomeControparte(tipoControparte, controparteId);
    } else if (scelta === 'libera') {
      residuoAzione = 'liberato';
    } else {
      throw new Error('Seleziona come gestire il residuo positivo: mantieni, trasferisci a un Fondo, o libera liquidità.');
    }
  } else if (residuo < -0.005) {
    if (scelta === 'riporta') {
      riportoPerProssimo = residuo;
      residuoAzione = 'riportato';
    } else if (scelta === 'copri_fondo') {
      if (!controparteId) throw new Error('Seleziona il Fondo o l\'Obiettivo che copre lo sforamento.');
      const trasferimento = await creaMovimentoChiusuraCiclo({
        causaleCiclo: 'sforamento', budgetId: ciclo.budgetId, tipoControparte, controparteId, importo: -residuo
      });
      trasferimentoChiusuraId = trasferimento.id;
      residuoAzione = 'coperto';
      controparteTipo = tipoControparte;
      controparteNome = await risolviNomeControparte(tipoControparte, controparteId);
    } else if (scelta === 'usa_liquidita') {
      residuoAzione = 'liquidita';
    } else {
      throw new Error('Seleziona come coprire lo sforamento: riporta al prossimo ciclo, copri con un Fondo, o usa liquidità libera.');
    }
  }

  // Ri-recupera solo per i campi tecnici stabili (id, budgetId, date...): importoAssegnato e
  // residuo vengono comunque sovrascritti sotto con i valori "puliti" (originali), non con
  // quelli mutati dal movimento di chiusura appena generato.
  ciclo = await dbGet(STORE, cicloId);

  const chiuso = {
    ...ciclo,
    importoAssegnato: importoAssegnatoOriginale,
    importoUtilizzato: utilizzato,
    residuo, // quanto avanzato (positivo) o sforato (negativo) nel periodo — valore originale
    residuoAzione,
    riportoPerProssimo,
    trasferimentoChiusuraId,
    controparteTipo, // 'fondo' | 'obiettivo' | null
    controparteNome, // nome congelato al momento della chiusura, indipendente da modifiche future
    stato: 'chiuso',
    dataChiusura: oggiISO()
  };
  await dbPut(STORE, chiuso);
  return chiuso;
}

async function risolviNomeControparte(tipo, id) {
  if (tipo === 'fondo') return (await dbGet('fondi', id))?.nome || null;
  if (tipo === 'obiettivo') return (await dbGet('obiettivi', id))?.nome || null;
  return null;
}

export async function elencoCicliAperti() {
  const tutti = await dbGetAll(STORE);
  return tutti.filter((c) => c.stato === 'aperto');
}

export async function elencoCicliPerBudget(budgetId) {
  const tutti = await dbGetAll(STORE);
  return tutti
    .filter((c) => c.budgetId === budgetId)
    .sort((a, b) => new Date(b.periodoInizio) - new Date(a.periodoInizio));
}

export async function elencoTuttiICicli() {
  const tutti = await dbGetAll(STORE);
  return tutti.sort((a, b) => new Date(b.periodoInizio) - new Date(a.periodoInizio));
}

// Riapertura di un Ciclo chiuso (richiesta esplicita dell'utente, §1.3 FDD "nessun automatismo
// silenzioso": qui l'automatismo è sempre un'azione deliberata dell'utente, mai implicita).
//
// Consentita SOLO se il Ciclo è ancora "l'ultimo" per il proprio periodo: se nel frattempo è
// già stato aperto un periodo successivo (per QUALSIASI Budget, dato che il periodo è globale),
// riaprire creerebbe una sovrapposizione o un buco nella cronologia — non permesso, coerente
// col principio "nessuna sovrapposizione né buchi" di apriNuovoCiclo.
//
// Se la chiusura aveva generato un vero Trasferimento (Budget↔Fondo, per residuo trasferito o
// sforamento coperto), viene stornato tramite il normale meccanismo di Storno — MAI annullato
// silenziosamente: resta nel Registro Movimenti come evento stornato, tracciabile.
function trovaEsistePeriodoSuccessivo(tutti, ciclo) {
  return tutti.some((c) => c.id !== ciclo.id && new Date(c.periodoInizio) > new Date(ciclo.periodoInizio));
}

// Elenca i Cicli chiusi che possono essere riaperti in questo momento (nessun periodo
// successivo già aperto per nessun Budget). Usata sia per la riapertura singola (per decidere
// se mostrare l'azione) sia per la riapertura "di tutti".
export async function elencoCicliRiapribili() {
  const tutti = await dbGetAll(STORE);
  return tutti.filter((c) => c.stato === 'chiuso' && !trovaEsistePeriodoSuccessivo(tutti, c));
}

export async function riapriCiclo(cicloId) {
  const tutti = await dbGetAll(STORE);
  const ciclo = tutti.find((c) => c.id === cicloId);
  if (!ciclo) throw new Error('Ciclo Budget non trovato.');
  if (ciclo.stato !== 'chiuso') throw new Error('Questo Ciclo non è chiuso: non c\'è nulla da riaprire.');

  if (trovaEsistePeriodoSuccessivo(tutti, ciclo)) {
    throw new Error(
      'È già stato aperto un periodo successivo: riaprire questo Ciclo creerebbe una sovrapposizione nella cronologia. Non consentito.'
    );
  }

  if (ciclo.residuoAzione === 'trasferito' || ciclo.residuoAzione === 'coperto') {
    if (!ciclo.trasferimentoChiusuraId) {
      throw new Error(
        'Questo Ciclo è stato chiuso con una versione precedente dell\'app, senza un riferimento tracciato al ' +
        'Trasferimento generato in chiusura: non può essere riaperto automaticamente.'
      );
    }
    // Il Ciclo va riportato "aperto" PRIMA di stornare il Trasferimento: lo storno, per la parte
    // che riguarda il Budget, si aspetta di trovare un Ciclo aperto su cui applicare l'earmark
    // inverso (stessa logica già usata per applicare il Trasferimento alla chiusura).
    // Compatibilità: un Trasferimento di chiusura creato PRIMA di questa correzione non ha
    // `causaleCiclo` — va stornato con il motore generico (con cui era stato creato), non con
    // quello dedicato (che assumerebbe erroneamente la nuova logica di movimentazione asimmetrica
    // su dati che non la seguono).
    const trasferimentoDaStornare = await ottieniTrasferimento(ciclo.trasferimentoChiusuraId);
    await dbPut(STORE, { ...ciclo, stato: 'aperto' });
    if (trasferimentoDaStornare?.causaleCiclo) {
      await stornaMovimentoChiusuraCiclo(ciclo.trasferimentoChiusuraId, 'Riapertura Ciclo Budget');
    } else {
      await stornaTrasferimento(ciclo.trasferimentoChiusuraId, 'Riapertura Ciclo Budget');
    }
  }

  const cicloAggiornato = await dbGet(STORE, cicloId);
  const riaperto = {
    ...cicloAggiornato,
    stato: 'aperto',
    importoUtilizzato: null,
    residuo: null,
    residuoAzione: null,
    riportoPerProssimo: null,
    trasferimentoChiusuraId: null,
    controparteTipo: null,
    controparteNome: null,
    dataChiusura: null
  };
  await dbPut(STORE, riaperto);
  return riaperto;
}

// Riapre tutti i Cicli attualmente riapribili. Come "Chiudi tutti i Cicli", è un'unica azione
// che opera su più Budget insieme, ma ciascun Ciclo viene riaperto individualmente: se uno
// fallisce (caso limite), gli altri procedono comunque e il fallimento viene segnalato.
export async function riapriTuttiICicli() {
  const riapribili = await elencoCicliRiapribili();
  const riaperti = [];
  const saltati = [];
  for (const c of riapribili) {
    try {
      const r = await riapriCiclo(c.id);
      riaperti.push(r);
    } catch (err) {
      saltati.push({ cicloId: c.id, budgetId: c.budgetId, motivo: err.message });
    }
  }
  return { riaperti, saltati };
}

// Storno apertura Ciclo — richiesta esplicita dell'utente: correggere un periodo aperto per
// errore/prova (es. aperto e chiuso "per vedere come funziona"), facendolo sparire dallo
// storico come se non fosse mai stato aperto. Diverso da riapriCiclo: quella riporta un Ciclo
// chiuso allo stato 'aperto' (resta comunque un Ciclo, da richiudere per davvero); questa lo
// elimina fisicamente.
//
// Copre in un solo passo sia il caso "il periodo è ancora aperto" sia "il periodo è già stato
// chiuso" (in quel caso lo riapre prima, tramite lo stesso riapriCiclo — che storna l'eventuale
// Trasferimento di chiusura, mai cancellato in silenzio, resta nel Registro Movimenti come
// evento stornato).
//
// Consentito solo sull'ULTIMO periodo della catena: essendo il periodo globale e condiviso da
// tutti i Budget, ed essendo vietato aprire un nuovo Ciclo mentre uno è già aperto
// (apriNuovoCiclo) o riaprire un Ciclo se esiste un periodo successivo (riapriCiclo), il periodo
// coinvolto è per costruzione sempre l'ultimo — nessun controllo aggiuntivo necessario per
// garantire la cascata "solo dal più recente indietro". Per annullare più periodi in fila, va
// richiamata una volta per periodo, a partire dal più recente.
//
// Bloccata se per il periodo esiste già un Consuntivo: quello è una fotografia congelata e
// indipendente (mai modificabile), annullare i Cicli sottostanti la lascerebbe incoerente.
export async function stornaAperturaCiclo(periodoInizio, periodoFine) {
  const tutti = await dbGetAll(STORE);
  const cicliDelPeriodo = tutti.filter((c) => c.periodoInizio === periodoInizio && c.periodoFine === periodoFine);
  if (cicliDelPeriodo.length === 0) throw new Error('Nessun Ciclo Budget trovato per questo periodo.');

  const consuntivi = await dbGetAll('consuntivi');
  const giaFotografato = consuntivi.some(
    (cn) => cn.periodoInizio === periodoInizio && cn.periodoFine === periodoFine
  );
  if (giaFotografato) {
    throw new Error(
      'Esiste già un Consuntivo per questo periodo: non può essere annullato (il Consuntivo è una ' +
      'fotografia congelata, mai modificabile). Elimina prima il Consuntivo, se davvero necessario.'
    );
  }

  for (const c of cicliDelPeriodo) {
    if (c.stato === 'chiuso') {
      await riapriCiclo(c.id);
    }
  }

  for (const c of cicliDelPeriodo) {
    await dbDelete(STORE, c.id);
  }

  return { periodoInizio, periodoFine, numeroBudget: cicliDelPeriodo.length };
}
