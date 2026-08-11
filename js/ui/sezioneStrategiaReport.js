// Sezione "Strategia & Report": raggruppa in un'unica area di navigazione le viste che
// riguardano la pianificazione e l'analisi (non l'inserimento quotidiano di movimenti):
// Piano, Consuntivi, Prospetti e Salute Finanziaria.

import { renderPiano } from './viewPiano.js';
import { renderConsuntivi } from './viewConsuntivi.js';
import { renderProspetti } from './viewProspetti.js';
import { renderSaluteFinanziaria } from './viewSaluteFinanziaria.js';
import { renderBarraTab } from '../utils/tabsUtils.js';

let tabAttiva = 'piano';

export async function renderStrategiaReport(container) {
  container.innerHTML = `<div id="tab-strategia-report"></div>`;

  renderBarraTab(container.querySelector('#tab-strategia-report'), {
    idBase: 'strategia-report',
    tabs: [
      { chiave: 'piano', etichetta: 'Piano' },
      { chiave: 'consuntivi', etichetta: 'Consuntivi' },
      { chiave: 'prospetti', etichetta: 'Prospetti' },
      { chiave: 'salute', etichetta: 'Salute Finanziaria' }
    ],
    chiaveAttiva: tabAttiva,
    onCambio: (chiave, pannello) => {
      tabAttiva = chiave;
      if (chiave === 'piano') renderPiano(pannello);
      else if (chiave === 'consuntivi') renderConsuntivi(pannello);
      else if (chiave === 'prospetti') renderProspetti(pannello);
      else renderSaluteFinanziaria(pannello);
    }
  });
}
