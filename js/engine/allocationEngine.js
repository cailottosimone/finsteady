// Motore di Allocazione (§2.9 / §3.5 FDD).
// Ogni funzione qui dentro PROPONE una distribuzione: non scrive mai su IndexedDB.
// La persistenza e l'applicazione degli effetti avvengono solo in domain/allocazioni.js,
// dopo la conferma esplicita dell'utente.

const TOLLERANZA = 0.01;

function arrotonda(v) {
  const a = Math.round(v * 100) / 100;
  return a === 0 ? 0 : a;
}

// Distribuisce un importo in parti uguali tra gli elementi selezionati.
// L'ultimo elemento assorbe l'eventuale scarto di arrotondamento, per garantire che
// la somma delle righe coincida sempre esattamente con l'importo dell'entrata.
export function calcolaPropostaEqua(importoEntrata, elementi) {
  if (!elementi || elementi.length === 0) {
    throw new Error('Seleziona almeno un elemento per la strategia Equa.');
  }
  const quota = Math.floor((importoEntrata / elementi.length) * 100) / 100;
  let cumulato = 0;
  return elementi.map((el, indice) => {
    const importo = indice === elementi.length - 1
      ? arrotonda(importoEntrata - cumulato)
      : quota;
    cumulato = arrotonda(cumulato + importo);
    return { ...el, importo };
  });
}

// Distribuisce mantenendo i rapporti dell'Importo Target complessivo di ciascun Obiettivo
// selezionato (decisione esplicita: il rapporto si basa sul target, non sul saldo attuale
// né sull'importo mancante — così la proporzione resta stabile nel tempo).
export function calcolaPropostaProporzionale(importoEntrata, obiettivi) {
  if (!obiettivi || obiettivi.length === 0) {
    throw new Error('Seleziona almeno un Obiettivo per la strategia Proporzionale.');
  }
  const totaleTarget = obiettivi.reduce((s, o) => s + (Number(o.importoTarget) || 0), 0);
  if (totaleTarget <= 0) {
    throw new Error('Gli Obiettivi selezionati non hanno un Importo Target valorizzato: impossibile calcolare le proporzioni.');
  }
  let cumulato = 0;
  return obiettivi.map((o, indice) => {
    const importo = indice === obiettivi.length - 1
      ? arrotonda(importoEntrata - cumulato)
      : arrotonda(importoEntrata * (Number(o.importoTarget) / totaleTarget));
    cumulato = arrotonda(cumulato + importo);
    return {
      tipoDestinazione: 'obiettivo',
      destinazioneId: o.id,
      fondoId: o.fondoId,
      importo
    };
  });
}

// Calcola quanto richiederebbe ciascuna Voce del Piano attivo per una data entrata.
// Non decide ancora come risolvere un'eventuale insufficienza: quello è compito di
// risolviInsufficienzaManuale / risolviInsufficienzaPerPriorita, scelte dall'utente.
export function calcolaRichiestaDaPiano(importoEntrata, vociPiano) {
  const vociOrdinate = [...vociPiano].sort((a, b) => (a.priorita || 0) - (b.priorita || 0));
  const vociCalcolate = vociOrdinate.map((v) => ({
    ...v,
    importoRichiesto: v.modalitaImporto === 'fisso'
      ? arrotonda(Number(v.valore))
      : arrotonda(importoEntrata * (Number(v.valore) / 100))
  }));
  const totaleRichiesto = arrotonda(vociCalcolate.reduce((s, v) => s + v.importoRichiesto, 0));
  const sufficiente = totaleRichiesto <= importoEntrata + TOLLERANZA;

  return {
    vociCalcolate,
    totaleRichiesto,
    importoEntrata,
    sufficiente,
    mancante: sufficiente ? 0 : arrotonda(totaleRichiesto - importoEntrata)
  };
}

// Risoluzione scelta dall'utente in caso di entrata insufficiente: applica le Voci in ordine
// di priorità finché il denaro non si esaurisce, azzerando le Voci successive.
export function risolviInsufficienzaPerPriorita(importoEntrata, vociCalcolate) {
  let residuo = importoEntrata;
  return vociCalcolate.map((v) => {
    const importo = arrotonda(Math.max(0, Math.min(v.importoRichiesto, residuo)));
    residuo = arrotonda(residuo - importo);
    return { ...v, importo };
  });
}

// Risoluzione scelta dall'utente in caso di entrata insufficiente: propone gli importi
// richiesti così come calcolati (utili come punto di partenza), lasciando che sia l'utente
// a redistribuire manualmente prima della conferma.
export function risolviInsufficienzaManuale(vociCalcolate) {
  return vociCalcolate.map((v) => ({ ...v, importo: v.importoRichiesto }));
}

export function sommaRighe(righe) {
  return arrotonda(righe.reduce((s, r) => s + (Number(r.importo) || 0), 0));
}

export function importiCoincidono(importoEntrata, righe) {
  return Math.abs(sommaRighe(righe) - importoEntrata) <= TOLLERANZA;
}
