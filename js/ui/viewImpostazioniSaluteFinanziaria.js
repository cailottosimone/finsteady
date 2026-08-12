import { calcolaSaluteFinanziaria } from '../domain/saluteFinanziaria.js';
import {
  impostaFondoEmergenza, impostaBudgetBundleAttivo, aggiungiVoceAutonomia, rimuoviVoceAutonomia
} from '../domain/impostazioniSaluteFinanziaria.js';
import { formattaValuta } from '../utils/formatCurrency.js';

let mostraFormAggiungiVoce = false;

export async function renderImpostazioniSaluteFinanziaria(container) {
  const dati = await calcolaSaluteFinanziaria();

  container.innerHTML = `
    <section class="pannello">
      <h3>Fondo Emergenza</h3>
      <label style="max-width:320px;">Fondo designato come Fondo Emergenza
        <select id="select-fondo-emergenza-impostazioni">
          <option value="">— nessuno —</option>
          ${dati.fondiDisponibili.map((f) => `<option value="${f.id}" ${dati.fondoEmergenza?.id === f.id ? 'selected' : ''}>${f.nome}</option>`).join('')}
        </select>
      </label>
      ${dati.fondoEmergenza ? `<p class="nota">${dati.fondoEmergenza.nome}: ${formattaValuta(dati.fondoEmergenza.saldo)}</p>` : ''}

      <h4 style="margin-top:20px;">Composizione spesa mensile stimata</h4>
      <p class="nota">Usata per calcolare i mesi di autonomia (saldo Fondo Emergenza ÷ questa cifra).</p>
      <ul class="elenco-semplice">
        <li>
          <label style="display:flex; align-items:center; gap:8px; margin:0;">
            <input type="checkbox" id="check-budget-bundle" ${dati.budgetBundleAttivo ? 'checked' : ''}>
            Tutti i Budget attivi
          </label>
          <span style="margin-left:auto;">${formattaValuta(dati.vociComposizione.find((v) => v.tipo === 'budgetBundle')?.importo || 0)}</span>
        </li>
        ${dati.vociComposizione.filter((v) => v.tipo !== 'budgetBundle').map((v) => `
          <li>
            <span>${v.etichetta}</span>
            <span style="margin-left:auto;">${formattaValuta(v.importo)}</span>
            <button class="btn-icona" title="Rimuovi voce" data-azione="rimuovi-voce" data-id="${v.id}"><i class="fa-solid fa-trash"></i></button>
          </li>
        `).join('')}
        <li style="font-weight:600; border-bottom:none;">
          <span>Totale</span>
          <span style="margin-left:auto;">${formattaValuta(dati.spesaMensileStimata)}</span>
        </li>
      </ul>
      <button id="btn-aggiungi-voce-autonomia"><i class="fa-solid fa-plus"></i> Aggiungi voce</button>
      <div id="form-voce-autonomia"></div>
    </section>
  `;

  container.querySelector('#select-fondo-emergenza-impostazioni').addEventListener('change', async (e) => {
    await impostaFondoEmergenza(e.target.value || null);
    renderImpostazioniSaluteFinanziaria(container);
  });

  container.querySelector('#check-budget-bundle').addEventListener('change', async (e) => {
    await impostaBudgetBundleAttivo(e.target.checked);
    renderImpostazioniSaluteFinanziaria(container);
  });

  container.querySelectorAll('button[data-azione="rimuovi-voce"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await rimuoviVoceAutonomia(btn.dataset.id);
      renderImpostazioniSaluteFinanziaria(container);
    });
  });

  container.querySelector('#btn-aggiungi-voce-autonomia').addEventListener('click', () => {
    mostraFormAggiungiVoce = !mostraFormAggiungiVoce;
    if (mostraFormAggiungiVoce) mostraFormVoceAutonomia(container, dati);
    else container.querySelector('#form-voce-autonomia').innerHTML = '';
  });
}

function mostraFormVoceAutonomia(container, dati) {
  const formContainer = container.querySelector('#form-voce-autonomia');
  const budgetScelta = dati.budgetDisponibili.filter((b) => !(!b.stato || b.stato === 'attivo'));
  const fondiConObiettivi = dati.fondiDisponibili.filter((f) => dati.obiettiviDisponibili.some((o) => o.fondoId === f.id));

  formContainer.innerHTML = `
    <div class="form-scheda">
      <label>Tipo di voce
        <select id="select-tipo-voce">
          <option value="budgetSingolo">Budget (non incluso nel bundle "tutti i Budget attivi")</option>
          <option value="risparmioAnnuale">Risparmio annuale (obiettivo complessivo Fondo ÷ 12 — solo Fondi con Obiettivi)</option>
          <option value="risparmioMensile">Risparmio mensile (importo a mano, qualsiasi Fondo)</option>
        </select>
      </label>
      <div id="campi-voce-autonomia"></div>
      <div class="form-azioni">
        <button id="btn-conferma-voce-autonomia" class="btn-primario">Aggiungi</button>
      </div>
    </div>
  `;

  const selectTipo = formContainer.querySelector('#select-tipo-voce');
  const campiContainer = formContainer.querySelector('#campi-voce-autonomia');

  function renderCampi() {
    const tipo = selectTipo.value;
    if (tipo === 'budgetSingolo') {
      campiContainer.innerHTML = budgetScelta.length === 0
        ? '<p class="nota">Nessun Budget disponibile (i Budget attivi sono già coperti dal bundle).</p>'
        : `<label>Budget<select id="campo-budget-id">${budgetScelta.map((b) => `<option value="${b.id}">${b.nome}${b.stato === 'inattivo' ? ' (inattivo)' : ''}</option>`).join('')}</select></label>`;
    } else if (tipo === 'risparmioAnnuale') {
      campiContainer.innerHTML = fondiConObiettivi.length === 0
        ? '<p class="nota">Nessun Fondo con Obiettivi disponibile.</p>'
        : `<label>Fondo<select id="campo-fondo-id">${fondiConObiettivi.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('')}</select></label>`;
    } else {
      campiContainer.innerHTML = `
        <label>Fondo<select id="campo-fondo-id">${dati.fondiDisponibili.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('')}</select></label>
        <label>Importo mensile (€)<input type="number" step="any" id="campo-importo"></label>
      `;
    }
  }
  selectTipo.addEventListener('change', renderCampi);
  renderCampi();

  formContainer.querySelector('#btn-conferma-voce-autonomia').addEventListener('click', async () => {
    const tipo = selectTipo.value;
    try {
      if (tipo === 'budgetSingolo') {
        const budgetId = formContainer.querySelector('#campo-budget-id')?.value;
        await aggiungiVoceAutonomia({ tipo, budgetId });
      } else if (tipo === 'risparmioAnnuale') {
        const fondoId = formContainer.querySelector('#campo-fondo-id')?.value;
        await aggiungiVoceAutonomia({ tipo, fondoId });
      } else {
        const fondoId = formContainer.querySelector('#campo-fondo-id')?.value;
        const importo = formContainer.querySelector('#campo-importo')?.value;
        await aggiungiVoceAutonomia({ tipo, fondoId, importo });
      }
      mostraFormAggiungiVoce = false;
      renderImpostazioniSaluteFinanziaria(container);
    } catch (err) {
      alert(err.message);
    }
  });
}
