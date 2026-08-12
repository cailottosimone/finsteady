// js/components/syncIndicator.js — badge di stato Cloud Sync in nav, icona dedicata separata da
// Profilo e Impostazioni. Puramente presentazionale: legge solo js/data/syncProfilo.js.

import { state as syncState, onSyncStateChange } from '../data/syncProfilo.js';

const CONFIG = {
  offline: { icona: 'fa-wifi', titolo: 'Cloud Sync: offline' },
  disconnesso: { icona: 'fa-cloud', titolo: 'Cloud Sync: non collegato' },
  da_collegare: { icona: 'fa-triangle-exclamation', titolo: 'Cloud Sync: Profilo da collegare', classe: 'sync-attenzione' },
  syncing: { icona: 'fa-arrows-rotate fa-spin', titolo: 'Cloud Sync: sincronizzazione in corso', classe: 'sync-attivo' },
  idle: { icona: 'fa-cloud-arrow-up', titolo: 'Cloud Sync: sincronizzato', classe: 'sync-ok' },
  errore: { icona: 'fa-triangle-exclamation', titolo: 'Cloud Sync: errore', classe: 'sync-errore' }
};

function render(el) {
  const c = CONFIG[syncState.status] || CONFIG.disconnesso;
  el.className = `nav-btn-impostazioni ${c.classe || ''}`;
  el.title = c.titolo;
  el.setAttribute('aria-label', c.titolo);
  const badgeConteggio = syncState.pendingCount > 0 && syncState.status !== 'syncing'
    ? `<span class="sync-badge-conteggio">${syncState.pendingCount}</span>` : '';
  el.innerHTML = `<i class="fa-solid ${c.icona}"></i>${badgeConteggio}`;
}

/** Crea e monta il pulsante badge nel contenitore passato (vedi js/app.js), restando aggiornato
 * da solo finché la pagina resta aperta. Al click, apre Impostazioni sulla tab Cloud Sync. */
export function montaSyncIndicator(container, apriCloudSync) {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'nav-btn-cloud-sync';
  render(el);
  onSyncStateChange(() => render(el));
  el.addEventListener('click', apriCloudSync);
  container.appendChild(el);
}
