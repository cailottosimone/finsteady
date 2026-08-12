// Fase 5 — Salute Finanziaria (FDD §4.11 e cap. 6): non un cruscotto di statistiche, ma una
// sezione che fotografa lo stato complessivo della pianificazione e segnala eventuali criticità.
// Tutti i calcoli qui sono puri (nessun accesso a IndexedDB): derivati a runtime sui dati già
// esistenti, mai persistiti — stessa filosofia già usata per calcolaDatiObiettivo/calcolaDatiFondo.

import { calcolaDatiObiettivo } from './obiettivoCalc.js';
import { arrotonda } from '../utils/denaro.js';

// Mesi di autonomia del Fondo Emergenza: saldo del Fondo designato ÷ spesa mensile stimata
// (somma degli importi di default di tutti i Budget attivi, stesso principio già usato in
// Prospetti per "Andamento Budget" — non potendo prevedere la spesa reale, si usa l'impegnato).
export function calcolaMesiAutonomia(saldoFondoEmergenza, spesaMensileStimata) {
  if (!spesaMensileStimata || spesaMensileStimata <= 0) return null; // non calcolabile
  return arrotonda(saldoFondoEmergenza / spesaMensileStimata);
}

// Percentuale di Obiettivi finanziati, aggregata su tutti gli Obiettivi esistenti (saldo
// accumulato complessivo ÷ target complessivo).
export function calcolaPercentualeObiettiviFinanziati(obiettivi) {
  const targetTotale = obiettivi.reduce((s, o) => s + (Number(o.importoTarget) || 0), 0);
  const saldoTotale = obiettivi.reduce((s, o) => s + (Number(o.saldoAccumulato) || 0), 0);
  if (targetTotale <= 0) return null;
  return Math.min(100, Math.round((saldoTotale / targetTotale) * 1000) / 10);
}

// Obiettivi "in ritardo": scadenza entro sogliaMesi mesi E percentuale raggiunta inferiore a
// sogliaPercentuale — soglie di default confermate dall'utente (3 mesi, 80%), qui parametriche.
// Obiettivi "in ritardo": due casi distinti.
// 1. Scadenza già raggiunta (o superata) e non ancora al 100% — SEMPRE in ritardo, qualunque
//    percentuale abbia raggiunto: mancare la propria scadenza è in ritardo per definizione,
//    anche all'83%. Prima la soglia sotto lo copriva SOLO se sotto sogliaPercentuale (80%),
//    mascherando casi come "100 su 120 (83%) a scadenza raggiunta" — bug segnalato dall'utente,
//    verificato che mesiRimanenti è sempre "almeno 1" anche a scadenza già passata, quindi il
//    solo controllo mesiRimanenti<=soglia non bastava a distinguerlo da un Obiettivo lontano.
// 2. Scadenza non ancora raggiunta ma vicina (entro sogliaMesi) E sotto sogliaPercentuale — un
//    avviso precoce, non ancora in ritardo in senso stretto ma un andamento preoccupante.
export function calcolaObiettiviInRitardo(obiettivi, sogliaMesi = 3, sogliaPercentuale = 80, oggi = new Date()) {
  const oggiSoloData = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return obiettivi
    .map((o) => ({ obiettivo: o, dati: calcolaDatiObiettivo(o, oggi) }))
    .filter(({ obiettivo, dati }) => {
      if (dati.percentuale >= 100) return false; // già raggiunto: mai in ritardo
      let scadenzaRaggiunta = false;
      if (obiettivo.dataPrevista) {
        // Parsing sicuro in ora locale (YYYY-MM-DD), evita il problema di fuso orario di
        // "new Date(stringa)" che interpreterebbe la data come UTC-mezzanotte.
        const [anno, mese, giorno] = String(obiettivo.dataPrevista).slice(0, 10).split('-').map(Number);
        const dataPrevista = new Date(anno, mese - 1, giorno);
        scadenzaRaggiunta = dataPrevista <= oggiSoloData;
      }
      if (scadenzaRaggiunta) return true;
      return dati.mesiRimanenti <= sogliaMesi && dati.percentuale < sogliaPercentuale;
    });
}

// Crescita patrimoniale nel periodo: differenza tra il totale Fondi di oggi e quello di
// `periodoMesi` fa, ricostruito sottraendo dal totale odierno la somma dei movimenti che hanno
// interessato i Fondi in quel periodo (nessuno storico di saldi viene conservato: si ricava
// dal registro movimenti, coerentemente con "ogni calcolo è sempre ricalcolato e spiegabile").
// deltaPeriodo: variazione netta already calcolata sommando i contributi di ogni movimento
// (vedi domain/saluteFinanziaria.js per come si costruisce).
export function calcolaCrescitaPatrimoniale(saldoFondiOggi, deltaPeriodo) {
  const saldoInizioPeriodo = arrotonda(saldoFondiOggi - deltaPeriodo);
  const crescitaAssoluta = arrotonda(deltaPeriodo);
  const crescitaPercentuale = saldoInizioPeriodo !== 0
    ? Math.round((crescitaAssoluta / Math.abs(saldoInizioPeriodo)) * 1000) / 10
    : null; // non calcolabile (partiva da zero)
  return { saldoInizioPeriodo, saldoFineOeriodo: saldoFondiOggi, crescitaAssoluta, crescitaPercentuale };
}

// Confronto col Piano: FUNZIONALITÀ RIMOSSA (richiesto dall'utente: "non ha senso"). Era
// risultata fragile e poco intuitiva — con Entrate insufficienti a coprire le Voci del Piano
// produceva numeri fuorvianti (bug corretto ma il concetto stesso non convinceva l'utente).
