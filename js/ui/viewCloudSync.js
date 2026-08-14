// Vista Cloud Sync — tab dedicata in Impostazioni. Login Supabase, stato/collegamento del
// Profilo ATTIVO, e lista dei Profili disponibili sul cloud da scaricare come nuovo Profilo
// locale. Una volta collegato, il Profilo attivo si sincronizza da solo in background (vedi
// js/data/syncProfilo.js): questa vista non ha un pulsante "sincronizza ora", solo il
// collegamento iniziale e lo stato.

import { getCurrentUser, onAuthChange, signIn, signUp, signOut } from '../data/auth.js';
import {
  state as syncState, onSyncStateChange, ilProfiloAttivoDeveEssereCollegato,
  collegaSpingendoLocale, collegaScaricandoDaCloud
} from '../data/syncProfilo.js';
import { elencoProfiliCloudPerScaricare, scaricaProfiloComeNuovo } from '../domain/cloudProfili.js';
import { ottieniProfiloAttivo } from '../profili.js';
import { formattaDataOra } from '../utils/dateUtils.js';
import { mostraConferma, mostraPrompt } from '../utils/dialogUtils.js';

const STATO_LABEL = {
  offline: 'Offline',
  disconnesso: 'Non collegato',
  da_collegare: 'Profilo da collegare',
  syncing: 'Sincronizzazione in corso…',
  idle: 'Sincronizzato',
  errore: 'Errore di sincronizzazione'
};

let annullaListenerAuth = null;
let annullaListenerSync = null;

export async function renderCloudSync(container) {
  if (annullaListenerAuth) annullaListenerAuth();
  if (annullaListenerSync) annullaListenerSync();

  const utente = getCurrentUser();

  container.innerHTML = `
    <section class="pannello">
      <h2>Cloud Sync</h2>
      <p class="nota">
        Sincronizza il Profilo attivo su più dispositivi tramite un account cloud personale
        (Supabase). Ogni Profilo va collegato una volta sola: da quel momento si sincronizza da
        solo in background finché resta il Profilo attivo. Funzione facoltativa: senza account
        collegato l'app funziona esattamente come prima, solo in locale.
      </p>
      <div id="cloud-sync-corpo"></div>
    </section>
  `;

  const corpo = container.querySelector('#cloud-sync-corpo');

  if (!utente) {
    renderLogin(corpo);
  } else {
    await renderAreaCollegata(corpo, utente);
  }

  annullaListenerAuth = onAuthChange(() => renderCloudSync(container));
  annullaListenerSync = onSyncStateChange(() => {
    // Riflette lo stato (badge testuale) senza ricostruire tutta la vista, per non perdere
    // l'eventuale form di login/collegamento aperto.
    const badge = container.querySelector('#cloud-sync-stato-badge');
    if (badge) {
      badge.textContent = STATO_LABEL[syncState.status] || syncState.status;
      badge.className = `badge ${syncState.status === 'idle' ? 'badge-ok' : (syncState.status === 'errore' ? 'badge-errore' : '')}`;
    }
  });
}

function renderLogin(corpo) {
  corpo.innerHTML = `
    <form id="form-login-cloud" class="form-scheda">
      <h4>Accedi</h4>
      <label>Email *<input name="email" type="email" required></label>
      <label>Password *<input name="password" type="password" required minlength="6"></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Accedi</button>
        <button type="button" id="btn-registrati-cloud">Crea account</button>
      </div>
      <p class="nota" id="cloud-login-errore"></p>
    </form>
  `;

  const form = corpo.querySelector('#form-login-cloud');
  const errore = corpo.querySelector('#cloud-login-errore');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(form).entries());
    try {
      await signIn(dati.email, dati.password);
    } catch (err) {
      errore.textContent = err.message;
    }
  });

  corpo.querySelector('#btn-registrati-cloud').addEventListener('click', async () => {
    const dati = Object.fromEntries(new FormData(form).entries());
    if (!dati.email || !dati.password) {
      errore.textContent = 'Compila email e password prima di creare l\'account.';
      return;
    }
    try {
      await signUp(dati.email, dati.password);
      errore.textContent = 'Account creato. Se richiesta, controlla la posta per confermare, poi accedi.';
    } catch (err) {
      errore.textContent = err.message;
    }
  });
}

async function renderAreaCollegata(corpo, utente) {
  const profiloAttivo = await ottieniProfiloAttivo();
  const daCollegare = await ilProfiloAttivoDeveEssereCollegato();

  corpo.innerHTML = `
    <div class="azioni-riga" style="justify-content: space-between; align-items:center;">
      <div>Collegato come <strong>${utente.email}</strong></div>
      <button id="btn-logout-cloud" class="link-testuale">Disconnetti account</button>
    </div>

    <div class="form-scheda" style="margin-top:16px;">
      <h4>Profilo attivo: ${profiloAttivo.nome}</h4>
      <p class="nota">Stato: <span id="cloud-sync-stato-badge" class="badge">${STATO_LABEL[syncState.status] || syncState.status}</span></p>
      <div id="cloud-collegamento-profilo"></div>
    </div>

    <div class="form-scheda" style="margin-top:16px;">
      <h4>Profili disponibili sul cloud</h4>
      <p class="nota">Profili collegati con questo account da un altro dispositivo, non ancora presenti su questo. Scaricane uno per crearlo qui come nuovo Profilo.</p>
      <div id="cloud-profili-disponibili"><p class="nota">Caricamento…</p></div>
    </div>
  `;

  corpo.querySelector('#btn-logout-cloud').addEventListener('click', async () => {
    const ok = await mostraConferma({
      titolo: 'Disconnettere l\'account cloud?',
      messaggio: 'Il Profilo attivo smetterà di sincronizzarsi finché non accedi di nuovo. I dati già presenti in locale restano intatti.',
      testoConferma: 'Disconnetti'
    });
    if (!ok) return;
    await signOut();
  });

  const zonaCollegamento = corpo.querySelector('#cloud-collegamento-profilo');
  if (daCollegare) {
    zonaCollegamento.innerHTML = `
      <p class="nota">Questo Profilo non è ancora collegato al cloud. Scegli come procedere:</p>
      <div class="azioni-riga">
        <button id="btn-collega-push" class="btn-primario">Carica questo Profilo sul cloud (per la prima volta)</button>
      </div>
    `;
    zonaCollegamento.querySelector('#btn-collega-push').addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Caricare il Profilo sul cloud?',
        messaggio: `Tutti i dati di "${profiloAttivo.nome}" verranno caricati sul cloud e da quel momento sincronizzati automaticamente su ogni dispositivo collegato con lo stesso account.`,
        testoConferma: 'Carica sul cloud'
      });
      if (!ok) return;
      try {
        await collegaSpingendoLocale();
        await renderAreaCollegata(corpo, utente);
      } catch (err) {
        alert(err.message);
      }
    });
  } else {
    zonaCollegamento.innerHTML = `<p class="nota">Profilo collegato al cloud. La sincronizzazione avviene automaticamente in background.</p>`;
  }

  const zonaDisponibili = corpo.querySelector('#cloud-profili-disponibili');
  try {
    const profiliCloud = await elencoProfiliCloudPerScaricare();
    if (!profiliCloud || profiliCloud.length === 0) {
      zonaDisponibili.innerHTML = '<p class="nota">Nessun Profilo cloud disponibile.</p>';
    } else {
      zonaDisponibili.innerHTML = `
        <div class="lista-azioni-elenco">
          ${profiliCloud.map((p) => `
            <div class="riga-elenco-azioni">
              <div class="riga-elenco-azioni-testata">
                <span class="riga-elenco-azioni-titolo">${p.nome}</span>
              </div>
              <div class="riga-elenco-azioni-meta">
                <span>Aggiornato ${formattaDataOra(p.updatedAt)}</span>
                <span>· ${p.numeroRecord ?? '-'} record</span>
              </div>
              <div class="riga-elenco-azioni-azioni">
                <button data-azione="scarica-profilo-cloud" data-cloud-id="${p.cloudId}" data-nome="${p.nome}">Scarica come nuovo Profilo</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      zonaDisponibili.querySelectorAll('button[data-azione="scarica-profilo-cloud"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const nomeSuggerito = await mostraPrompt({
            titolo: 'Nome del nuovo Profilo',
            messaggio: `Verrà creato un nuovo Profilo locale con i dati di "${btn.dataset.nome}".`,
            valoreIniziale: btn.dataset.nome
          });
          if (!nomeSuggerito) return;
          try {
            await scaricaProfiloComeNuovo(btn.dataset.cloudId, nomeSuggerito);
            alert('Profilo scaricato. Vai su Profili per passare al nuovo Profilo.');
            window.mostraVista('profili');
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }
  } catch (err) {
    zonaDisponibili.innerHTML = `<p class="nota">${err.message}</p>`;
  }
}
