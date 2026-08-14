// Dominio: Allocazione — distribuzione reale di una specifica entrata (§2.9 / §3.4 FDD).
// Questo è l'UNICO modulo che, a partire da righe già decise e confermate dall'utente,
// scrive gli effetti su Fondi e Obiettivi. Il motore in engine/allocationEngine.js propone,
// questo modulo esegue solo dopo conferma esplicita.

import { dbAdd, dbGet, dbGetAll, dbPut, dbDelete, dbGetAllByIndex } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { ottieniFondo, aggiornaFondo, verificaRiduzioneCoerente } from './fondi.js';
import { aggiornaObiettivo } from './obiettivi.js';
import { ottieniConto, aggiornaConto } from './conti.js';
import { registraStorno, eliminaStorniPerMovimento } from './storni.js';
import { importiCoincidono, sommaRighe } from '../engine/allocationEngine.js';

const STORE = 'allocazioni';
const STORE_RIGHE = 'allocazioniRighe';

// Calcola su quale Conto deve avvenire il movimento per una riga, in base al tipo di destinazione.
async function risolviContoMovimento(riga) {
  if (riga.tipoDestinazione === 'residuo_conto') return riga.contoOrigineId;
  if (riga.tipoDestinazione === 'fondo') {
    const fondo = await dbGet('fondi', riga.destinazioneId);
    if (!fondo) throw new Error('Fondo di destinazione non trovato.');
    return fondo.contoId;
  }
  if (riga.tipoDestinazione === 'obiettivo') {
    const obiettivo = await dbGet('obiettivi', riga.destinazioneId);
    if (!obiettivo) throw new Error('Obiettivo di destinazione non trovato.');
    const fondo = await dbGet('fondi', obiettivo.fondoId);
    if (!fondo) throw new Error('Fondo dell\'Obiettivo non trovato.');
    return fondo.contoId;
  }
  if (riga.tipoDestinazione === 'budget') {
    const budget = await dbGet('budget', riga.destinazioneId);
    if (!budget) throw new Error('Budget di destinazione non trovato.');
    return budget.contoId;
  }
  if (riga.tipoDestinazione === 'conto') {
    const conto = await dbGet('conti', riga.destinazioneId);
    if (!conto) throw new Error('Conto di destinazione non trovato.');
    return conto.id;
  }
  throw new Error('Tipo di destinazione riga non riconosciuto.');
}

// Nome ed etichetta leggibile della destinazione di una singola riga (usato solo per il
// dettaglio esplicativo delle istruzioni operative, mai per la logica di calcolo).
async function etichettaDestinazioneRiga(r) {
  if (r.tipoDestinazione === 'fondo') {
    const f = await dbGet('fondi', r.destinazioneId);
    return { tipo: 'Fondo', nome: f ? f.nome : '(Fondo eliminato)' };
  }
  if (r.tipoDestinazione === 'budget') {
    const b = await dbGet('budget', r.destinazioneId);
    return { tipo: 'Budget', nome: b ? b.nome : '(Budget eliminato)' };
  }
  if (r.tipoDestinazione === 'obiettivo') {
    const o = await dbGet('obiettivi', r.destinazioneId);
    return { tipo: 'Obiettivo', nome: o ? o.nome : '(Obiettivo eliminato)' };
  }
  if (r.tipoDestinazione === 'conto') {
    return { tipo: null, nome: 'Liquidità diretta sul Conto' };
  }
  return { tipo: null, nome: 'Disponibilità residua non allocata' }; // residuo_conto
}

// Genera l'elenco di istruzioni operative (§3.12 FDD): raggruppa le righe per Conto di
// destinazione. Se il Conto coincide con quello di origine, l'istruzione è "mantieni";
// altrimenti è "bonifica verso". Ogni istruzione porta con sé anche il "dettaglio": le singole
// righe che compongono quel totale (es. un bonifico verso un Conto può derivare da più Fondi/
// Budget insieme) — segnalato dall'utente: il totale aggregato per Conto nascondeva come quella
// cifra fosse a sua volta suddivisa tra le destinazioni reali all'interno del Conto.
async function generaIstruzioniOperative(contoOrigineId, righeConConto) {
  const totaliPerConto = new Map();
  const dettaglioPerConto = new Map();
  for (const r of righeConConto) {
    const attuale = totaliPerConto.get(r.contoMovimentoId) || 0;
    totaliPerConto.set(r.contoMovimentoId, attuale + Number(r.importo));

    const { tipo, nome } = await etichettaDestinazioneRiga(r);
    const dettaglio = dettaglioPerConto.get(r.contoMovimentoId) || [];
    dettaglio.push({ tipo, nome, importo: Number(r.importo) });
    dettaglioPerConto.set(r.contoMovimentoId, dettaglio);
  }

  const istruzioni = [];
  for (const [contoId, importo] of totaliPerConto.entries()) {
    if (importo <= 0) continue;
    const conto = await dbGet('conti', contoId);
    const nomeConto = conto ? conto.nome : 'Conto sconosciuto';
    const dettaglio = dettaglioPerConto.get(contoId) || [];
    if (contoId === contoOrigineId) {
      istruzioni.push({ tipo: 'mantieni', contoId, testo: `Mantieni ${importo.toFixed(2)} € sul Conto ${nomeConto}`, dettaglio });
    } else {
      istruzioni.push({ tipo: 'bonifica', contoId, testo: `Bonifica ${importo.toFixed(2)} € verso ${nomeConto}`, dettaglio });
    }
  }
  return istruzioni;
}

// Conferma un'Allocazione: valida, persiste, applica gli effetti su Fondi/Obiettivi,
// genera le istruzioni operative. Nessun effetto viene applicato se la validazione fallisce.
//
// righe atteso: [{ tipoDestinazione: 'fondo'|'budget'|'obiettivo'|'residuo_conto', destinazioneId, importo }]
export async function confermaAllocazione({ data, importoEntrata, contoOrigineId, descrizione, strategia, righe }) {
  const importo = Number(importoEntrata);
  if (!importo || importo <= 0) {
    throw new Error('L\'importo dell\'entrata deve essere maggiore di zero.');
  }
  if (!contoOrigineId) {
    throw new Error('Seleziona il Conto sul quale è arrivata l\'entrata.');
  }
  if (!righe || righe.length === 0) {
    throw new Error('Aggiungi almeno una riga di allocazione.');
  }
  if (!importiCoincidono(importo, righe)) {
    const somma = sommaRighe(righe);
    throw new Error(
      `La somma delle allocazioni (${somma.toFixed(2)} €) non coincide con l'importo dell'entrata (${importo.toFixed(2)} €). ` +
      (somma > importo ? 'Hai allocato più denaro di quello disponibile.' : 'Non hai allocato tutto il denaro disponibile.')
    );
  }

  // Risolve il conto di movimento per ciascuna riga PRIMA di applicare qualsiasi effetto,
  // così un errore di validazione non lascia il sistema in uno stato intermedio incoerente.
  const righeConConto = [];
  for (const r of righe) {
    const contoMovimentoId = await risolviContoMovimento({ ...r, contoOrigineId });
    righeConConto.push({ ...r, contoMovimentoId });
  }

  const now = oggiISO();
  const allocazioneId = generaId();

  // Applica gli effetti reali: aggiorna Fondi e Obiettivi.
  // I Budget NON vengono aggiornati in questa fase (vedi nota in domain/budget.js e CHANGELOG):
  // la loro contabilità reale arriverà con i Cicli Budget in Fase 2.
  for (const r of righeConConto) {
    if (r.tipoDestinazione === 'fondo') {
      const fondo = await ottieniFondo(r.destinazioneId);
      await aggiornaFondo(r.destinazioneId, { saldo: fondo.saldo + Number(r.importo) });
    } else if (r.tipoDestinazione === 'obiettivo') {
      const obiettivo = await dbGet('obiettivi', r.destinazioneId);
      const fondo = await ottieniFondo(obiettivo.fondoId);
      // Aggiorniamo prima il Fondo (il denaro reale cresce) e solo dopo l'Obiettivo (la sua
      // quota interna), così il controllo di coerenza in aggiornaObiettivo non fallisce mai
      // per un ordine di scrittura sbagliato.
      await aggiornaFondo(obiettivo.fondoId, { saldo: fondo.saldo + Number(r.importo) });
      await aggiornaObiettivo(r.destinazioneId, { saldoAccumulato: obiettivo.saldoAccumulato + Number(r.importo) });
    }
    // 'budget' e 'residuo_conto': nessun aggiornamento di saldo in questa fase.
  }

  // Applica il movimento REALE di denaro sui Conti coinvolti (bug corretto: prima l'intera
  // entrata non veniva mai accreditata a nessun Conto, creando un'incoerenza immediata con
  // §5.20 — "se il totale dei Fondi in un Conto aumenta, deve aumentare anche il Conto").
  // L'intera entrata arriva fisicamente sul Conto di origine; per le righe il cui Conto di
  // movimento è diverso (bonifico verso un altro Conto, come già mostrato nelle istruzioni
  // operative), il denaro si sposta di conseguenza — stessa logica già usata in trasferimenti.js.
  //
  // Due eccezioni esplicite, in cui il denaro NON si muove davvero verso quel Conto specifico
  // (pur restando l'istruzione operativa "sposta/lascia" come semplice indicazione all'utente):
  //  - destinazione Budget: il Budget non è patrimonio (decisione esplicita dell'utente); non
  //    crea mai un movimento reale, solo l'indicazione di dove destinare quella parte di entrata.
  //  - destinazione un Conto di tipo "Spesa" (compreso il caso in cui coincide col Conto di
  //    arrivo dell'entrata): un Conto Spesa deve sempre restare a saldo zero, quindi non riceve
  //    mai un movimento reale, né in entrata né in uscita.
  // NOTA (bug corretto — segnalato dall'utente): il Conto di ARRIVO essendo di tipo "Spesa"
  // deve impedire SOLO che il proprio saldo si muova (vincolo permanente: un Conto Spesa non è
  // mai modificato da un'Entrata). Non deve però impedire i bonifici reali verso Conti diversi
  // (es. i Conti Risparmio dei Fondi/Obiettivi su cui l'utente ha distribuito l'entrata): quelli
  // restano movimenti reali a tutti gli effetti, esattamente come quando il Conto di arrivo è di
  // tipo "risparmio". La versione precedente saltava l'intero blocco anche per queste righe,
  // lasciando i saldi dei Conti Risparmio coinvolti invariati pur avendo già accreditato i loro
  // Fondi/Obiettivi — un'incoerenza vera, non voluta.
  const contoOrigine = await ottieniConto(contoOrigineId);
  let nuovoSaldoOrigine = contoOrigine.saldoReale + importo;
  for (const r of righeConConto) {
    let contoMovimentoReale = r.tipoDestinazione === 'budget' ? contoOrigineId : r.contoMovimentoId;
    if (contoMovimentoReale !== contoOrigineId) {
      const contoDestinazioneCheck = await ottieniConto(contoMovimentoReale);
      if (contoDestinazioneCheck && contoDestinazioneCheck.tipologia === 'spesa') {
        contoMovimentoReale = contoOrigineId;
      }
    }
    if (contoMovimentoReale !== contoOrigineId) {
      nuovoSaldoOrigine -= Number(r.importo);
      const contoDestinazione = await ottieniConto(contoMovimentoReale);
      await aggiornaConto(contoMovimentoReale, { saldoReale: contoDestinazione.saldoReale + Number(r.importo) });
    }
  }
  // Il saldo del Conto di arrivo si aggiorna solo se non è "Spesa" (vincolo permanente).
  // Le righe che restano lì (Budget, Disponibilità residua, o un Fondo/Obiettivo il cui Conto è
  // esso stesso di tipo Spesa) non generano quindi alcun movimento reale su di esso, coerente
  // con "un Conto Spesa non ha mai un saldo diverso da zero".
  if (contoOrigine.tipologia !== 'spesa') {
    await aggiornaConto(contoOrigineId, { saldoReale: nuovoSaldoOrigine });
  }

  const istruzioniOperative = await generaIstruzioniOperative(contoOrigineId, righeConConto);

  const allocazione = {
    id: allocazioneId,
    data: data || now,
    importoEntrata: importo,
    contoOrigineId,
    descrizione: descrizione || '',
    strategia,
    stato: 'confermata',
    dataConferma: now,
    istruzioniOperative
  };
  await dbAdd(STORE, allocazione);

  for (const r of righeConConto) {
    await dbAdd(STORE_RIGHE, {
      id: generaId(),
      allocazioneId,
      tipoDestinazione: r.tipoDestinazione,
      destinazioneId: r.destinazioneId || null,
      importo: Number(r.importo),
      contoMovimentoId: r.contoMovimentoId
    });
  }

  return { allocazione, istruzioniOperative };
}

// Eliminazione DIRETTA di una riga (senza storno, senza annullare alcun effetto sul saldo).
// Va usata solo per pulizia di dati ormai rotti (es. righe orfane che puntano a Fondi/Obiettivi
// eliminati), MAI per correggere una riga valida — in quel caso usa sempre stornaRigaAllocazione,
// che preserva lo storico. Decisione esplicita dell'utente: "so che non è giusto, ma
// correggendo questi bug ci sono un'infinità di movimenti da pulire".
export async function eliminaRigaAllocazione(rigaId) {
  await eliminaStorniPerMovimento(rigaId);
  await dbDelete(STORE_RIGHE, rigaId);
}

export async function elencoAllocazioni() {
  const tutte = await dbGetAll(STORE);
  return tutte.sort((a, b) => new Date(b.data) - new Date(a.data));
}

export async function elencoRighePerAllocazione(allocazioneId) {
  return dbGetAllByIndex(STORE_RIGHE, 'allocazioneId', allocazioneId);
}

export async function elencoTutteLeRighe() {
  return dbGetAll(STORE_RIGHE);
}

// Storna una singola riga di un'Allocazione già confermata (decisione esplicita dell'utente:
// le Allocazioni sono eventi storici immutabili — non si modificano né si eliminano mai).
// Genera un movimento inverso che annulla l'effetto sul Fondo/Obiettivo coinvolto, marca la
// riga come "stornata" (senza toccarne gli altri dati) e registra lo Storno per la tracciabilità.
// Non impone alcun obbligo di ridistribuire l'importo stornato altrove: è una scelta successiva,
// facoltativa, dell'utente.
export async function stornaRigaAllocazione(rigaId, descrizioneStorno) {
  const riga = await dbGet(STORE_RIGHE, rigaId);
  if (!riga) throw new Error('Riga di Allocazione non trovata.');
  if (riga.stornata) throw new Error('Questa riga è già stata stornata.');

  const allocazione = await dbGet(STORE, riga.allocazioneId);
  if (!allocazione) throw new Error('Allocazione collegata non trovata.');

  if (riga.tipoDestinazione === 'fondo') {
    const fondo = await ottieniFondo(riga.destinazioneId);
    if (!fondo) throw new Error('Fondo di destinazione non trovato.');
    if (fondo.saldo < riga.importo) {
      throw new Error(`Il Fondo ha solo ${fondo.saldo} € disponibili: non è possibile stornare ${riga.importo} €.`);
    }
    await verificaRiduzioneCoerente(riga.destinazioneId, fondo.saldo - riga.importo);
    await aggiornaFondo(riga.destinazioneId, { saldo: fondo.saldo - riga.importo });
  } else if (riga.tipoDestinazione === 'obiettivo') {
    const obiettivo = await dbGet('obiettivi', riga.destinazioneId);
    if (!obiettivo) throw new Error('Obiettivo di destinazione non trovato.');
    if (obiettivo.saldoAccumulato < riga.importo) {
      throw new Error(`L'Obiettivo ha solo ${obiettivo.saldoAccumulato} € accumulati: non è possibile stornare ${riga.importo} €.`);
    }
    const fondo = await ottieniFondo(obiettivo.fondoId);
    // In una riduzione, entrambi gli ordini di scrittura sono matematicamente sicuri rispetto
    // al controllo di coerenza (a differenza di un aumento, dove l'ordine conta): manteniamo
    // Obiettivo poi Fondo per leggibilità, simmetrico alla creazione che fa Fondo poi Obiettivo.
    await aggiornaObiettivo(riga.destinazioneId, { saldoAccumulato: obiettivo.saldoAccumulato - riga.importo });
    await aggiornaFondo(obiettivo.fondoId, { saldo: fondo.saldo - riga.importo });
  }
  // 'budget' e 'residuo_conto': nessun effetto reale sul Fondo/Obiettivo da annullare.

  // Annulla anche l'eventuale movimento REALE di denaro tra Conti (bug corretto): se questa
  // riga aveva spostato denaro verso un Conto diverso da quello di arrivo dell'entrata, lo
  // storno deve farlo tornare indietro, altrimenti quel denaro resterebbe "duplicato". Stesse
  // eccezioni della conferma: per destinazione Budget, verso un Conto di tipo "Spesa", o se il
  // Conto di arrivo dell'entrata è esso stesso di tipo "Spesa", nessun movimento reale era mai
  // avvenuto — quindi non c'è nulla da annullare qui.
  // Vedi nota gemella in confermaAllocazione: un Conto Spesa come Conto di arrivo blocca solo
  // il proprio saldo, non lo storno del movimento reale verso gli ALTRI Conti coinvolti.
  const contoOrigineRecord = await ottieniConto(allocazione.contoOrigineId);
  if (contoOrigineRecord) {
    let contoMovimentoReale = riga.tipoDestinazione === 'budget' ? allocazione.contoOrigineId : riga.contoMovimentoId;
    if (contoMovimentoReale && contoMovimentoReale !== allocazione.contoOrigineId) {
      const contoDestinazioneCheck = await ottieniConto(contoMovimentoReale);
      if (contoDestinazioneCheck && contoDestinazioneCheck.tipologia === 'spesa') {
        contoMovimentoReale = allocazione.contoOrigineId;
      }
    }
    if (contoMovimentoReale && contoMovimentoReale !== allocazione.contoOrigineId) {
      const contoDestinazione = await ottieniConto(contoMovimentoReale);
      await aggiornaConto(contoMovimentoReale, { saldoReale: contoDestinazione.saldoReale - riga.importo });
      if (contoOrigineRecord.tipologia !== 'spesa') {
        const contoOrigine = await ottieniConto(allocazione.contoOrigineId);
        await aggiornaConto(allocazione.contoOrigineId, { saldoReale: contoOrigine.saldoReale + riga.importo });
      }
    }
  }

  await dbPut(STORE_RIGHE, { ...riga, stornata: true });
  return registraStorno({ tipoMovimento: 'allocazioneRiga', movimentoId: rigaId, descrizione: descrizioneStorno });
}

// Storna in un'unica azione utente TUTTE le righe stornabili di un'Entrata (Allocazione),
// per non dover ripetere lo Storno voce per voce quando un'entrata è stata distribuita su molte
// destinazioni. Non è un nuovo tipo di movimento: internamente richiama stornaRigaAllocazione
// riga per riga, quindi genera comunque N Storni singoli e tracciabili, ciascuno collegato alla
// propria riga — coerente con "ogni movimento è un evento storico a sé stante" (domain/storni.js).
// Stesso criterio di "stornabile" già usato nel Registro Movimenti per il singolo Storno: solo
// righe verso Fondo o Obiettivo (le uniche per cui uno Storno annulla un effetto reale su un
// saldo); righe Budget/Disponibilità residua non generano un effetto da annullare e vengono
// escluse, esattamente come nello Storno singolo.
export async function stornaAllocazioneCompleta(allocazioneId, descrizioneStorno) {
  const allocazione = await dbGet(STORE, allocazioneId);
  if (!allocazione) throw new Error('Allocazione (Entrata) non trovata.');

  const righe = await elencoRighePerAllocazione(allocazioneId);
  const daStornare = righe.filter((r) => !r.stornata && (r.tipoDestinazione === 'fondo' || r.tipoDestinazione === 'obiettivo'));
  if (daStornare.length === 0) {
    throw new Error('Non ci sono righe stornabili in questa Entrata (sono già tutte stornate, oppure nessuna riga è verso un Fondo o un Obiettivo).');
  }

  const storni = [];
  for (const r of daStornare) {
    storni.push(await stornaRigaAllocazione(r.id, descrizioneStorno));
  }
  return storni;
}
