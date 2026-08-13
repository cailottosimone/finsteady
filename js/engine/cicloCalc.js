// Calcolo puro dei periodi del Ciclo Budget. Nessun accesso a IndexedDB: riceve le
// impostazioni già caricate e una data di riferimento, restituisce { inizio, fine } (Date).
//
// Modalità "mese_solare": il periodo va dal 1° all'ultimo giorno del mese.
// Modalità "custom": il periodo va dal giorno configurato (es. 15) al giorno precedente
// dello stesso giorno il mese successivo (es. 15/07 → 14/08).

export function calcolaPeriodo(dataInizio, impostazioni) {
  if (impostazioni.modalita === 'mese_solare') {
    const fine = new Date(dataInizio.getFullYear(), dataInizio.getMonth() + 1, 0);
    return { inizio: dataInizio, fine };
  }
  const fine = new Date(dataInizio.getFullYear(), dataInizio.getMonth() + 1, impostazioni.giornoInizioCustom - 1);
  return { inizio: dataInizio, fine };
}

// Calcola il primo periodo da usare quando non esiste ancora alcun Ciclo Budget, in base
// alla data odierna (il periodo "in corso" secondo le impostazioni).
export function calcolaPeriodoIniziale(oggi, impostazioni) {
  if (impostazioni.modalita === 'mese_solare') {
    const inizio = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    return calcolaPeriodo(inizio, impostazioni);
  }
  const giorno = impostazioni.giornoInizioCustom;
  const inizio = oggi.getDate() >= giorno
    ? new Date(oggi.getFullYear(), oggi.getMonth(), giorno)
    : new Date(oggi.getFullYear(), oggi.getMonth() - 1, giorno);
  return calcolaPeriodo(inizio, impostazioni);
}

// Calcola il periodo immediatamente successivo a quello appena concluso (continuità, nessuna
// sovrapposizione o buco tra un ciclo e il successivo).
export function calcolaPeriodoSuccessivo(periodoFinePrecedente, impostazioni) {
  const inizio = new Date(periodoFinePrecedente);
  inizio.setDate(inizio.getDate() + 1);
  return calcolaPeriodo(inizio, impostazioni);
}
