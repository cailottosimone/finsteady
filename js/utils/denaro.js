// Utility condivisa per l'arrotondamento monetario.
//
// Principio (decisione esplicita dell'utente, rivista dopo un bug): ogni saldo (Conto, Fondo,
// Obiettivo, Budget) deve SEMPRE avere esattamente 2 decimali, mai di più — ma l'arrotondamento
// dev'essere quello STANDARD (al più vicino), non sistematicamente per difetto. Arrotondare
// sempre per difetto ad ogni singola scrittura intermedia (allocazioni, trasferimenti, storni...)
// tronca via anche il normale rumore di virgola mobile (es. 333.33999999999994, che
// matematicamente è 333.34) invece di arrotondarlo al valore corretto — ripetuto su più
// operazioni, il centesimo perso si accumula e il totale finale risulta inferiore a quanto
// realmente distribuito. Se una piccola incongruenza dovesse comunque presentarsi, l'utente
// preferisce correggerla a mano con una Rettifica piuttosto che subire un troncamento sistematico.
//
// - Saldi (saldoReale, saldo, saldoAccumulato, importi assegnati) → arrotondamento STANDARD.
// - "Soldi da mettere da parte" (importo mensile consigliato per un Obiettivo) → arrotonda
//   PER ECCESSO. Accantonare qualche centesimo in più non è un problema; accantonarne di meno
//   rischierebbe di non raggiungere l'Obiettivo entro la scadenza.

// Elimina il rumore di virgola mobile oltre la 6ª cifra decimale, prima di arrotondare
// a 2 decimali: senza questo passaggio, l'arrotondamento di numeri come 99.99999999999999
// (che dovrebbe essere 100) darebbe risultati sbagliati per un pelo.
function pulisciRumoreVirgolaMobile(valore) {
  return Math.round((Number(valore) || 0) * 1e6) / 1e6;
}

function normalizzaZero(valore) {
  // (-0).toFixed/toLocaleString può produrre "-0,00 €", fuorviante pur essendo zero.
  return valore === 0 ? 0 : valore;
}

export function arrotonda(valore) {
  const pulito = pulisciRumoreVirgolaMobile(valore);
  return normalizzaZero(Math.round(pulito * 100) / 100);
}

export function arrotondaPerEccesso(valore) {
  const pulito = pulisciRumoreVirgolaMobile(valore);
  return normalizzaZero(Math.ceil(pulito * 100) / 100);
}
