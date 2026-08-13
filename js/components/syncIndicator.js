// js/components/syncIndicator.js — stato Cloud Sync, presentazionale, legge solo
// js/data/syncProfilo.js. Due punti di montaggio (sidebar desktop, topbar mobile) più una
// lettura puntuale per il menu "Altro" mobile (js/components/menuMobile.js).

import { state as syncState, onSyncStateChange } from '../data/syncProfilo.js';

const CONFIG = {
  offline: { icona: 'fa-wifi', testo: 'Offline' },
  disconnesso: { icona: 'fa-cloud', testo: 'Non collegato' },
  da_collegare: { icona: 'fa-triangle-exclamation', testo: 'Profilo da collegare', classe: 'sync-stato-attenzione' },
  syncing: { icona: 'fa-arrows-rotate fa-spin', testo: 'Sincronizzazione…', classe: 'sync-stato-attivo' },
  idle: { icona: 'fa-cloud-arrow-up', testo: 'Sincronizzato', classe: 'sync-stato-ok' },
  errore: { icona: 'fa-triangle-exclamation', testo: 'Errore di sincronizzazione', classe: 'sync-stato-errore' }
};

function configCorrente() {
  return CONFIG[syncState.status] || CONFIG.disconnesso;
}

/** Lettura puntuale (non reattiva), usata dal menu "Altro" mobile. */
export function descrizioneStatoSync() {
  const c = configCorrente();
  return { testo: c.testo, classe: c.classe || '' };
}

function badgeConteggio() {
  return syncState.pendingCount > 0 && syncState.status !== 'syncing'
    ? `<span class="sync-badge-conteggio">${syncState.pendingCount}</span>` : '';
}

/** Sidebar desktop: riga icona + etichetta di stato, stile identico alle altre righe del
 * piè di pagina (sidebar-riga-profilo). */
export function montaSyncIndicatorSidebar(container, apriCloudSync) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-riga-profilo';
  const render = () => {
    const c = configCorrente();
    btn.innerHTML = `
      <span style="position:relative; width:22px; text-align:center; flex-shrink:0;" class="${c.classe || ''}">
        <i class="fa-solid ${c.icona}"></i>${badgeConteggio()}
      </span>
      <span class="sidebar-riga-profilo-testo">
        <span class="sidebar-riga-profilo-nome" style="font-weight:500;">Cloud Sync</span>
        <span class="sidebar-riga-profilo-sotto">${c.testo}</span>
      </span>
    `;
  };
  render();
  onSyncStateChange(render);
  btn.addEventListener('click', apriCloudSync);
  container.appendChild(btn);
}

/** Topbar mobile: solo icona, stesso trattamento delle altre icone della topbar. */
export function montaSyncIndicatorTopbar(container, apriCloudSync) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'topbar-icona-btn';
  const render = () => {
    const c = configCorrente();
    btn.title = `Cloud Sync: ${c.testo}`;
    btn.setAttribute('aria-label', `Cloud Sync: ${c.testo}`);
    btn.innerHTML = `<span class="${c.classe || ''}"><i class="fa-solid ${c.icona}"></i></span>${badgeConteggio()}`;
  };
  render();
  onSyncStateChange(render);
  btn.addEventListener('click', apriCloudSync);
  container.appendChild(btn);
}
