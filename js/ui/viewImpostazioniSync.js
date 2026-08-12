// Vista Sync (in Impostazioni): stato della sincronizzazione cloud, login/logout, Carica/Scarica.
// Se js/sync/config.js non è stato compilato (vedi SETUP-SUPABASE.md), mostra solo un messaggio
// informativo — nessun'altra funzionalità dell'app dipende da questo.
//
// I pulsanti Carica/Scarica sono disabilitati ogni volta che stato.inCorso è vero — sia per
// un'azione manuale sia per il caricamento/scaricamento automatico (js/sync/syncEngine.js): lo
// stesso stato pilota anche il badge in Dashboard, un solo punto di verità, niente gestione
// separata del "disabled" nei singoli pulsanti.

import { syncDisponibile, accedi, registrati, esci } from '../sync/auth.js';
import { onCambioStatoSync, caricaSulCloud, scaricaDalCloud } from '../sync/syncEngine.js';
import { ottieniProfiloAttivo } from '../profili.js';
import { formattaDataOra } from '../utils/dateUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';

let annullaAscolto = null;
let modalitaRegistrazione = false;
let messaggioErrore = null;

export async function renderImpostazioniSync(container) {
  if (annullaAscolto) { annullaAscolto(); annullaAscolto = null; }

  if (!syncDisponibile()) {
    container.innerHTML = `
      <section class="pannello">
        <h3>Sync Cloud</h3>
        <p class="nota">
          Non ancora configurato. Segui la procedura in <strong>SETUP-SUPABASE.md</strong> (nella
          cartella principale del progetto) per collegare un account Supabase: crea un progetto
          gratuito, esegui lo script SQL incluso, poi incolla URL e chiave in
          <code>js/sync/config.js</code>. Finché non lo fai, l'app resta puramente locale —
          nessun'altra funzionalità è coinvolta.
        </p>
      </section>
    `;
    return;
  }

  annullaAscolto = onCambioStatoSync((stato) => renderConStato(container, stato));
}

async function renderConStato(container, stato) {
  if (!stato.autenticato) {
    renderLogin(container);
    return;
  }

  const profiloAttivo = await ottieniProfiloAttivo();

  container.innerHTML = `
    <section class="pannello">
      <h3>Sync Cloud</h3>
      <p class="nota">
        Account collegato: <strong>${stato.email}</strong>. Profilo collegato:
        <strong>${profiloAttivo.nome}</strong> — perché due dispositivi condividano gli stessi
        dati, devono avere lo stesso account <em>e</em> un Profilo attivo con lo stesso nome.
      </p>
      <p class="nota">
        Ogni modifica carica automaticamente sul Cloud dopo qualche secondo; all'apertura
        dell'app scarica automaticamente l'ultimo caricamento fatto altrove. I due pulsanti
        restano comunque disponibili per farlo a mano in qualunque momento. <strong>Carica</strong>
        sovrascrive quello che c'è sul Cloud con i dati di questo dispositivo.
        <strong>Scarica</strong> sovrascrive i dati di questo dispositivo con quello che c'è sul
        Cloud. Gli Allegati restano solo locali (vedi SETUP-SUPABASE.md).
      </p>
      ${stato.inCorso ? '<p><span class="badge">☁ In corso…</span></p>' : ''}
      ${stato.ultimoErrore ? `<p class="badge badge-errore">⚠️ ${stato.ultimoErrore}</p>` : ''}
      <p class="nota-inline">
        Ultimo caricamento: ${stato.ultimoCaricamento ? formattaDataOra(stato.ultimoCaricamento) : 'mai'}.
        Ultimo scaricamento: ${stato.ultimoScaricamento ? formattaDataOra(stato.ultimoScaricamento) : 'mai'}.
      </p>
      <div class="azioni-riga">
        <button id="btn-sync-carica" class="btn-primario" ${stato.inCorso ? 'disabled' : ''}>⬆ Carica sul Cloud</button>
        <button id="btn-sync-scarica" ${stato.inCorso ? 'disabled' : ''}>⬇ Scarica dal Cloud</button>
        <button id="btn-sync-esci" ${stato.inCorso ? 'disabled' : ''}>Disconnetti</button>
      </div>
    </section>
  `;

  container.querySelector('#btn-sync-carica').addEventListener('click', async () => {
    const ok = await mostraConferma({
      titolo: 'Caricare sul Cloud?',
      messaggio: `Sovrascrive quello che c'è sul Cloud per il Profilo "${profiloAttivo.nome}" con tutti i dati di questo dispositivo (Conti, Fondi, Obiettivi, Budget, Piano, Movimenti...). Operazione completa, non chiede altro dopo.`,
      testoConferma: 'Carica'
    });
    if (!ok) return;
    try {
      await caricaSulCloud();
      alert('Caricamento completato.');
    } catch (err) {
      alert(`Caricamento fallito: ${err.message}`);
    }
  });

  container.querySelector('#btn-sync-scarica').addEventListener('click', async () => {
    const ok = await mostraConferma({
      titolo: 'Scaricare dal Cloud?',
      messaggio: `Sostituisce INTERAMENTE i dati di questo dispositivo con quelli sul Cloud per il Profilo "${profiloAttivo.nome}". Operazione completa, non chiede altro dopo. Irreversibile per i dati attuali di questo dispositivo.`,
      testoConferma: 'Scarica e sostituisci',
      pericoloso: true
    });
    if (!ok) return;
    try {
      await scaricaDalCloud();
      alert('Scaricamento completato. La pagina verrà ricaricata.');
      window.location.reload();
    } catch (err) {
      alert(`Scaricamento fallito: ${err.message}`);
    }
  });

  container.querySelector('#btn-sync-esci').addEventListener('click', async () => {
    const ok = await mostraConferma({
      titolo: 'Disconnettere il Sync Cloud?',
      messaggio: 'I dati già caricati restano su Supabase. Potrai ricollegarti in qualunque momento con lo stesso account.',
      testoConferma: 'Disconnetti'
    });
    if (!ok) return;
    await esci();
  });
}

function renderLogin(container) {
  container.innerHTML = `
    <section class="pannello">
      <h3>Sync Cloud</h3>
      <p class="nota">
        Accedi con il tuo account per caricare o scaricare i dati di questo Profilo dal Cloud. I
        dati restano privati: solo tu, autenticato con questo account, puoi leggerli o scriverli.
      </p>
      <form id="form-sync-login" class="form-scheda">
        <label>Email *<input name="email" type="email" required></label>
        <label>Password *<input name="password" type="password" required minlength="6"></label>
        ${messaggioErrore ? `<p class="badge badge-errore">⚠️ ${messaggioErrore}</p>` : ''}
        <div class="form-azioni">
          <button type="submit" class="btn-primario">${modalitaRegistrazione ? 'Crea account e accedi' : 'Accedi'}</button>
          <button type="button" id="btn-sync-cambia-modalita">${modalitaRegistrazione ? 'Ho già un account' : 'Crea un nuovo account'}</button>
        </div>
      </form>
    </section>
  `;

  container.querySelector('#btn-sync-cambia-modalita').addEventListener('click', () => {
    modalitaRegistrazione = !modalitaRegistrazione;
    messaggioErrore = null;
    renderLogin(container);
  });

  container.querySelector('#form-sync-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    messaggioErrore = null;
    try {
      if (modalitaRegistrazione) {
        await registrati(dati.email, dati.password);
        messaggioErrore = null;
        alert('Account creato. Se la conferma email è attiva sul progetto Supabase, controlla la posta prima di accedere.');
      } else {
        await accedi(dati.email, dati.password);
      }
    } catch (err) {
      messaggioErrore = err.message;
      renderLogin(container);
    }
  });
}
