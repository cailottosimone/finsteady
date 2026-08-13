// Avatar Profilo — cerchio con l'iniziale del nome, colore calcolato in automatico dal nome
// stesso (stesso nome → sempre stesso colore, nessun dato aggiuntivo da salvare). Sostituisce
// la precedente possibilità di caricare un'immagine: nessun campo nel database, nessun peso
// nei file di export/import multi-profilo.

const PALETTE = ['#5B5FEF', '#EF5B8C', '#22A699', '#F2A104', '#8E44AD', '#2C7DA0', '#C0392B', '#16A085'];

function hashStringa(testo) {
  let hash = 0;
  for (let i = 0; i < testo.length; i++) {
    hash = (hash * 31 + testo.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function coloreAvatar(nome) {
  return PALETTE[hashStringa(nome || '') % PALETTE.length];
}

export function inizialeAvatar(nome) {
  const testo = (nome || '').trim();
  return testo ? testo.charAt(0).toUpperCase() : '?';
}

// dimensionePx: diametro del cerchio in pixel.
export function htmlAvatar(nome, dimensionePx = 32) {
  const fontSize = Math.round(dimensionePx * 0.45);
  return `
    <span style="
      width:${dimensionePx}px; height:${dimensionePx}px; border-radius:50%;
      display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;
      background:${coloreAvatar(nome)}; color:#fff; font-weight:600; font-size:${fontSize}px;
    ">${inizialeAvatar(nome)}</span>
  `;
}
