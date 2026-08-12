import { renderDashboard } from './ui/dashboard.js';
import { renderConti } from './ui/viewConti.js';
import { renderCicloBudget } from './ui/viewCicloBudget.js';
import { renderAllocazione } from './ui/viewAllocazione.js';
import { renderUscita } from './ui/viewUscita.js';
import { renderTrasferimento } from './ui/viewTrasferimento.js';
import { renderRettifica } from './ui/viewRettifica.js';
import { renderDistribuzione } from './ui/viewDistribuzione.js';
import { renderRidistribuzione } from './ui/viewRidistribuzione.js';
import { renderMovimenti } from './ui/viewMovimenti.js';
import { renderStrategiaReport } from './ui/sezioneStrategiaReport.js';
import { renderImpostazioni, impostaTabAttivaImpostazioni } from './ui/viewImpostazioni.js';
import { renderProfili } from './ui/viewProfili.js';
import { inizializzaProfili } from './profili.js';
import { impostaNomeDatabase } from './db-schema.js';
import { htmlAvatar } from './utils/avatarUtils.js';
import { montaSyncIndicatorSidebar, montaSyncIndicatorTopbar, descrizioneStatoSync } from './components/syncIndicator.js';
import { initSyncProfilo } from './data/syncProfilo.js';
import { avviaDecorazioneTabelleMobili } from './utils/tabelleMobiliUtils.js';
import { apriModaleVista } from './components/modaleVista.js';
import { apriMenuAzioniRapide } from './components/menuAzioniRapide.js';
import { apriMenuMobile } from './components/menuMobile.js';

// Voci di navigazione principale (in ordine di visualizzazione) — invariate nella sostanza
// rispetto a prima: Fondi, Budget e Categorie non sono viste a sé (montate come tab dentro
// Conti/Impostazioni), Piano/Consuntivi/Prospetti/Salute Finanziaria sono tab dentro
// "Strategia & Report". `icona` è nuovo: serve alla sidebar desktop e alla tabbar mobile, che
// ora condividono la stessa fonte invece di avere ciascuna il proprio elenco di etichette.
const VISTE = {
  dashboard: { titolo: 'Dashboard', render: renderDashboard, icona: 'fa-house' },
  entrata: { titolo: 'Registra Entrata', render: renderAllocazione, nascostaDaNav: true, modale: true, dimensioneModale: 'ampia' },
  uscita: { titolo: 'Registra Uscita', render: renderUscita, nascostaDaNav: true, modale: true },
  trasferimento: { titolo: 'Registra Trasferimento', render: renderTrasferimento, nascostaDaNav: true, modale: true },
  rettifica: { titolo: 'Registra Rettifica', render: renderRettifica, nascostaDaNav: true, modale: true },
  distribuzione: { titolo: 'Distribuisci Disponibile', render: renderDistribuzione, nascostaDaNav: true, modale: true, dimensioneModale: 'ampia' },
  ridistribuzione: { titolo: 'Ridistribuisci Liquidità', render: renderRidistribuzione, nascostaDaNav: true, modale: true, dimensioneModale: 'ampia' },
  conti: { titolo: 'Conti', render: renderConti, icona: 'fa-building-columns' },
  cicloBudget: { titolo: 'Mese (Ciclo Budget)', render: renderCicloBudget, nascostaDaNav: true },
  strategiaReport: { titolo: 'Strategia & Report', render: renderStrategiaReport, icona: 'fa-chart-line' },
  movimenti: { titolo: 'Movimenti', render: renderMovimenti, icona: 'fa-receipt' },
  impostazioni: { titolo: 'Impostazioni', render: renderImpostazioni, nascostaDaNav: true },
  profili: { titolo: 'Profili', render: renderProfili, nascostaDaNav: true }
};

// Le 4 sezioni principali, condivise da sidebar desktop e tabbar mobile.
const VOCI_NAV_PRINCIPALE = Object.entries(VISTE)
  .filter(([, v]) => !v.nascostaDaNav)
  .map(([chiave, v]) => ({ chiave, titolo: v.titolo, icona: v.icona }));

const contenuto = document.querySelector('#contenuto');
const sidebarNav = document.querySelector('#sidebar-nav');
const sidebarFooter = document.querySelector('#sidebar-footer');
const tabbarMobile = document.querySelector('#tabbar-mobile');
const topbarAzioniMobile = document.querySelector('#topbar-mobile-azioni');
const btnFab = document.querySelector('#btn-fab');
const btnNuovoSidebar = document.querySelector('#btn-nuovo-sidebar');

let profiloAttivoCorrente = null;

function costruisciNavigazione(profiloAttivo) {
  // Sidebar (desktop)
  sidebarNav.innerHTML = VOCI_NAV_PRINCIPALE.map((v) => `
    <button type="button" class="sidebar-link" data-vista="${v.chiave}">
      <i class="fa-solid ${v.icona}"></i>${v.titolo}
    </button>
  `).join('');
  sidebarNav.querySelectorAll('.sidebar-link').forEach((btn) => {
    btn.addEventListener('click', () => mostraVista(btn.dataset.vista));
  });

  sidebarFooter.innerHTML = `
    <button type="button" class="sidebar-riga-profilo" id="sidebar-riga-profilo">
      <span>${htmlAvatar(profiloAttivo.nome, 30)}</span>
      <span class="sidebar-riga-profilo-testo" style="display:flex; flex-direction:column;">
        <span class="sidebar-riga-profilo-nome">${profiloAttivo.nome}</span>
        <span class="sidebar-riga-profilo-sotto">Profilo attivo</span>
      </span>
    </button>
    <button type="button" class="sidebar-riga-profilo" id="sidebar-riga-impostazioni">
      <i class="fa-solid fa-gear" style="width:28px; text-align:center; color:var(--colore-testo-soft);"></i>
      <span class="sidebar-riga-profilo-testo"><span class="sidebar-riga-profilo-nome" style="font-weight:500;">Impostazioni</span></span>
    </button>
    <div id="slot-sync-sidebar"></div>
  `;
  sidebarFooter.querySelector('#sidebar-riga-profilo').addEventListener('click', () => mostraVista('profili'));
  sidebarFooter.querySelector('#sidebar-riga-impostazioni').addEventListener('click', () => mostraVista('impostazioni'));
  montaSyncIndicatorSidebar(sidebarFooter.querySelector('#slot-sync-sidebar'), () => {
    impostaTabAttivaImpostazioni('cloud');
    mostraVista('impostazioni');
  });

  // Tabbar (mobile): le 4 sezioni principali + "Altro" (Profilo/Impostazioni/Cloud Sync).
  tabbarMobile.innerHTML = VOCI_NAV_PRINCIPALE.map((v) => `
    <button type="button" class="tabbar-link" data-vista="${v.chiave}">
      <i class="fa-solid ${v.icona}"></i>${v.titolo}
    </button>
  `).join('') + `
    <button type="button" class="tabbar-link" id="tabbar-altro">
      <i class="fa-solid fa-ellipsis"></i>Altro
    </button>
  `;
  tabbarMobile.querySelectorAll('.tabbar-link[data-vista]').forEach((btn) => {
    btn.addEventListener('click', () => mostraVista(btn.dataset.vista));
  });
  tabbarMobile.querySelector('#tabbar-altro').addEventListener('click', () => {
    apriMenuMobile(profiloAttivoCorrente, descrizioneStatoSync());
  });

  // Topbar (mobile): solo lo stato Cloud Sync a colpo d'occhio (Profilo/Impostazioni sono
  // dentro "Altro" in tabbar, per non duplicare due punti di accesso diversi).
  topbarAzioniMobile.innerHTML = '';
  montaSyncIndicatorTopbar(topbarAzioniMobile, () => {
    impostaTabAttivaImpostazioni('cloud');
    mostraVista('impostazioni');
  });
}

async function mostraVista(chiave) {
  sidebarNav.querySelectorAll('.sidebar-link').forEach((btn) => {
    btn.classList.toggle('attivo', btn.dataset.vista === chiave);
  });
  tabbarMobile.querySelectorAll('.tabbar-link[data-vista]').forEach((btn) => {
    btn.classList.toggle('attivo', btn.dataset.vista === chiave);
  });
  window.scrollTo({ top: 0 });
  await VISTE[chiave].render(contenuto);
}

// Apre un'Azione (Entrata/Uscita/Trasferimento/Rettifica/Distribuzione/Ridistribuzione) in
// modale invece che a piena pagina; il "Mese (Ciclo Budget)" e le altre viste non marcate
// `modale` restano navigazione normale (window.mostraVista). Le viste stesse non sanno né gli
// importa dove vengono montate: nessuna modifica alla loro logica interna.
function apriAzione(chiave) {
  const vista = VISTE[chiave];
  if (!vista) return;
  if (vista.modale) {
    apriModaleVista({ titolo: vista.titolo, render: vista.render, dimensione: vista.dimensioneModale });
  } else {
    mostraVista(chiave);
  }
}

// Esposti globalmente: usati da altre viste per navigare/aprire un'Azione senza dover
// conoscere i dettagli del router (es. Dashboard, "Mese" dentro Budget, badge di integrità).
window.mostraVista = mostraVista;
window.apriAzione = apriAzione;

btnFab?.addEventListener('click', () => apriMenuAzioniRapide());
btnNuovoSidebar?.addEventListener('click', () => apriMenuAzioniRapide());

async function avvia() {
  // Bootstrap Profili: DEVE avvenire prima di qualunque chiamata a storage.js (che mette in
  // cache la connessione al database al primo utilizzo).
  const profiloAttivo = await inizializzaProfili();
  profiloAttivoCorrente = profiloAttivo;
  impostaNomeDatabase(profiloAttivo.dbName);

  costruisciNavigazione(profiloAttivo);
  mostraVista('dashboard');

  // Decorazione automatica delle tabelle per la vista mobile (data-label): si applica a
  // qualunque tabella .tabella/.tabella-integrita compaia, ora o in seguito, ovunque venga
  // montata — anche dentro le modali (js/components/modaleVista.js), perché osserva l'intero
  // <body>, non solo #contenuto: le Azioni rapide (Distribuzione, Ridistribuzione...) hanno
  // tabelle proprie che devono restare leggibili anche in modale su schermi piccoli.
  avviaDecorazioneTabelleMobili(document.body);

  // Cloud Sync (facoltativo): avviato dopo che il Profilo attivo è noto.
  initSyncProfilo();
}

avvia();
