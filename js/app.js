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
import { renderImpostazioni } from './ui/viewImpostazioni.js';
import { renderProfili } from './ui/viewProfili.js';
import { inizializzaProfili } from './profili.js';
import { impostaNomeDatabase } from './db-schema.js';
import { htmlAvatar } from './utils/avatarUtils.js';
import { avviaMotoreSync } from './sync/syncEngine.js';

// Voci di navigazione principale (in ordine di visualizzazione). Le viste con
// nascostaDaNav:true non compaiono come bottone in nav, ma restano raggiungibili tramite
// window.mostraVista(chiave) da un pulsante interno a un'altra vista (es. "Registra Entrata"
// dalla Dashboard, "Mese" da dentro Budget). Fondi, Budget e Categorie non sono più viste a sé:
// sono montate rispettivamente dentro Conti (tab) e Impostazioni. Piano e Consuntivi sono
// montati come tab dentro Strategia & Report.
const VISTE = {
  dashboard: { titolo: 'Dashboard', render: renderDashboard },
  entrata: { titolo: 'Registra Entrata', render: renderAllocazione, nascostaDaNav: true },
  uscita: { titolo: 'Registra Uscita', render: renderUscita, nascostaDaNav: true },
  trasferimento: { titolo: 'Registra Trasferimento', render: renderTrasferimento, nascostaDaNav: true },
  rettifica: { titolo: 'Registra Rettifica', render: renderRettifica, nascostaDaNav: true },
  distribuzione: { titolo: 'Distribuisci Disponibile', render: renderDistribuzione, nascostaDaNav: true },
  ridistribuzione: { titolo: 'Ridistribuisci Liquidità', render: renderRidistribuzione, nascostaDaNav: true },
  conti: { titolo: 'Conti', render: renderConti },
  cicloBudget: { titolo: 'Mese (Ciclo Budget)', render: renderCicloBudget, nascostaDaNav: true },
  strategiaReport: { titolo: 'Strategia & Report', render: renderStrategiaReport },
  movimenti: { titolo: 'Movimenti', render: renderMovimenti },
  impostazioni: { titolo: 'Impostazioni', render: renderImpostazioni, nascostaDaNav: true },
  profili: { titolo: 'Profili', render: renderProfili, nascostaDaNav: true }
};

const contenuto = document.querySelector('#contenuto');
const nav = document.querySelector('#nav-principale');

function costruisciNav(profiloAttivo) {
  const vociVisibili = Object.entries(VISTE)
    .filter(([, v]) => !v.nascostaDaNav)
    .map(([chiave, v]) => `<button class="nav-btn" data-vista="${chiave}">${v.titolo}</button>`)
    .join('');

  // Impostazioni (ingranaggio) e Profili (persona) stanno nello stesso <nav>, con una classe
  // dedicata che li spinge in fondo con margin-left:auto (css/style.css): restano raggiungibili
  // da tastiera nello stesso ordine di tabulazione, ma visivamente separati dalle voci principali.
  nav.innerHTML = `
    ${vociVisibili}
    <div class="gruppo-icone-nav">
      <button class="nav-btn-impostazioni" data-vista="profili" title="Profilo attivo: ${profiloAttivo.nome}" aria-label="Profili (attivo: ${profiloAttivo.nome})">
        ${htmlAvatar(profiloAttivo.nome, 26)}
      </button>
      <button class="nav-btn-impostazioni" data-vista="impostazioni" title="Impostazioni" aria-label="Impostazioni">
        <i class="fa-solid fa-gear"></i>
      </button>
    </div>
  `;

  nav.querySelectorAll('.nav-btn, .nav-btn-impostazioni').forEach((btn) => {
    btn.addEventListener('click', () => mostraVista(btn.dataset.vista));
  });
}

async function mostraVista(chiave) {
  nav.querySelectorAll('.nav-btn, .nav-btn-impostazioni').forEach((btn) => {
    btn.classList.toggle('attivo', btn.dataset.vista === chiave);
  });
  await VISTE[chiave].render(contenuto);
}

// Esposto globalmente per permettere ai pulsanti-azione di altre viste (es. "Registra Entrata"
// dalla Dashboard, "Mese" da dentro Budget) di navigare senza che quella vista debba conoscere
// i dettagli del router.
window.mostraVista = mostraVista;

// Bootstrap Profili: DEVE avvenire prima di qualunque chiamata a storage.js (che mette in
// cache la connessione al database al primo utilizzo — cambiare database dopo non avrebbe più
// effetto in questa sessione). Determina il Profilo attivo (creando quello di migrazione al
// primo avvio) e imposta il nome del database su cui storage.js si connetterà.
async function avvia() {
  const profiloAttivo = await inizializzaProfili();
  impostaNomeDatabase(profiloAttivo.dbName);

  costruisciNav(profiloAttivo);
  mostraVista('dashboard');

  // Avviato per ultimo, dopo che il database del Profilo attivo è già impostato: se il Sync
  // Cloud non è configurato (js/sync/config.js vuoto) non fa nulla, l'app resta invariata.
  avviaMotoreSync();
}

avvia();
