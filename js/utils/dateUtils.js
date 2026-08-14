// Utility di supporto per calcoli su date, usate soprattutto dal motore di calcolo Obiettivi.

// Numero di mesi (arrotondati per eccesso) tra oggi e una data futura.
// Non scende mai sotto 1 per evitare divisioni per zero nel calcolo del suggerimento mensile.
export function mesiRimanenti(dataOggi, dataFutura) {
  const oggi = new Date(dataOggi);
  const futura = new Date(dataFutura);
  const mesi = (futura.getFullYear() - oggi.getFullYear()) * 12 + (futura.getMonth() - oggi.getMonth());
  // Se la data futura è nello stesso mese o già passata, consideriamo comunque almeno 1 mese
  return Math.max(mesi, 1);
}

export function formattaData(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT');
}

// Data + ora (es. "24/07/2026 18:22"), usata nel Registro Movimenti per una cronologia corretta:
// più movimenti nello stesso giorno vanno ordinati anche per orario, non solo per data.
export function formattaDataOra(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

// Valore per un input datetime-local (YYYY-MM-DDTHH:MM), impostato all'istante corrente.
export function oraLocaleInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function oggiISO() {
  return new Date().toISOString();
}
