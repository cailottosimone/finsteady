export function formattaValuta(importo, valuta = 'EUR') {
  let numero = Number(importo) || 0;
  // Normalizza -0 a 0 (e residui infinitesimali da virgola mobile arrotondati al centesimo
  // che risultano in "-0,00 €" pur essendo, nella sostanza, zero).
  const arrotondato = Math.round(numero * 100) / 100;
  numero = arrotondato === 0 ? 0 : arrotondato;
  return numero.toLocaleString('it-IT', { style: 'currency', currency: valuta });
}
