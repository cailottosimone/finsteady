// Calcolo dinamico dei dati derivati di un Obiettivo.
//
// Regola di business (§2.5 e §5.7 del FDD): importoMancante, mesiRimanenti,
// importoMensileConsigliato e percentuale NON vengono mai salvati nel database.
// Sono sempre ricalcolati a runtime a partire da saldoAccumulato, importoTarget e dataPrevista,
// così da restare sempre spiegabili e coerenti anche dopo versamenti straordinari o modifiche.

import { mesiRimanenti as calcolaMesiRimanenti } from '../utils/dateUtils.js';
import { arrotondaPerEccesso } from '../utils/denaro.js';

export function calcolaDatiObiettivo(obiettivo, oggi = new Date()) {
  const target = Number(obiettivo.importoTarget) || 0;
  const saldo = Number(obiettivo.saldoAccumulato) || 0;

  const importoMancante = Math.max(target - saldo, 0);
  const mesi = obiettivo.dataPrevista ? calcolaMesiRimanenti(oggi, obiettivo.dataPrevista) : 1;
  // Arrotondato per eccesso (decisione esplicita): è preferibile accantonare qualche centesimo
  // in più ogni mese piuttosto che rischiare di non raggiungere l'Obiettivo entro la scadenza.
  const importoMensileConsigliato = importoMancante > 0
    ? arrotondaPerEccesso(importoMancante / mesi)
    : 0;
  const percentuale = target > 0
    ? Math.min(100, Math.round((saldo / target) * 1000) / 10)
    : 0;

  return {
    importoMancante,
    mesiRimanenti: mesi,
    importoMensileConsigliato,
    percentuale
  };
}

// Calcolo dinamico dei dati derivati di un Fondo, a partire dai suoi Obiettivi (decisione
// esplicita dell'utente): se il Fondo ha Obiettivi, l'"obiettivo complessivo" non è più un
// valore inserito a mano ma la SOMMA degli Importi Target dei suoi Obiettivi, e l'avanzamento
// del Fondo è il rapporto tra la somma dei saldi accumulati e questa somma. Mai salvato nel
// database: si ricalcola ogni volta, così resta sempre coerente anche dopo che un Obiettivo
// viene aggiunto, modificato o eliminato.
//
// Se il Fondo non ha Obiettivi, non c'è nulla da sommare: resta l'eventuale valore "Obiettivo
// complessivo" inserito manualmente (unico caso in cui quel campo ha ancora senso).
export function calcolaDatiFondo(fondo, obiettiviDelFondo) {
  if (!obiettiviDelFondo || obiettiviDelFondo.length === 0) {
    return {
      obiettivoComplessivo: Number(fondo.obiettivoComplessivoImporto) || 0,
      saldoAccumulatoTotale: 0,
      percentuale: null, // non calcolabile: nessun Obiettivo da cui derivarlo
      automatico: false
    };
  }

  const obiettivoComplessivo = obiettiviDelFondo.reduce((s, o) => s + (Number(o.importoTarget) || 0), 0);
  const saldoAccumulatoTotale = obiettiviDelFondo.reduce((s, o) => s + (Number(o.saldoAccumulato) || 0), 0);
  const percentuale = obiettivoComplessivo > 0
    ? Math.min(100, Math.round((saldoAccumulatoTotale / obiettivoComplessivo) * 1000) / 10)
    : 0;

  return { obiettivoComplessivo, saldoAccumulatoTotale, percentuale, automatico: true };
}
