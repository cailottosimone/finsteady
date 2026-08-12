// Vista Impostazioni: raggiunta tramite l'icona a ingranaggio in fondo alla navigazione
// principale, non tramite una voce di nav ordinaria. Sezioni tramite tab (stesso stile già
// usato altrove, es. Conti > Fondi/Budget): Categorie, Dashboard (quali Azioni mostrare in
// evidenza), Salute Finanziaria (Fondo Emergenza, composizione spesa mensile stimata),
// Registra Entrata (destinazione dell'eccesso quando un Piano non copre l'intera Entrata),
// Diagnostica (dettaglio della Verifica di Integrità Patrimoniale, richiamabile dal badge
// compatto in Dashboard), Backup (esporta/importa il Profilo attivo — spostata qui dalla
// Dashboard in v0.27) e Cloud Sync (v0.27, tab separata dal Backup locale: due meccanismi
// distinti, uno manuale su file, uno automatico in background).

import { renderCategorie } from './viewCategorie.js';
import { renderImpostazioniDashboard } from './viewImpostazioniDashboard.js';
import { renderImpostazioniSaluteFinanziaria } from './viewImpostazioniSaluteFinanziaria.js';
import { renderImpostazioniAllocazione } from './viewImpostazioniAllocazione.js';
import { renderImpostazioniDiagnostica } from './viewImpostazioniDiagnostica.js';
import { renderBackup } from './viewBackup.js';
import { renderCloudSync } from './viewCloudSync.js';
import { renderBarraTab } from '../utils/tabsUtils.js';

let tabAttiva = 'categorie';

// Permette ad altre viste (es. il pulsante-ingranaggio dentro la scheda Fondo Emergenza di
// Salute Finanziaria) di aprire Impostazioni direttamente sulla tab desiderata.
export function impostaTabAttivaImpostazioni(chiave) {
  tabAttiva = chiave;
}

export async function renderImpostazioni(container) {
  container.innerHTML = `
    <section class="pannello">
      <h2>Impostazioni</h2>
      <div id="tab-impostazioni"></div>
    </section>
  `;

  renderBarraTab(container.querySelector('#tab-impostazioni'), {
    idBase: 'impostazioni',
    tabs: [
      { chiave: 'categorie', etichetta: 'Categorie' },
      { chiave: 'dashboard', etichetta: 'Dashboard' },
      { chiave: 'salute', etichetta: 'Salute Finanziaria' },
      { chiave: 'allocazione', etichetta: 'Registra Entrata' },
      { chiave: 'diagnostica', etichetta: 'Diagnostica' },
      { chiave: 'backup', etichetta: 'Backup' },
      { chiave: 'cloud', etichetta: 'Cloud Sync' }
    ],
    chiaveAttiva: tabAttiva,
    onCambio: (chiave, pannello) => {
      tabAttiva = chiave;
      if (chiave === 'categorie') renderCategorie(pannello);
      else if (chiave === 'dashboard') renderImpostazioniDashboard(pannello);
      else if (chiave === 'salute') renderImpostazioniSaluteFinanziaria(pannello);
      else if (chiave === 'allocazione') renderImpostazioniAllocazione(pannello);
      else if (chiave === 'diagnostica') renderImpostazioniDiagnostica(pannello);
      else if (chiave === 'backup') renderBackup(pannello);
      else renderCloudSync(pannello);
    }
  });
}
