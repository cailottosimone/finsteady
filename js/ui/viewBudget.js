import { elencoBudget, creaBudget, aggiornaBudget, eliminaBudget, elencoCicliPerBudget } from '../domain/budget.js';
import { elencoBudgetIdsCollegati } from '../domain/piano.js';
import { elencoConti } from '../domain/conti.js';
import { elencoCategorie } from '../domain/categorie.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';
import { apriModaleVista, chiudiModaleVista } from '../components/modaleVista.js';

let budgetInModifica = null;
const stato = { ordineChiave: 'nome', ordineDecrescente: false, ricerca: '' };

const CHIAVI_ORDINAMENTO = {
  nome: (b) => b.nome,
  contoNome: (b) => b._contoNome || '',
  categoriaNome: (b) => b._categoriaNome || '',
  importoAssegnatoDefault: (b) => b.importoAssegnatoDefault
};

export async function renderBudget(container) {
  const [budget, conti, categorie, budgetIdsCollegati] = await Promise.all([
    elencoBudget(), elencoConti(), elencoCategorie('budget'), elencoBudgetIdsCollegati()
  ]);
  budget.forEach((b) => {
    b._contoNome = conti.find((c) => c.id === b.contoId)?.nome || '';
    b._categoriaNome = categorie.find((c) => c.id === b.categoriaId)?.nome || '';
  });

  container.innerHTML = `
    <section class="pannello">
      <h2>Budget</h2>
      <p class="nota">
        Il Budget rappresenta la disponibilità operativa del ciclo corrente. Non ha un target,
        non è patrimonio: si consuma. La gestione del ciclo (assegnato/utilizzato/residuo)
        sarà disponibile dalla Fase 2 in poi. Qui definisci solo i Budget "modello".
      </p>
      <div class="barra-ricerca">
        <input type="text" id="ricerca-budget" placeholder="Cerca per nome, Conto o Categoria..." value="${stato.ricerca}">
      </div>
      <div id="lista-budget"></div>
      <div class="azioni-riga">
        <button id="btn-nuovo-budget" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuovo Budget</button>
        <button id="btn-vai-mese"><i class="fa-solid fa-calendar-days"></i> Mese (Ciclo Budget)</button>
      </div>
      <div id="form-budget-container"></div>
    </section>
  `;

  container.querySelector('#ricerca-budget').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, budget, conti, categorie, budgetIdsCollegati);
  });

  renderTabella(container, budget, conti, categorie, budgetIdsCollegati);

  container.querySelector('#btn-nuovo-budget').addEventListener('click', () => {
    budgetInModifica = null;
    mostraForm(container, conti, categorie);
  });

  container.querySelector('#btn-vai-mese').addEventListener('click', () => {
    window.mostraVista('cicloBudget');
  });
}

function renderTabella(container, budgetCompleto, conti, categorie, budgetIdsCollegati) {
  const lista = container.querySelector('#lista-budget');

  let budget = filtraTesto(budgetCompleto, stato.ricerca, (b) => `${b.nome} ${b._contoNome} ${b._categoriaNome}`);
  budget = ordina(budget, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.nome, stato.ordineDecrescente);

  lista.innerHTML = budget.length === 0
    ? '<p class="nota">Nessun Budget trovato.</p>'
    : `<table class="tabella">
        <thead><tr>
          ${intestazioneOrdinabile('Nome', 'nome', stato)}
          <th></th>
          ${intestazioneOrdinabile('Conto', 'contoNome', stato)}
          ${intestazioneOrdinabile('Categoria', 'categoriaNome', stato)}
          ${intestazioneOrdinabile('Importo default', 'importoAssegnatoDefault', stato)}
          <th></th>
        </tr></thead>
        <tbody>
          ${budget.map((b) => {
            const collegato = budgetIdsCollegati.has(b.id);
            const attivo = !b.stato || b.stato === 'attivo';
            let badge;
            if (!collegato) badge = '<span class="badge" style="background:#fff; border:1px dashed var(--colore-bordo-forte);">Scollegato</span>';
            else if (attivo) badge = '<span class="badge badge-ok">Attivo</span>';
            else badge = '<span class="badge" style="background:#eee;">Inattivo</span>';
            return `
            <tr>
              <td>${b.nome}</td>
              <td>${badge}</td>
              <td>${b._contoNome || '-'}</td>
              <td>${b._categoriaNome || '-'}</td>
              <td class="numero">${formattaValuta(b.importoAssegnatoDefault)}</td>
              <td>
                <div class="azioni-riga">
                  <button class="btn-icona" title="Modifica" data-azione="modifica" data-id="${b.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${b.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>`;

  collegaOrdinamento(lista, stato, () => renderTabella(container, budgetCompleto, conti, categorie, budgetIdsCollegati));

  lista.querySelectorAll('button[data-azione="modifica"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      budgetInModifica = budgetCompleto.find((b) => b.id === btn.dataset.id);
      mostraForm(container, conti, categorie);
    });
  });

  lista.querySelectorAll('button[data-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cicli = await elencoCicliPerBudget(btn.dataset.id);
      if (cicli.length > 0) {
        const aperti = cicli.filter((c) => c.stato === 'aperto').length;
        const chiusi = cicli.length - aperti;
        const primaConferma = await mostraConferma({
          titolo: 'Eliminare il Budget?',
          messaggio: `Questo Budget ha ${cicli.length} Cicli storici collegati (Mese): ${aperti} aperto/i, ${chiusi} chiuso/i. ` +
            'Eliminando il Budget, anche i suoi Cicli verranno eliminati definitivamente. ' +
            'Gli eventuali Trasferimenti già avvenuti (avanzo/sforamento) resteranno nel Registro Movimenti come storico, ' +
            'mostrando "Budget eliminato" come riferimento. Procedere comunque?',
          testoConferma: 'Procedi comunque',
          pericoloso: true
        });
        if (!primaConferma) return;
        const secondaConferma = await mostraConferma({
          titolo: 'Confermi ancora una volta?',
          messaggio: 'Questa azione non può essere annullata. Procedere?',
          testoConferma: 'Sì, elimina definitivamente',
          pericoloso: true
        });
        if (!secondaConferma) return;
      } else {
        const ok = await mostraConferma({
          titolo: 'Eliminare il Budget?',
          messaggio: 'Eliminare definitivamente questo Budget?',
          testoConferma: 'Elimina Budget',
          pericoloso: true
        });
        if (!ok) return;
      }
      try {
        await eliminaBudget(btn.dataset.id);
        renderBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function mostraForm(container, conti, categorie) {
  const b = budgetInModifica || {};

  apriModaleVista({
    titolo: budgetInModifica ? 'Modifica Budget' : 'Nuovo Budget',
    render: (formContainer) => { formContainer.innerHTML = `
    <form id="form-budget" class="form-scheda">
      <label>Nome *<input name="nome" required value="${b.nome || ''}"></label>
      <label>Conto di appartenenza *
        <select name="contoId" required>
          <option value="">-- seleziona --</option>
          ${conti.map((c) => `<option value="${c.id}" ${b.contoId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <label>Categoria (opzionale)
        <select name="categoriaId">
          <option value="">-- nessuna --</option>
          ${categorie.map((c) => `<option value="${c.id}" ${b.categoriaId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <label>Importo assegnato di default *<input name="importoAssegnatoDefault" type="number" step="any" required value="${b.importoAssegnatoDefault ?? 0}"></label>
      <label class="riga-checkbox">
        <input type="checkbox" name="inclusoProspettiDefault" ${b.inclusoProspettiDefault !== false ? 'checked' : ''}>
        Incluso di default nei Prospetti
      </label>
      <p class="nota-inline">
        Attivo/Inattivo è gestito dal Piano attivo (Strategia & Report → Piano): collega questo
        Budget a una Voce del Piano che vuoi attivo.
      </p>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva</button>
        <button type="button" id="btn-annulla-budget">Annulla</button>
      </div>
    </form>
  `;

  formContainer.querySelector('#btn-annulla-budget').addEventListener('click', () => {
    budgetInModifica = null;
    chiudiModaleVista();
  });

  formContainer.querySelector('#form-budget').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    dati.inclusoProspettiDefault = e.target.inclusoProspettiDefault.checked;
    dati.categoriaId = dati.categoriaId || null;
    try {
      if (budgetInModifica) {
        await aggiornaBudget(budgetInModifica.id, dati);
      } else {
        await creaBudget(dati);
      }
      budgetInModifica = null;
      chiudiModaleVista();
      renderBudget(container);
    } catch (err) {
      alert(err.message);
    }
  }); }
  });
}
