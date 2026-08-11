// Motore di calcolo del Prospetto (Fase 4): simulazione pura, mai persistita — proietta la
// crescita di Fondi e Obiettivi applicando ripetutamente, ciclo dopo ciclo, le Voci di uno
// Piano a un importo di entrata ipotizzato costante per ciclo. Funzione pura: riceve
// lo stato attuale già caricato e restituisce solo numeri calcolati, non modifica alcun dato
// (definizione del modello: "Prospetto = simulazione").
//
// Budget e Conto come destinazione di Voce non vengono proiettati: non hanno un concetto di
// "crescita nel tempo" (il Budget si consuma e si riassegna ogni ciclo, il Conto è liquidità).
// La proiezione riguarda solo Fondi/Obiettivi, coerentemente col modello ("Fondo = patrimonio,
// cresce nel tempo").

import { calcolaRichiestaDaPiano } from './allocationEngine.js';
import { arrotonda } from '../utils/denaro.js';

// Applica un importo a un Fondo o a un Obiettivo nelle mappe di lavoro della proiezione. Un
// Obiettivo appartiene a un Fondo: la crescita si riflette anche lì, stessa convenzione già in
// uso ovunque nell'app (il saldo dell'Obiettivo è una quota del Fondo).
export function applicaImportoADestinazione(tipoDestinazione, destinazioneId, importo, mappaFondi, mappaObiettivi) {
  if (tipoDestinazione === 'fondo' && mappaFondi.has(destinazioneId)) {
    const f = mappaFondi.get(destinazioneId);
    f.saldo = arrotonda((f.saldo || 0) + importo);
  } else if (tipoDestinazione === 'obiettivo' && mappaObiettivi.has(destinazioneId)) {
    const o = mappaObiettivi.get(destinazioneId);
    o.saldoAccumulato = arrotonda((o.saldoAccumulato || 0) + importo);
    if (mappaFondi.has(o.fondoId)) {
      const f = mappaFondi.get(o.fondoId);
      f.saldo = arrotonda((f.saldo || 0) + importo);
    }
  }
}

// Proietta la crescita di ciascun Fondo/Obiettivo destinatario delle Voci di un Piano,
// applicando calcolaRichiestaDaPiano ripetutamente per numeroCicli cicli, sommando ogni volta
// l'importo calcolato al saldo corrente. Se il Piano non copre l'intera entrata ipotizzata,
// il residuo non allocato semplicemente non entra in nessun Fondo/Obiettivo (nessuna
// risoluzione automatica per priorità: qui non c'è un utente che sceglie, è solo una proiezione).
//
// movimentiManuali (opzionale): eventi ipotizzati dall'utente, non legati al Piano —
// [{ tipo: 'ripetitivo'|'singolo', numeroOccorrenze (ripetitivo), fuoriOrizzonte (singolo),
//    importo, tipoDestinazione, destinazioneId }].
//
// IMPORTANTE, segnalato due volte dall'utente: il concetto di "ciclo" riguarda SOLO il Piano
// (che rappresenta un'entrata periodica) e i movimenti 'ripetitivo' (che per definizione si
// ripetono ogni mese). Un movimento 'singolo' ha una data precisa e NON è legato a nessun
// ciclo: si applica una sola volta se la sua data cade nel periodo del Prospetto (già
// verificato da chi chiama tramite `fuoriOrizzonte`), indipendentemente da quale "ciclo"
// coprirebbe — altrimenti una spesa una tantum caduta prima della prima occorrenza del giorno
// del ciclo (es. il 3 ottobre con ciclo il 15) sparirebbe dal totale senza alcun senso.
export function calcolaProiezione({ vociPiano, importoEntrataPerCiclo, numeroCicli, fondi, obiettivi, movimentiManuali = [] }) {
  const mappaFondi = new Map(fondi.map((f) => [f.id, { ...f }]));
  const mappaObiettivi = new Map(obiettivi.map((o) => [o.id, { ...o }]));

  // Il ciclo del motore corre fino al più lungo tra numeroCicli (Piano) e le occorrenze di
  // ogni movimento ripetitivo — i movimenti singolo non influenzano questo limite, non sono
  // legati ai cicli.
  const cicloMassimo = Math.max(
    numeroCicli,
    ...movimentiManuali
      .filter((m) => m.tipo === 'ripetitivo')
      .map((m) => m.numeroOccorrenze ?? numeroCicli)
  );

  const traiettoria = [];

  for (let ciclo = 1; ciclo <= cicloMassimo; ciclo++) {
    if (ciclo <= numeroCicli && vociPiano.length > 0) {
      const calcolo = calcolaRichiestaDaPiano(importoEntrataPerCiclo, vociPiano);
      for (const voce of calcolo.vociCalcolate) {
        applicaImportoADestinazione(voce.tipoDestinazione, voce.destinazioneId, voce.importoRichiesto, mappaFondi, mappaObiettivi);
      }
    }

    for (const mov of movimentiManuali) {
      if (mov.tipo !== 'ripetitivo') continue;
      if (ciclo <= (mov.numeroOccorrenze ?? numeroCicli)) {
        applicaImportoADestinazione(mov.tipoDestinazione, mov.destinazioneId, Number(mov.importo), mappaFondi, mappaObiettivi);
      }
    }

    traiettoria.push({
      ciclo,
      fondi: [...mappaFondi.values()].map((f) => ({ id: f.id, saldo: f.saldo })),
      obiettivi: [...mappaObiettivi.values()].map((o) => ({ id: o.id, saldoAccumulato: o.saldoAccumulato }))
    });
  }

  // I movimenti 'singolo' si applicano qui, in un unico passaggio finale, non legati ad alcun
  // ciclo: basta che la loro data cada nel periodo del Prospetto (fuoriOrizzonte === false).
  for (const mov of movimentiManuali) {
    if (mov.tipo !== 'singolo' || mov.fuoriOrizzonte) continue;
    applicaImportoADestinazione(mov.tipoDestinazione, mov.destinazioneId, Number(mov.importo), mappaFondi, mappaObiettivi);
  }

  return {
    fondiProiettati: [...mappaFondi.values()],
    obiettiviProiettati: [...mappaObiettivi.values()],
    traiettoria
  };
}
