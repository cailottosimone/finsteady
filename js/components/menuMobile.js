import { apriModaleVista, chiudiModaleVista } from './modaleVista.js';
import { htmlAvatar } from '../utils/avatarUtils.js';
import { impostaTabAttivaImpostazioni } from '../ui/viewImpostazioni.js';

// Menu "Altro" mobile: Profilo, Impostazioni, Cloud Sync — le tre voci che su desktop vivono
// sempre visibili in fondo alla sidebar (vedi app.js costruisciSidebarFooter), qui raccolte in
// un unico foglio per non occupare una tabbar già piena con le 4 sezioni principali.
export function apriMenuMobile(profiloAttivo, statoSync) {
  apriModaleVista({
    titolo: 'Altro',
    render: (container) => {
      container.innerHTML = `
        <button type="button" class="menu-mobile-voce" data-azione="profili">
          <span class="menu-mobile-avatar">${htmlAvatar(profiloAttivo.nome, 28)}</span>
          <span class="menu-mobile-voce-testo">
            <span>Profilo</span>
            <span class="menu-mobile-voce-sotto">${profiloAttivo.nome}</span>
          </span>
        </button>
        <button type="button" class="menu-mobile-voce" data-azione="impostazioni">
          <i class="fa-solid fa-gear"></i>
          <span class="menu-mobile-voce-testo"><span>Impostazioni</span></span>
        </button>
        <button type="button" class="menu-mobile-voce" data-azione="cloud">
          <span class="${statoSync?.classe || ''}"><i class="fa-solid fa-cloud"></i></span>
          <span class="menu-mobile-voce-testo">
            <span>Cloud Sync</span>
            <span class="menu-mobile-voce-sotto">${statoSync?.testo || 'Non collegato'}</span>
          </span>
        </button>
      `;
      container.querySelector('[data-azione="profili"]').addEventListener('click', () => {
        chiudiModaleVista();
        window.mostraVista('profili');
      });
      container.querySelector('[data-azione="impostazioni"]').addEventListener('click', () => {
        chiudiModaleVista();
        window.mostraVista('impostazioni');
      });
      container.querySelector('[data-azione="cloud"]').addEventListener('click', () => {
        chiudiModaleVista();
        impostaTabAttivaImpostazioni('cloud');
        window.mostraVista('impostazioni');
      });
    }
  });
}
