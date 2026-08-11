// Dominio: Consuntivo (Fase 3) — fotografia reale a fine periodo, non modificabile da un Piano
// successivo (§ definizione del modello concettuale). A differenza di Budget/Fondi/Obiettivi,
// che sono entità vive con calcoli sempre ricalcolati a runtime (§2.5/§5.7 FDD), il Consuntivo è
// l'unica eccezione deliberata: una COPIA indipendente di nomi e importi, congelata al momento
// della creazione. Non ha alcun riferimento vivo alle entità di origine (stesso principio già
// usato da "Collega Movimenti" nel Piano: si copia, poi non resta sincronizzato). Non è
// patrimonio né operatività: è solo un report storico, quindi non entra mai nella formula di
// coerenza patrimoniale (§5.20).
//
// Generato per un intero "periodo" (lo stesso periodoInizio/periodoFine condiviso da tutti i
// Cicli Budget di quell'ondata, dato che il periodo è globale): richiede che tutti i Cicli
// Budget di quel periodo siano chiusi, altrimenti la fotografia sarebbe parziale e fuorviante.

import { dbAdd, dbGet, dbGetAll, dbGetAllByIndex, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';
import { elencoBudget } from './budget.js';
import { elencoFondi } from './fondi.js';
import { elencoObiettivi } from './obiettivi.js';
import { elencoConti } from './conti.js';
import { calcolaDatiObiettivo, calcolaDatiFondo } from '../engine/obiettivoCalc.js';

const STORE = 'consuntivi';
const STORE_BUDGET_RIGHE = 'consuntivoBudgetRighe';
const STORE_FONDO_RIGHE = 'consuntivoFondoRighe';
const STORE_OBIETTIVO_RIGHE = 'consuntivoObiettivoRighe';
// Il Ciclo Budget è gestito da domain/budgetCicli.js; qui si legge lo store 'budgetCicli'
// direttamente tramite storage.js (stessa scelta già fatta in domain/trasferimenti.js), per non
// creare una dipendenza diretta da quel modulo.
const STORE_CICLI = 'budgetCicli';

function chiavePeriodo(periodoInizio, periodoFine) {
  return `${periodoInizio}|${periodoFine}`;
}

// Periodi i cui Cicli Budget sono TUTTI chiusi ma che non hanno ancora un Consuntivo: sono i
// candidati per "Genera Consuntivo", sia dalla vista Ciclo Budget (subito dopo l'ultima
// chiusura) sia dalla vista Consuntivi (creazione manuale in un secondo momento).
export async function elencoPeriodiSenzaConsuntivo() {
  const [tuttiICicli, consuntiviEsistenti] = await Promise.all([dbGetAll(STORE_CICLI), dbGetAll(STORE)]);

  const chiaviViste = new Set();
  const periodi = [];
  for (const c of tuttiICicli) {
    const chiave = chiavePeriodo(c.periodoInizio, c.periodoFine);
    if (chiaviViste.has(chiave)) continue;
    chiaviViste.add(chiave);

    const cicliDelPeriodo = tuttiICicli.filter(
      (x) => x.periodoInizio === c.periodoInizio && x.periodoFine === c.periodoFine
    );
    const tuttiChiusi = cicliDelPeriodo.every((x) => x.stato === 'chiuso');
    const giaFotografato = consuntiviEsistenti.some(
      (cn) => cn.periodoInizio === c.periodoInizio && cn.periodoFine === c.periodoFine
    );
    if (tuttiChiusi && !giaFotografato) {
      periodi.push({ periodoInizio: c.periodoInizio, periodoFine: c.periodoFine, numeroBudget: cicliDelPeriodo.length });
    }
  }
  return periodi.sort((a, b) => new Date(b.periodoInizio) - new Date(a.periodoInizio));
}

export async function elencoConsuntivi() {
  const tutti = await dbGetAll(STORE);
  return tutti.sort((a, b) => new Date(b.periodoInizio) - new Date(a.periodoInizio));
}

// Spiega perché in questo momento non c'è nessun periodo pronto per un nuovo Consuntivo —
// segnalato dall'utente: un pulsante disabilitato senza spiegazione non comunica il motivo
// (es. "non tutte le voci Budget sono state chiuse nel periodo XX-XX").
export async function diagnosiPeriodoConsuntivo() {
  const [tuttiICicli] = await Promise.all([dbGetAll(STORE_CICLI)]);

  if (tuttiICicli.length === 0) {
    return { tipo: 'nessun_ciclo' };
  }
  const cicliAperti = tuttiICicli.filter((c) => c.stato === 'aperto');
  if (cicliAperti.length > 0) {
    const periodo = cicliAperti[0];
    return {
      tipo: 'cicli_aperti',
      periodoInizio: periodo.periodoInizio,
      periodoFine: periodo.periodoFine,
      numeroAperti: cicliAperti.length
    };
  }
  return { tipo: 'tutti_fotografati' };
}

export async function ottieniDettaglioConsuntivo(consuntivoId) {
  const consuntivo = await dbGet(STORE, consuntivoId);
  if (!consuntivo) throw new Error('Consuntivo non trovato.');
  const [righeBudget, righeFondo, righeObiettivo] = await Promise.all([
    dbGetAllByIndex(STORE_BUDGET_RIGHE, 'consuntivoId', consuntivoId),
    dbGetAllByIndex(STORE_FONDO_RIGHE, 'consuntivoId', consuntivoId),
    dbGetAllByIndex(STORE_OBIETTIVO_RIGHE, 'consuntivoId', consuntivoId)
  ]);
  return { consuntivo, righeBudget, righeFondo, righeObiettivo };
}

// Crea il Consuntivo di un periodo: richiede che tutti i Cicli Budget di quel periodo siano
// chiusi (fotografia "a fine ciclo", mai parziale) e che non esista già un Consuntivo identico
// (per rigenerarlo va prima eliminato esplicitamente, con la doppia conferma prevista in UI).
export async function creaConsuntivo({ periodoInizio, periodoFine, note }) {
  if (!periodoInizio || !periodoFine) throw new Error('Periodo non valido.');

  const [tuttiICicli, consuntiviEsistenti, conti, budgetTutti, fondiTutti, obiettiviTutti] = await Promise.all([
    dbGetAll(STORE_CICLI), dbGetAll(STORE), elencoConti(), elencoBudget(), elencoFondi(), elencoObiettivi()
  ]);

  const cicliDelPeriodo = tuttiICicli.filter(
    (c) => c.periodoInizio === periodoInizio && c.periodoFine === periodoFine
  );
  if (cicliDelPeriodo.length === 0) {
    throw new Error('Nessun Ciclo Budget trovato per questo periodo.');
  }
  if (cicliDelPeriodo.some((c) => c.stato === 'aperto')) {
    throw new Error('Ci sono ancora Cicli aperti in questo periodo: chiudili tutti prima di generare il Consuntivo.');
  }
  if (consuntiviEsistenti.some((cn) => cn.periodoInizio === periodoInizio && cn.periodoFine === periodoFine)) {
    throw new Error('Esiste già un Consuntivo per questo periodo: eliminalo prima se vuoi rigenerarlo.');
  }

  const mappaConti = new Map(conti.map((c) => [c.id, c.nome]));
  const mappaBudget = new Map(budgetTutti.map((b) => [b.id, b]));

  const consuntivo = {
    id: generaId(),
    periodoInizio,
    periodoFine,
    note: note || '',
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE, consuntivo);

  // --- Righe Budget: copia congelata di ciascun Ciclo Budget chiuso del periodo ---
  for (const ciclo of cicliDelPeriodo) {
    const budget = mappaBudget.get(ciclo.budgetId);
    await dbAdd(STORE_BUDGET_RIGHE, {
      id: generaId(),
      consuntivoId: consuntivo.id,
      budgetId: ciclo.budgetId,
      budgetNome: budget?.nome || '—',
      contoNome: (budget && mappaConti.get(budget.contoId)) || '—',
      importoAssegnato: ciclo.importoAssegnato,
      riportoIniziale: ciclo.riportoIniziale,
      importoUtilizzato: ciclo.importoUtilizzato,
      residuo: ciclo.residuo,
      residuoAzione: ciclo.residuoAzione,
      controparteTipo: ciclo.controparteTipo || null,
      controparteNome: ciclo.controparteNome || null
    });
  }

  // --- Righe Fondo + Obiettivo: fotografia del Patrimonio nel suo complesso a quel momento ---
  // (tutti i Fondi esistenti, non solo quelli legati ai Budget di questo periodo: il Consuntivo
  // è la fotografia di fine periodo dell'intero Patrimonio, non solo dell'Operatività).
  for (const fondo of fondiTutti) {
    const obiettiviDelFondo = obiettiviTutti.filter((o) => o.fondoId === fondo.id);
    const datiFondo = calcolaDatiFondo(fondo, obiettiviDelFondo);

    await dbAdd(STORE_FONDO_RIGHE, {
      id: generaId(),
      consuntivoId: consuntivo.id,
      fondoId: fondo.id,
      fondoNome: fondo.nome,
      contoNome: mappaConti.get(fondo.contoId) || '—',
      saldo: fondo.saldo,
      obiettivoComplessivo: datiFondo.obiettivoComplessivo,
      saldoAccumulatoTotale: datiFondo.saldoAccumulatoTotale,
      percentuale: datiFondo.percentuale
    });

    for (const obiettivo of obiettiviDelFondo) {
      const calc = calcolaDatiObiettivo(obiettivo);
      await dbAdd(STORE_OBIETTIVO_RIGHE, {
        id: generaId(),
        consuntivoId: consuntivo.id,
        fondoId: fondo.id,
        obiettivoId: obiettivo.id,
        obiettivoNome: obiettivo.nome,
        importoTarget: obiettivo.importoTarget,
        saldoAccumulato: obiettivo.saldoAccumulato,
        dataPrevista: obiettivo.dataPrevista,
        percentuale: calc.percentuale
      });
    }
  }

  return consuntivo;
}

// Eliminazione DIRETTA (nessuno Storno: il Consuntivo non è un movimento, è un report). La
// doppia conferma esplicita è responsabilità della UI, coerente con "Pulisci Registro".
export async function eliminaConsuntivo(id) {
  const [righeBudget, righeFondo, righeObiettivo] = await Promise.all([
    dbGetAllByIndex(STORE_BUDGET_RIGHE, 'consuntivoId', id),
    dbGetAllByIndex(STORE_FONDO_RIGHE, 'consuntivoId', id),
    dbGetAllByIndex(STORE_OBIETTIVO_RIGHE, 'consuntivoId', id)
  ]);
  for (const r of righeBudget) await dbDelete(STORE_BUDGET_RIGHE, r.id);
  for (const r of righeFondo) await dbDelete(STORE_FONDO_RIGHE, r.id);
  for (const r of righeObiettivo) await dbDelete(STORE_OBIETTIVO_RIGHE, r.id);
  await dbDelete(STORE, id);
}
