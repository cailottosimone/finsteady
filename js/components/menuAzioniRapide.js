import { apriModaleVista, chiudiModaleVista } from './modaleVista.js';
import { AZIONI } from '../ui/dashboard.js';

// Elenco completo delle Azioni (stesso ordine/etichette/icone della Dashboard, vedi
// js/ui/dashboard.js — un'unica fonte per non disallineare mai le due presentazioni), qui in
// forma di menu verticale, raggiungibile da ovunque nell'app (non solo dalla Dashboard).
export function apriMenuAzioniRapide() {
  apriModaleVista({
    titolo: 'Nuovo movimento',
    render: (container) => {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${AZIONI.map((a) => `
            <button type="button" class="azione-btn ${a.primaria ? 'azione-primaria' : 'azione-neutra'}" data-azione-rapida="${a.id}">
              <span class="azione-icona">${a.icona}</span>${a.label}
            </button>
          `).join('')}
        </div>
      `;
      container.querySelectorAll('[data-azione-rapida]').forEach((btn) => {
        btn.addEventListener('click', () => {
          chiudiModaleVista();
          window.apriAzione(btn.dataset.azioneRapida);
        });
      });
    }
  });
}
