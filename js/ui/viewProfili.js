import {
  elencoProfili, ottieniProfiloAttivo, creaProfilo, rinominaProfilo, eliminaProfilo,
  impostaProfiloAttivo
} from '../profili.js';
import { formattaData } from '../utils/dateUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';
import { htmlAvatar } from '../utils/avatarUtils.js';
import {
  esportaProfiloSingolo, esportaTuttiIProfili, analizzaPacchettoImport, importaPacchetto
} from '../domain/backupProfili.js';
import { formattaDataOra } from '../utils/dateUtils.js';

let mostraFormNuovo = false;
let profiloInRinomina = null;
let pacchettoImportCorrente = null; // file JSON già parsato, in attesa di conferma
let anteprimaImportCorrente = null; // risultato di analizzaPacchettoImport, con 'azione' aggiunta dall'utente

export async function renderProfili(container) {
  const [profili, attivo] = await Promise.all([elencoProfili(), ottieniProfiloAttivo()]);

  container.innerHTML = `
    <section class="pannello">
      <h2>Profili</h2>
      <p class="nota">
        Ogni Profilo è completamente separato dagli altri: dati, Conti, Fondi, tutto — nessuna
        interazione possibile tra un Profilo e l'altro, nemmeno per errore. Utile per gestire
        persone diverse, o per ricominciare da capo senza perdere quanto già fatto. Cambiare
        Profilo ricarica la pagina.
      </p>
      <div id="lista-profili"></div>
      <button id="btn-nuovo-profilo" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuovo Profilo</button>
      <div id="form-profilo-container"></div>
    </section>

    <section class="pannello">
      <h2>Backup Profili</h2>
      <p class="nota">
        Esporta un singolo Profilo (per portarlo su un altro dispositivo, o come base per un
        Profilo nuovo) oppure tutti i Profili insieme (backup totale/migrazione dispositivo).
        Importando un file, potrai scegliere per ciascun Profilo se sostituire i dati di un
        Profilo esistente o importarlo come Profilo separato — nessuna sovrascrittura senza
        conferma esplicita.
      </p>
      <div class="azioni-riga">
        <button id="btn-esporta-profilo-attivo">Esporta Profilo attivo (${attivo.nome})</button>
        <button id="btn-esporta-tutti-profili">Esporta tutti i Profili</button>
        <button id="btn-importa-profili">Importa da file</button>
      </div>
      <input type="file" id="input-importa-profili" accept=".json" style="display:none;">
      <div id="anteprima-import-profili"></div>
    </section>
  `;

  const lista = container.querySelector('#lista-profili');
  lista.innerHTML = `
    <table class="tabella">
      <thead><tr><th>Nome</th><th>Creato il</th><th></th><th></th></tr></thead>
      <tbody>
        ${profili.map((p) => renderRigaProfilo(p, p.id === attivo.id)).join('')}
      </tbody>
    </table>
  `;

  lista.querySelectorAll('button[data-azione="attiva"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Cambiare Profilo?',
        messaggio: `Passare al Profilo "${btn.dataset.nome}"? La pagina verrà ricaricata.`,
        testoConferma: 'Passa al Profilo'
      });
      if (!ok) return;
      await impostaProfiloAttivo(btn.dataset.id);
      window.location.reload();
    });
  });

  lista.querySelectorAll('button[data-azione="rinomina"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      profiloInRinomina = btn.dataset.id;
      renderProfili(container);
    });
  });

  lista.querySelectorAll('button[data-azione="salva-rinomina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const input = lista.querySelector(`input[data-rinomina-id="${btn.dataset.id}"]`);
      try {
        await rinominaProfilo(btn.dataset.id, input.value);
        profiloInRinomina = null;
        renderProfili(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  lista.querySelectorAll('button[data-azione="annulla-rinomina"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      profiloInRinomina = null;
      renderProfili(container);
    });
  });

  lista.querySelectorAll('button[data-azione="elimina-profilo"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const primaConferma = await mostraConferma({
        titolo: 'Eliminare il Profilo?',
        messaggio: `Eliminare DEFINITIVAMENTE il Profilo "${btn.dataset.nome}" e tutti i suoi dati? Azione irreversibile.`,
        testoConferma: 'Elimina Profilo',
        pericoloso: true
      });
      if (!primaConferma) return;
      const secondaConferma = await mostraConferma({
        titolo: 'Confermi ancora una volta?',
        messaggio: 'Tutti i dati di questo Profilo (Conti, Fondi, Budget, movimenti, tutto) verranno cancellati per sempre. Procedere?',
        testoConferma: 'Sì, elimina definitivamente',
        pericoloso: true
      });
      if (!secondaConferma) return;
      try {
        await eliminaProfilo(btn.dataset.id);
        renderProfili(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelector('#btn-nuovo-profilo').addEventListener('click', () => {
    mostraFormNuovo = !mostraFormNuovo;
    if (mostraFormNuovo) mostraFormNuovoProfilo(container);
    else container.querySelector('#form-profilo-container').innerHTML = '';
  });
  if (mostraFormNuovo) mostraFormNuovoProfilo(container);

  collegaBackupProfili(container, attivo);
  if (pacchettoImportCorrente) renderAnteprimaImport(container);
}

function scaricaJson(pacchetto, nomeFile) {
  const blob = new Blob([JSON.stringify(pacchetto, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.click();
  URL.revokeObjectURL(url);
}

function collegaBackupProfili(container, attivo) {
  container.querySelector('#btn-esporta-profilo-attivo').addEventListener('click', async () => {
    try {
      const pacchetto = await esportaProfiloSingolo(attivo.id);
      const dataFile = new Date().toISOString().substring(0, 10);
      scaricaJson(pacchetto, `financial-planner-profilo-${attivo.nome}-${dataFile}.json`);
    } catch (err) {
      alert(err.message);
    }
  });

  container.querySelector('#btn-esporta-tutti-profili').addEventListener('click', async () => {
    try {
      const pacchetto = await esportaTuttiIProfili();
      const dataFile = new Date().toISOString().substring(0, 10);
      scaricaJson(pacchetto, `financial-planner-tutti-i-profili-${dataFile}.json`);
    } catch (err) {
      alert(err.message);
    }
  });

  const inputFile = container.querySelector('#input-importa-profili');
  container.querySelector('#btn-importa-profili').addEventListener('click', () => {
    inputFile.value = '';
    inputFile.click();
  });
  inputFile.addEventListener('change', async () => {
    const file = inputFile.files[0];
    if (!file) return;
    try {
      const testo = await file.text();
      pacchettoImportCorrente = JSON.parse(testo);
      const anteprima = await analizzaPacchettoImport(pacchettoImportCorrente);
      anteprimaImportCorrente = anteprima.map((voce) => ({
        ...voce,
        azione: voce.esistenteLocale ? 'sostituisci' : 'nuovo' // scelta di default, modificabile
      }));
      renderAnteprimaImport(container);
    } catch (err) {
      pacchettoImportCorrente = null;
      anteprimaImportCorrente = null;
      alert(`Impossibile leggere il file: ${err.message}`);
    }
  });
}

function renderAnteprimaImport(container) {
  const zona = container.querySelector('#anteprima-import-profili');
  if (!zona) return;
  if (!pacchettoImportCorrente || !anteprimaImportCorrente) {
    zona.innerHTML = '';
    return;
  }

  zona.innerHTML = `
    <div class="form-scheda" style="margin-top:12px;">
      <h4>Anteprima importazione</h4>
      <p class="nota">Data esportazione file: ${formattaDataOra(pacchettoImportCorrente.dataEsportazione)}. Scegli cosa fare per ciascun Profilo prima di confermare.</p>
      <table class="tabella">
        <thead><tr><th>Profilo nel file</th><th>Record</th><th>Corrispondenza locale</th><th>Azione</th></tr></thead>
        <tbody>
          ${anteprimaImportCorrente.map((voce) => `
            <tr>
              <td>${voce.nomeFile}</td>
              <td class="numero">${voce.numeroRecord}</td>
              <td>${voce.esistenteLocale
                ? `${voce.esistenteLocale.nome} <span class="nota-inline">(creato il ${formattaData(voce.esistenteLocale.dataCreazione)})</span>`
                : '<span class="nota-inline">— nessuna, sarà un Profilo nuovo</span>'}</td>
              <td>
                <select data-azione-import="${voce.indice}">
                  ${voce.esistenteLocale ? `<option value="sostituisci" ${voce.azione === 'sostituisci' ? 'selected' : ''}>Sostituisci "${voce.esistenteLocale.nome}"</option>` : ''}
                  <option value="nuovo" ${voce.azione === 'nuovo' ? 'selected' : ''}>Importa come Profilo nuovo</option>
                  <option value="salta" ${voce.azione === 'salta' ? 'selected' : ''}>Salta (non importare)</option>
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="form-azioni">
        <button id="btn-conferma-import-profili" class="btn-primario">Conferma importazione</button>
        <button id="btn-annulla-import-profili">Annulla</button>
      </div>
    </div>
  `;

  zona.querySelectorAll('select[data-azione-import]').forEach((select) => {
    select.addEventListener('change', () => {
      const voce = anteprimaImportCorrente.find((v) => String(v.indice) === select.dataset.azioneImport);
      if (voce) voce.azione = select.value;
    });
  });

  zona.querySelector('#btn-annulla-import-profili').addEventListener('click', () => {
    pacchettoImportCorrente = null;
    anteprimaImportCorrente = null;
    renderAnteprimaImport(container);
  });

  zona.querySelector('#btn-conferma-import-profili').addEventListener('click', async () => {
    const daSostituire = anteprimaImportCorrente.filter((v) => v.azione === 'sostituisci');
    const messaggioSostituzioni = daSostituire.length > 0
      ? `\n\nVerranno sostituiti interamente i dati di: ${daSostituire.map((v) => v.esistenteLocale.nome).join(', ')}.`
      : '';
    const ok = await mostraConferma({
      titolo: 'Confermare l\'importazione?',
      messaggio: `Procedere con l'importazione secondo le azioni scelte?${messaggioSostituzioni} Operazione irreversibile per i dati sostituiti.`,
      testoConferma: 'Importa',
      pericoloso: daSostituire.length > 0
    });
    if (!ok) return;
    try {
      await importaPacchetto(pacchettoImportCorrente, anteprimaImportCorrente);
      pacchettoImportCorrente = null;
      anteprimaImportCorrente = null;
      alert('Importazione completata. La pagina verrà ricaricata.');
      window.location.reload();
    } catch (err) {
      alert(`Importazione fallita: ${err.message}`);
    }
  });
}

function renderRigaProfilo(p, attivo) {
  const inRinomina = profiloInRinomina === p.id;
  if (inRinomina) {
    return `
      <tr>
        <td colspan="2"><input type="text" data-rinomina-id="${p.id}" value="${p.nome}"></td>
        <td colspan="2">
          <div class="azioni-riga">
            <button class="btn-icona" title="Salva" data-azione="salva-rinomina" data-id="${p.id}"><i class="fa-solid fa-check"></i></button>
            <button class="btn-icona" title="Annulla" data-azione="annulla-rinomina" data-id="${p.id}"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </td>
      </tr>
    `;
  }
  return `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          ${htmlAvatar(p.nome, 32)}
          ${p.nome}${attivo ? ' <span class="badge badge-ok">Attivo</span>' : ''}
        </div>
      </td>
      <td>${formattaData(p.dataCreazione)}</td>
      <td>${attivo ? '' : `<button data-azione="attiva" data-id="${p.id}" data-nome="${p.nome}">Passa a questo Profilo</button>`}</td>
      <td>
        <div class="azioni-riga">
          <button class="btn-icona" title="Rinomina" data-azione="rinomina" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
          ${attivo ? '' : `<button class="btn-icona" title="Elimina" data-azione="elimina-profilo" data-id="${p.id}" data-nome="${p.nome}"><i class="fa-solid fa-trash"></i></button>`}
        </div>
      </td>
    </tr>
  `;
}

function mostraFormNuovoProfilo(container) {
  const formContainer = container.querySelector('#form-profilo-container');
  formContainer.innerHTML = `
    <form id="form-profilo" class="form-scheda">
      <h4>Nuovo Profilo</h4>
      <p class="nota">Partirà completamente da zero, scollegato da questo e da ogni altro Profilo.</p>
      <label>Nome *<input name="nome" required placeholder="es. Nome della persona, o un nuovo inizio"></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Crea e passa al nuovo Profilo</button>
        <button type="button" id="btn-annulla-profilo">Annulla</button>
      </div>
    </form>
  `;

  formContainer.querySelector('#btn-annulla-profilo').addEventListener('click', () => {
    mostraFormNuovo = false;
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('#form-profilo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    try {
      const nuovo = await creaProfilo(dati.nome);
      await impostaProfiloAttivo(nuovo.id);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  });
}
