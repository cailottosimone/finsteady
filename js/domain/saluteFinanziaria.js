// Dominio: Salute Finanziaria (Fase 5) — recupera i dati necessari (Fondi, Obiettivi, Budget,
// Movimenti storici) e orchestra i calcoli puri di engine/saluteFinanziaria.js. Nessun nuovo
// dato viene mai persistito qui, a parte le due preferenze (Fondo Emergenza, periodo) gestite
// da domain/impostazioniSaluteFinanziaria.js.

import { elencoFondi } from './fondi.js';
import { elencoObiettivi } from './obiettivi.js';
import { elencoBudget } from './budget.js';
import { elencoAllocazioni, elencoTutteLeRighe } from './allocazioni.js';
import { elencoUscite } from './uscite.js';
import { elencoRettifiche } from './rettifiche.js';
import { elencoTrasferimenti } from './trasferimenti.js';
import { ottieniImpostazioniSaluteFinanziaria } from './impostazioniSaluteFinanziaria.js';
import {
  calcolaMesiAutonomia, calcolaPercentualeObiettiviFinanziati, calcolaObiettiviInRitardo,
  calcolaCrescitaPatrimoniale
} from '../engine/saluteFinanziaria.js';
import { calcolaDatiFondo } from '../engine/obiettivoCalc.js';
import { arrotonda } from '../utils/denaro.js';

import { elencoConti } from './conti.js';
import {
  calcolaProiezioneProspetto, elencoVociAutonomiaProspetto
} from './prospetti.js';

const APPARTIENE_A_FONDI = (tipo) => tipo === 'fondo' || tipo === 'obiettivo';

function formatDataLocaleSalute(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Ricostruisce, mese per mese (ultimi 12 mesi più oggi), il patrimonio totale dei Conti
// indicati — richiesto dall'utente per un grafico dell'andamento della liquidità/patrimonio nel
// tempo, "allocato o non allocato non importa". Nessuno storico di saldi viene conservato: si
// ricostruisce dal registro movimenti, stesso principio già usato per "Crescita patrimoniale",
// esteso qui a più punti nel tempo e per Conto specifico (non solo un aggregato generale).
//
// Semplificazione dichiarata in UI: solo la parte nei Fondi viene ricostruita con precisione
// mensile; la quota di liquidità libera/Budget di ciascun Conto è considerata costante al
// valore di oggi lungo tutto il grafico (ricostruirne la storia richiederebbe tracciare ogni
// variazione diretta di Budget/liquidità, non solo quelle sui Fondi — non necessario per
// l'andamento che l'utente vuole osservare, dominato dai movimenti sui Fondi).
const NUMERO_PERIODI_PER_GRANULARITA = { settimana: 26, mese: 13, trimestre: 9, semestre: 7, anno: 6, quinquennio: 4 };

function periodoIndietro(data, granularita) {
  const y = data.getFullYear(), m = data.getMonth(), d = data.getDate();
  if (granularita === 'settimana') return new Date(y, m, d - 7);
  if (granularita === 'trimestre') return new Date(y, m - 3, d);
  if (granularita === 'semestre') return new Date(y, m - 6, d);
  if (granularita === 'anno') return new Date(y - 1, m, d);
  if (granularita === 'quinquennio') return new Date(y - 5, m, d);
  return new Date(y, m - 1, d); // 'mese', default
}

function etichettaPuntoSalute(data, granularita) {
  if (granularita === 'settimana') return formatDataLocaleSalute(data);
  if (granularita === 'trimestre') return `T${Math.floor(data.getMonth() / 3) + 1} ${data.getFullYear()}`;
  if (granularita === 'semestre') return `S${data.getMonth() < 6 ? 1 : 2} ${data.getFullYear()}`;
  if (granularita === 'anno' || granularita === 'quinquennio') return `${data.getFullYear()}`;
  return data.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }); // 'mese'
}

// Ricostruisce il patrimonio totale dei Conti indicati nel tempo, con granularità configurabile
// (settimana/mese/trimestre/semestre/anno/quinquennio) — richiesto dall'utente, stessa
// possibilità già data al grafico dei Prospetti. L'ultimo punto è sempre "oggi" esatto (mai un
// arrotondamento di calendario), gli altri risalgono a ritroso della stessa granularità.
export async function calcolaStoricoPatrimonioConti(contiIds, granularita = 'mese') {
  const [tuttiIConti, fondi, obiettivi, allocazioni, righe, uscite, rettifiche, trasferimenti] = await Promise.all([
    elencoConti(), elencoFondi(), elencoObiettivi(),
    elencoAllocazioni(), elencoTutteLeRighe(), elencoUscite(), elencoRettifiche(), elencoTrasferimenti()
  ]);
  const contiScelti = tuttiIConti.filter((c) => contiIds.includes(c.id));
  const mappaFondi = new Map(fondi.map((f) => [f.id, f]));
  const mappaObiettivi = new Map(obiettivi.map((o) => [o.id, o]));
  const mappaAllocazioni = new Map(allocazioni.map((a) => [a.id, a]));

  // Conto a cui appartiene un fondo/obiettivo (per instradare ogni movimento verso il Conto
  // giusto). Un fondo/obiettivo inesistente (eliminato) non contribuisce a nessun Conto.
  const contoDiFondo = (fondoId) => mappaFondi.get(fondoId)?.contoId || null;
  const contoDiObiettivo = (obiettivoId) => contoDiFondo(mappaObiettivi.get(obiettivoId)?.fondoId);
  const contoDiTipo = (tipo, id) => {
    if (tipo === 'fondo') return contoDiFondo(id);
    if (tipo === 'obiettivo') return contoDiObiettivo(id);
    return null;
  };
  const nomeDestinazione = (tipo, id) => {
    if (tipo === 'fondo') return mappaFondi.get(id)?.nome || '(Fondo eliminato)';
    if (tipo === 'obiettivo') return mappaObiettivi.get(id)?.nome || '(Obiettivo eliminato)';
    return tipo;
  };

  // Pre-elaborazione: per ogni movimento valido (non stornato), un contributo firmato { contoId,
  // data, importo, nome } — poi per ciascun periodo si sommano/elencano quelli caduti al suo
  // interno, per Conto. "nome" serve al pannello eventi mostrato cliccando un punto del grafico.
  const contributi = [];

  for (const r of righe) {
    if (r.stornata || !APPARTIENE_A_FONDI(r.tipoDestinazione)) continue;
    const allocazione = mappaAllocazioni.get(r.allocazioneId);
    const contoId = contoDiTipo(r.tipoDestinazione, r.destinazioneId);
    if (!allocazione || !contoId) continue;
    contributi.push({
      contoId, data: allocazione.data, importo: Number(r.importo) || 0,
      nome: `Entrata${allocazione.descrizione ? ` (${allocazione.descrizione})` : ''} → ${nomeDestinazione(r.tipoDestinazione, r.destinazioneId)}`
    });
  }
  for (const u of uscite) {
    if (u.stornata) continue;
    const contoId = contoDiFondo(u.fondoId);
    if (!contoId) continue;
    contributi.push({
      contoId, data: u.data, importo: -(Number(u.importo) || 0),
      nome: `Uscita${u.descrizione ? ` (${u.descrizione})` : ''} — ${mappaFondi.get(u.fondoId)?.nome || '(Fondo eliminato)'}`
    });
  }
  for (const r of rettifiche) {
    if (r.stornata || !APPARTIENE_A_FONDI(r.tipoEntita)) continue;
    const contoId = contoDiTipo(r.tipoEntita, r.entitaId);
    if (!contoId) continue;
    contributi.push({
      contoId, data: r.data, importo: Number(r.importo) || 0,
      nome: `Rettifica${r.descrizione ? ` (${r.descrizione})` : ''} — ${nomeDestinazione(r.tipoEntita, r.entitaId)}`
    });
  }
  for (const t of trasferimenti) {
    if (t.stornata) continue;
    const origineInFondi = APPARTIENE_A_FONDI(t.tipoOrigine);
    const destinazioneInFondi = APPARTIENE_A_FONDI(t.tipoDestinazione);
    const contoOrigine = origineInFondi ? contoDiTipo(t.tipoOrigine, t.origineId) : null;
    const contoDestinazione = destinazioneInFondi ? contoDiTipo(t.tipoDestinazione, t.destinazioneId) : null;
    const importo = Number(t.importo) || 0;
    const etichettaTrasf = `Trasferimento${t.descrizione ? ` (${t.descrizione})` : ''}`;
    if (contoOrigine) contributi.push({ contoId: contoOrigine, data: t.data, importo: -importo, nome: `${etichettaTrasf} → ${nomeDestinazione(t.tipoDestinazione, t.destinazioneId)}` });
    if (contoDestinazione) contributi.push({ contoId: contoDestinazione, data: t.data, importo, nome: `${etichettaTrasf} da ${nomeDestinazione(t.tipoOrigine, t.origineId)}` });
  }

  const oggi = new Date();
  const numeroPeriodi = NUMERO_PERIODI_PER_GRANULARITA[granularita] || NUMERO_PERIODI_PER_GRANULARITA.mese;
  const dateSnapshot = [new Date(oggi)];
  for (let i = 1; i < numeroPeriodi; i++) {
    dateSnapshot.unshift(periodoIndietro(dateSnapshot[0], granularita));
  }
  const etichette = dateSnapshot.map((d) => etichettaPuntoSalute(d, granularita));

  const serie = contiScelti.map((conto) => {
    const sommaFondiOggi = fondi.filter((f) => f.contoId === conto.id).reduce((s, f) => s + (Number(f.saldo) || 0), 0);
    const quotaNonFondi = arrotonda(conto.saldoReale - sommaFondiOggi); // considerata costante, vedi nota sopra
    const contributiConto = contributi.filter((c) => c.contoId === conto.id);
    const punti = dateSnapshot.map((dataSnap, indice) => {
      const deltaSuccessivo = contributiConto
        .filter((c) => new Date(c.data) >= dataSnap)
        .reduce((s, c) => s + c.importo, 0);
      const sommaFondiAllaData = arrotonda(sommaFondiOggi - deltaSuccessivo);
      // Eventi del PERIODO che questo punto rappresenta: dallo snapshot precedente (escluso) a
      // questo (incluso) — così cliccando un punto si vede cosa è cambiato rispetto al
      // precedente, non l'intera storia dall'inizio.
      const dataPrecedente = indice > 0 ? dateSnapshot[indice - 1] : null;
      const eventiPeriodo = contributiConto
        .filter((c) => {
          const d = new Date(c.data);
          return d <= dataSnap && (!dataPrecedente || d > dataPrecedente);
        })
        .map((c) => ({ data: String(c.data).slice(0, 10), nome: c.nome, importo: c.importo }));
      return {
        data: formatDataLocaleSalute(dataSnap),
        inizio: dataPrecedente ? formatDataLocaleSalute(dataPrecedente) : formatDataLocaleSalute(dataSnap),
        fine: formatDataLocaleSalute(dataSnap),
        valore: arrotonda(sommaFondiAllaData + quotaNonFondi),
        eventi: eventiPeriodo
      };
    });
    return { contoId: conto.id, nome: conto.nome, punti };
  });

  return { etichette, serie };
}

// Variazione netta del totale patrimonio in Fondi (aggregato su tutti i Fondi: gli spostamenti
// interni tra Fondi si annullano automaticamente) causata dai movimenti con data nel periodo
// [dataInizio, oggi]. Movimenti stornati vengono esclusi (il loro effetto non è più valido).
async function calcolaDeltaFondiNelPeriodo(dataInizio) {
  const [allocazioni, righe, uscite, rettifiche, trasferimenti] = await Promise.all([
    elencoAllocazioni(), elencoTutteLeRighe(), elencoUscite(), elencoRettifiche(), elencoTrasferimenti()
  ]);
  const mappaDataAllocazione = new Map(allocazioni.map((a) => [a.id, a.data]));

  let delta = 0;

  for (const r of righe) {
    if (r.stornata) continue;
    if (r.tipoDestinazione !== 'fondo' && r.tipoDestinazione !== 'obiettivo') continue;
    const data = mappaDataAllocazione.get(r.allocazioneId);
    if (!data || new Date(data) < dataInizio) continue;
    delta += Number(r.importo) || 0;
  }

  for (const u of uscite) {
    if (u.stornata) continue;
    if (new Date(u.data) < dataInizio) continue;
    delta -= Number(u.importo) || 0;
  }

  for (const r of rettifiche) {
    if (r.stornata) continue;
    if (r.tipoEntita !== 'fondo' && r.tipoEntita !== 'obiettivo') continue;
    if (new Date(r.data) < dataInizio) continue;
    delta += Number(r.importo) || 0; // già segnato: positivo aumenta, negativo riduce
  }

  for (const t of trasferimenti) {
    if (t.stornata) continue;
    if (new Date(t.data) < dataInizio) continue;
    const origineInFondi = APPARTIENE_A_FONDI(t.tipoOrigine);
    const destinazioneInFondi = APPARTIENE_A_FONDI(t.tipoDestinazione);
    if (origineInFondi && destinazioneInFondi) continue; // interno ai Fondi: si annulla nell'aggregato
    if (origineInFondi && !destinazioneInFondi) delta -= Number(t.importo) || 0; // esce dai Fondi
    if (!origineInFondi && destinazioneInFondi) delta += Number(t.importo) || 0; // entra nei Fondi
  }

  return arrotonda(delta);
}

// Totale Entrate (Allocazioni) nel periodo e quota realmente finita in Fondi/Obiettivi.
async function calcolaEntratePeriodo(dataInizio) {
  const [allocazioni, righe] = await Promise.all([elencoAllocazioni(), elencoTutteLeRighe()]);
  const idAllocazioniNelPeriodo = new Set(
    allocazioni.filter((a) => new Date(a.data) >= dataInizio).map((a) => a.id)
  );

  let totaleEntrate = 0;
  let versatoFondiObiettivi = 0;
  for (const r of righe) {
    if (r.stornata || !idAllocazioniNelPeriodo.has(r.allocazioneId)) continue;
    const importo = Number(r.importo) || 0;
    totaleEntrate += importo;
    if (r.tipoDestinazione === 'fondo' || r.tipoDestinazione === 'obiettivo') versatoFondiObiettivi += importo;
  }

  return {
    totaleEntrate: arrotonda(totaleEntrate),
    versatoFondiObiettivi: arrotonda(versatoFondiObiettivi)
  };
}

export async function calcolaSaluteFinanziaria() {
  const [fondi, obiettivi, budget, impostazioni] = await Promise.all([
    elencoFondi(), elencoObiettivi(), elencoBudget(), ottieniImpostazioniSaluteFinanziaria()
  ]);

  const dataInizio = new Date();
  dataInizio.setMonth(dataInizio.getMonth() - impostazioni.periodoMesi);

  const [deltaFondiPeriodo, { totaleEntrate, versatoFondiObiettivi }] = await Promise.all([
    calcolaDeltaFondiNelPeriodo(dataInizio),
    calcolaEntratePeriodo(dataInizio)
  ]);

  const fondoEmergenza = impostazioni.fondoEmergenzaId
    ? fondi.find((f) => f.id === impostazioni.fondoEmergenzaId) || null
    : null;

  // Composizione della spesa mensile stimata: il bundle "tutti i Budget attivi" (con la sua
  // spunta per toglierlo) più le voci aggiunte esplicitamente — mai solo "somma dei Budget
  // attivi" in modo implicito, come richiesto dall'utente.
  const mappaObiettiviPerFondo = new Map();
  obiettivi.forEach((o) => {
    if (!mappaObiettiviPerFondo.has(o.fondoId)) mappaObiettiviPerFondo.set(o.fondoId, []);
    mappaObiettiviPerFondo.get(o.fondoId).push(o);
  });

  const budgetAttivi = budget.filter((b) => !b.stato || b.stato === 'attivo');
  const vociComposizione = [];
  if (impostazioni.budgetBundleAttivo) {
    vociComposizione.push({
      tipo: 'budgetBundle',
      etichetta: `Tutti i Budget attivi (${budgetAttivi.length})`,
      importo: arrotonda(budgetAttivi.reduce((s, b) => s + (Number(b.importoAssegnatoDefault) || 0), 0))
    });
  }
  for (const voce of impostazioni.vociAutonomia) {
    if (voce.tipo === 'budgetSingolo') {
      const b = budget.find((x) => x.id === voce.budgetId);
      vociComposizione.push({
        tipo: voce.tipo, id: voce.id,
        etichetta: `Budget: ${b?.nome || '(eliminato)'}`,
        importo: arrotonda(Number(b?.importoAssegnatoDefault) || 0)
      });
    } else if (voce.tipo === 'risparmioAnnuale') {
      const f = fondi.find((x) => x.id === voce.fondoId);
      const obiettiviDelFondo = mappaObiettiviPerFondo.get(voce.fondoId) || [];
      const datiFondo = f ? calcolaDatiFondo(f, obiettiviDelFondo) : null;
      vociComposizione.push({
        tipo: voce.tipo, id: voce.id,
        etichetta: `Risparmio annuale: ${f?.nome || '(eliminato)'}`,
        importo: arrotonda((datiFondo?.obiettivoComplessivo || 0) / 12)
      });
    } else if (voce.tipo === 'risparmioMensile') {
      const f = fondi.find((x) => x.id === voce.fondoId);
      vociComposizione.push({
        tipo: voce.tipo, id: voce.id,
        etichetta: `Risparmio mensile: ${f?.nome || '(eliminato)'}`,
        importo: arrotonda(Number(voce.importo) || 0)
      });
    }
  }
  const spesaMensileStimata = arrotonda(vociComposizione.reduce((s, v) => s + v.importo, 0));

  const saldoFondiOggi = arrotonda(fondi.reduce((s, f) => s + (Number(f.saldo) || 0), 0));

  return {
    periodoMesi: impostazioni.periodoMesi,
    fondoEmergenza,
    fondoEmergenzaEliminato: !!(impostazioni.fondoEmergenzaId && !fondoEmergenza),
    spesaMensileStimata,
    vociComposizione,
    budgetBundleAttivo: impostazioni.budgetBundleAttivo,
    mesiAutonomia: fondoEmergenza ? calcolaMesiAutonomia(fondoEmergenza.saldo, spesaMensileStimata) : null,
    percentualeObiettiviFinanziati: calcolaPercentualeObiettiviFinanziati(obiettivi),
    obiettiviInRitardo: calcolaObiettiviInRitardo(obiettivi),
    numeroObiettiviTotali: obiettivi.length,
    crescitaPatrimoniale: calcolaCrescitaPatrimoniale(saldoFondiOggi, deltaFondiPeriodo),
    totaleEntratePeriodo: totaleEntrate,
    versatoFondiObiettiviPeriodo: versatoFondiObiettivi,
    fondiDisponibili: fondi,
    obiettiviDisponibili: obiettivi,
    budgetDisponibili: budget
  };
}

// Salute Finanziaria applicata al risultato PROIETTATO di un Prospetto — "come se fossi a fine
// Prospetto e andassi a vedere la mia Salute Finanziaria" (richiesto dall'utente). Stessi 5
// indicatori, stesso Fondo Emergenza designato globalmente (solo il SALDO usato è quello
// proiettato, non quello reale) — ma la composizione della "spesa mensile stimata" può essere
// personalizzata per Prospetto:
// - 'eredita' (default): stessa composizione configurata in Impostazioni → Salute Finanziaria,
//   valutata sui dati proiettati (i Fondi con voci 'risparmioAnnuale' usano il loro obiettivo
//   complessivo PROIETTATO ÷ 12; i Budget restano quelli reali, un Budget non è mai proiettato);
// - 'personalizzata': voci proprie di questo Prospetto (prospettoElementi, categoria
//   'voceAutonomia'), incluso il tipo 'pianoCollegato' che eredita i Budget del Piano collegato
//   a QUESTO specifico Prospetto (riusa `budgetStimati`, già calcolato coerentemente con lo
//   Piano del Prospetto in calcolaProiezioneProspetto).
// "Oggi" per Obiettivi in ritardo/scadenza è la data fine del Prospetto, non la data odierna
// reale: si guarda "da lì". Crescita patrimoniale e Tasso di risparmio sono calcolati
// sull'intero orizzonte del Prospetto (non un periodo fisso di mesi, che non avrebbe senso per
// una simulazione con un proprio inizio e fine).
export async function calcolaSaluteFinanziariaProspetto(prospettoId) {
  const [risultato, impostazioniGlobali, budget] = await Promise.all([
    calcolaProiezioneProspetto(prospettoId),
    ottieniImpostazioniSaluteFinanziaria(),
    elencoBudget()
  ]);

  const mappaObiettiviProiettatiPerFondo = new Map();
  risultato.obiettiviProiettati.forEach((o) => {
    if (!mappaObiettiviProiettatiPerFondo.has(o.fondoId)) mappaObiettiviProiettatiPerFondo.set(o.fondoId, []);
    mappaObiettiviProiettatiPerFondo.get(o.fondoId).push(o);
  });
  const obiettivoComplessivoProiettato = (fondoId) => {
    const fondo = risultato.fondiProiettati.find((f) => f.id === fondoId);
    if (!fondo) return 0;
    const obiettiviDelFondo = mappaObiettiviProiettatiPerFondo.get(fondoId) || [];
    return calcolaDatiFondo(fondo, obiettiviDelFondo).obiettivoComplessivo;
  };

  const modalita = risultato.prospetto.modalitaAutonomia || 'eredita';
  const vociComposizione = [];

  if (modalita === 'eredita') {
    if (impostazioniGlobali.budgetBundleAttivo) {
      const budgetAttivi = budget.filter((b) => !b.stato || b.stato === 'attivo');
      vociComposizione.push({
        tipo: 'budgetBundle', etichetta: `Tutti i Budget attivi (${budgetAttivi.length})`,
        importo: arrotonda(budgetAttivi.reduce((s, b) => s + (Number(b.importoAssegnatoDefault) || 0), 0))
      });
    }
    for (const voce of impostazioniGlobali.vociAutonomia) {
      if (voce.tipo === 'budgetSingolo') {
        const b = budget.find((x) => x.id === voce.budgetId);
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Budget: ${b?.nome || '(eliminato)'}`, importo: arrotonda(Number(b?.importoAssegnatoDefault) || 0) });
      } else if (voce.tipo === 'risparmioAnnuale') {
        const f = risultato.fondiProiettati.find((x) => x.id === voce.fondoId);
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Risparmio annuale: ${f?.nome || '(eliminato)'}`, importo: arrotonda(obiettivoComplessivoProiettato(voce.fondoId) / 12) });
      } else if (voce.tipo === 'risparmioMensile') {
        const f = risultato.fondiProiettati.find((x) => x.id === voce.fondoId);
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Risparmio mensile: ${f?.nome || '(eliminato)'}`, importo: arrotonda(Number(voce.importo) || 0) });
      }
    }
  } else {
    const vociProspetto = await elencoVociAutonomiaProspetto(prospettoId);
    for (const voce of vociProspetto) {
      if (voce.tipo === 'pianoCollegato') {
        const totalePerCiclo = risultato.numeroCicli > 0
          ? arrotonda(risultato.budgetStimati.reduce((s, x) => s + x.totaleImpegnato, 0) / risultato.numeroCicli)
          : 0;
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Budget del Piano collegato (${risultato.budgetStimati.length})`, importo: totalePerCiclo });
      } else if (voce.tipo === 'budgetSingolo') {
        const b = budget.find((x) => x.id === voce.budgetId);
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Budget: ${b?.nome || '(eliminato)'}`, importo: arrotonda(Number(b?.importoAssegnatoDefault) || 0) });
      } else if (voce.tipo === 'risparmioAnnuale') {
        const f = risultato.fondiProiettati.find((x) => x.id === voce.fondoId);
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Risparmio annuale: ${f?.nome || '(eliminato)'}`, importo: arrotonda(obiettivoComplessivoProiettato(voce.fondoId) / 12) });
      } else if (voce.tipo === 'risparmioMensile') {
        const f = risultato.fondiProiettati.find((x) => x.id === voce.fondoId);
        vociComposizione.push({ tipo: voce.tipo, id: voce.id, etichetta: `Risparmio mensile: ${f?.nome || '(eliminato)'}`, importo: arrotonda(Number(voce.importo) || 0) });
      }
    }
  }
  const spesaMensileStimata = arrotonda(vociComposizione.reduce((s, v) => s + v.importo, 0));

  const fondoEmergenzaProiettato = impostazioniGlobali.fondoEmergenzaId
    ? risultato.fondiProiettati.find((f) => f.id === impostazioniGlobali.fondoEmergenzaId) || null
    : null;

  const [anno, mese, giorno] = String(risultato.dataFineEffettiva).slice(0, 10).split('-').map(Number);
  const dataFineComeData = new Date(anno, mese - 1, giorno);

  const saldoFondiPartenza = arrotonda(risultato.fondiPartenza.reduce((s, f) => s + f.saldo, 0));
  const saldoFondiFinale = arrotonda(risultato.fondiProiettati.reduce((s, f) => s + f.saldo, 0));
  const crescitaOrizzonte = arrotonda(saldoFondiFinale - saldoFondiPartenza);

  // Obiettivi da includere in "Obiettivi finanziati"/"Obiettivi in ritardo": se il Prospetto ha
  // una selezione esplicita salvata (anche vuota) la si rispetta sempre; altrimenti (mai
  // configurata, `null`) si mantiene il comportamento storico — tutti gli Obiettivi proiettati —
  // per non alterare Prospetti creati prima di questa funzionalità.
  const obiettiviMonitorati = risultato.prospetto.obiettiviMonitorati;
  const obiettiviPerIndicatori = Array.isArray(obiettiviMonitorati)
    ? risultato.obiettiviProiettati.filter((o) => obiettiviMonitorati.includes(o.id))
    : risultato.obiettiviProiettati;

  return {
    prospetto: risultato.prospetto,
    modalitaAutonomia: modalita,
    fondoEmergenza: fondoEmergenzaProiettato,
    fondoEmergenzaEliminato: !!(impostazioniGlobali.fondoEmergenzaId && !fondoEmergenzaProiettato),
    spesaMensileStimata,
    vociComposizione,
    mesiAutonomia: fondoEmergenzaProiettato ? calcolaMesiAutonomia(fondoEmergenzaProiettato.saldo, spesaMensileStimata) : null,
    percentualeObiettiviFinanziati: calcolaPercentualeObiettiviFinanziati(obiettiviPerIndicatori),
    obiettiviInRitardo: calcolaObiettiviInRitardo(obiettiviPerIndicatori, 3, 80, dataFineComeData),
    numeroObiettiviTotali: obiettiviPerIndicatori.length,
    crescitaPatrimoniale: calcolaCrescitaPatrimoniale(saldoFondiFinale, crescitaOrizzonte),
    numeroCicli: risultato.numeroCicli,
    dataFineEffettiva: risultato.dataFineEffettiva,
    fondiProiettati: risultato.fondiProiettati,
    obiettiviProiettati: risultato.obiettiviProiettati,
    budgetStimati: risultato.budgetStimati,
    budgetDisponibili: budget,
    traiettoria: risultato.traiettoria,
    fondiAttuali: risultato.fondiAttuali
  };
}
