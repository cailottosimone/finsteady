// Vista Impostazioni: raggiunta tramite l'icona a ingranaggio in fondo alla navigazione
// principale, non tramite una voce di nav ordinaria. Sette sezioni tramite tab (stesso stile
// già usato altrove, es. Conti > Fondi/Budget): Categorie, Dashboard (quali Azioni mostrare in
// evidenza), Salute Finanziaria (Fondo Emergenza, composizione spesa mensile stimata),
// Registra Entrata (destinazione dell'eccesso quando un Piano non copre l'intera Entrata),
// Backup (esporta/importa la configurazione del Profilo attivo, spostato qui dalla Dashboard),
// Sync (Fase 6 — sincronizzazione cloud opzionale via Supabase) e Diagnostica (dettaglio della
// Verifica di Integrità Patrimoniale, richiamabile dal badge compatto in Dashboard).

import { renderCategorie } from './viewCategorie.js';
import { renderImpostazioniDashboard } from './viewImpostazioniDashboard.js';
import { renderImpostazioniSaluteFinanziaria } from './viewImpostazioniSaluteFinanziaria.js';
import { renderImpostazioniAllocazione } from './viewImpostazioniAllocazione.js';
import { renderImpostazioniBackup } from './viewImpostazioniBackup.js';
import { renderImpostazioniSync } from './viewImpostazioniSync.js';
import { renderImpostazioniDiagnostica } from './viewImpostazioniDiagnostica.js';
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
      { chiave: 'backup', etichetta: 'Backup' },
      { chiave: 'sync', etichetta: 'Sync' },
      { chiave: 'diagnostica', etichetta: 'Diagnostica' }
    ],
    chiaveAttiva: tabAttiva,
    onCambio: (chiave, pannello) => {
      tabAttiva = chiave;
      if (chiave === 'categorie') renderCategorie(pannello);
      else if (chiave === 'dashboard') renderImpostazioniDashboard(pannello);
      else if (chiave === 'salute') renderImpostazioniSaluteFinanziaria(pannello);
      else if (chiave === 'allocazione') renderImpostazioniAllocazione(pannello);
      else if (chiave === 'backup') renderImpostazioniBackup(pannello);
      else if (chiave === 'sync') renderImpostazioniSync(pannello);
      else renderImpostazioniDiagnostica(pannello);
    }
  });
}
