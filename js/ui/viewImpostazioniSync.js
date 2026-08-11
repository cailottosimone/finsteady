// Vista Sync (in Impostazioni): stato della sincronizzazione cloud, login/logout, risoluzione
// conflitti. Se js/sync/config.js non è stato compilato (vedi SETUP-SUPABASE.md), mostra solo
// un messaggio informativo — nessun'altra funzionalità dell'app dipende da questo.

import { syncDisponibile, accedi, registrati, esci } from '../sync/auth.js';
import {
  onCambioStatoSync, sincronizzaOra, elencoConflitti, risolviConflitto
} from '../sync/syncEngine.js';
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

function renderConStato(container, stato) {
  if (!stato.autenticato) {
    renderLogin(container);
    return;
  }

  container.innerHTML = `
    <section class="pannello">
      <h3>Sync Cloud</h3>
      <p class="nota">
        Account collegato: <strong>${stato.email}</strong>.
        I dati (Conti, Fondi, Obiettivi, Budget, Piano, Movimenti...) si sincronizzano
        automaticamente in background con questo account, su tutti i dispositivi collegati allo
        stesso account. Gli Allegati restano solo locali (vedi SETUP-SUPABASE.md).
      </p>
      <p>
        ${stato.inCorso
          ? '<span class="badge">Sincronizzazione in corso…</span>'
          : '<span class="badge badge-ok">✓ Sincronizzato</span>'}
        ${stato.inCoda > 0 ? `<span class="badge">${stato.inCoda} modifica${stato.inCoda === 1 ? '' : 'he'} in coda</span>` : ''}
        ${stato.conflitti > 0 ? `<span class="badge badge-errore">⚠ ${stato.conflitti} conflitt${stato.conflitti === 1 ? 'o' : 'i'} da risolvere</span>` : ''}
      </p>
      <p class="nota-inline">Ultima sincronizzazione: ${stato.ultimoSync ? formattaDataOra(stato.ultimoSync) : 'mai, da quando hai aperto l\'app'}.</p>
      ${stato.ultimoErrore ? `<p class="badge badge-errore">⚠️ ${stato.ultimoErrore}</p>` : ''}
      <div class="azioni-riga">
        <button id="btn-sync-ora">Sincronizza ora</button>
        <button id="btn-sync-esci">Disconnetti</button>
      </div>
      <div id="zona-conflitti-sync"></div>
    </section>
  `;

  container.querySelector('#btn-sync-ora').addEventListener('click', async () => {
    await sincronizzaOra();
  });

  container.querySelector('#btn-sync-esci').addEventListener('click', async () => {
    const ok = await mostraConferma({
      titolo: 'Disconnettere il Sync Cloud?',
      messaggio: 'I dati già sincronizzati restano su Supabase. Le modifiche fatte da questo dispositivo dopo la disconnessione non verranno più inviate finché non accedi di nuovo.',
      testoConferma: 'Disconnetti'
    });
    if (!ok) return;
    await esci();
  });

  if (stato.conflitti > 0) renderConflitti(container);
}

async function renderConflitti(container) {
  const zona = container.querySelector('#zona-conflitti-sync');
  if (!zona) return;
  const conflitti = await elencoConflitti();
  if (conflitti.length === 0) { zona.innerHTML = ''; return; }

  zona.innerHTML = `
    <div class="form-scheda" style="margin-top:12px;">
      <h4>Conflitti da risolvere</h4>
      <p class="nota">
        Questi record sono stati modificati sia su questo dispositivo sia altrove prima di poter
        sincronizzare: scegli quale versione tenere. Nessuna sovrascrittura automatica.
      </p>
      <table class="tabella">
        <thead><tr><th>Store</th><th>Record</th><th></th></tr></thead>
        <tbody>
          ${conflitti.map((c) => `
            <tr>
              <td>${c.store}</td>
              <td><code>${c.recordId}</code></td>
              <td>
                <div class="azioni-riga">
                  <button data-risolvi="${c.chiave}" data-scelta="locale">Tieni la mia versione</button>
                  <button data-risolvi="${c.chiave}" data-scelta="remoto">Tieni la versione remota</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  zona.querySelectorAll('button[data-risolvi]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await risolviConflitto(btn.dataset.risolvi, btn.dataset.scelta);
        renderConflitti(container);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderLogin(container) {
  container.innerHTML = `
    <section class="pannello">
      <h3>Sync Cloud</h3>
      <p class="nota">
        Accedi con il tuo account per sincronizzare questo Profilo su più dispositivi. I dati
        restano privati: solo tu, autenticato con questo account, puoi leggerli o scriverli.
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
