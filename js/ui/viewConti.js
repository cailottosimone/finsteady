import { elencoConti, creaConto, aggiornaConto, eliminaConto } from '../domain/conti.js';
import { elencoFondiPerConto } from '../domain/fondi.js';
import { elencoBudgetPerConto } from '../domain/budget.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { ordina, filtraTesto, barraOrdinamentoHtml, collegaBarraOrdinamento } from '../utils/listaUtils.js';
import { renderBarraTab } from '../utils/tabsUtils.js';
import { renderFondi } from './viewFondi.js';
import { renderBudget } from './viewBudget.js';
import { mostraConferma } from '../utils/dialogUtils.js';
import { apriModaleVista, chiudiModaleVista } from '../components/modaleVista.js';

let contoInModifica = null;
let tabFondiBudgetAttiva = 'fondi';
const stato = { ordineChiave: 'nome', ordineDecrescente: false, ricerca: '' };

const CHIAVI_ORDINAMENTO = {
  nome: (c) => c.nome,
  istituto: (c) => c.istituto || '',
  saldoReale: (c) => c.saldoReale,
  stato: (c) => c.stato
};

export async function renderConti(container) {
  const conti = await elencoConti();

  container.innerHTML = `
    <section class="pannello">
      <h2>Conti</h2>
      <p class="nota">Il Conto rappresenta dove si trova realmente il denaro (conto corrente, carta, deposito...).</p>
      <div class="barra-ricerca">
        <input type="text" id="ricerca-conti" placeholder="Cerca per nome o istituto..." value="${stato.ricerca}">
      </div>
      <div id="lista-conti"></div>
      <button id="btn-nuovo-conto" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuovo Conto</button>
    </section>

    <div class="sotto-sezione">
      <div id="tab-fondi-budget"></div>
    </div>
  `;

  container.querySelector('#ricerca-conti').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, conti);
  });

  renderTabella(container, conti);

  container.querySelector('#btn-nuovo-conto').addEventListener('click', () => {
    contoInModifica = null;
    apriFormConto(container);
  });

  renderBarraTab(container.querySelector('#tab-fondi-budget'), {
    idBase: 'conti-fondi-budget',
    tabs: [
      { chiave: 'fondi', etichetta: 'Fondi' },
      { chiave: 'budget', etichetta: 'Budget' }
    ],
    chiaveAttiva: tabFondiBudgetAttiva,
    onCambio: (chiave, pannello) => {
      tabFondiBudgetAttiva = chiave;
      if (chiave === 'fondi') renderFondi(pannello);
      else renderBudget(pannello);
    }
  });
}

function renderTabella(container, contiCompleti) {
  const lista = container.querySelector('#lista-conti');

  let conti = filtraTesto(contiCompleti, stato.ricerca, (c) => `${c.nome} ${c.istituto || ''}`);
  conti = ordina(conti, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.nome, stato.ordineDecrescente);

  lista.innerHTML = conti.length === 0
    ? '<p class="nota">Nessun Conto trovato.</p>'
    : barraOrdinamentoHtml([
        { chiave: 'nome', etichetta: 'Nome' },
        { chiave: 'istituto', etichetta: 'Istituto' },
        { chiave: 'saldoReale', etichetta: 'Saldo' },
        { chiave: 'stato', etichetta: 'Stato' }
      ], stato, 'conti') + `
      <div class="lista-metriche">
        ${conti.map((c) => `
          <div class="riga-metrica">
            <span class="riga-metrica-nome">${c.nome}<span class="badge">${c.stato}</span></span>
            <div class="riga-metrica-valori">
              ${c.istituto ? `<span class="riga-metrica-valore"><span class="etichetta">Istituto</span><span class="numero" style="font-family:var(--font-corpo); font-weight:500;">${c.istituto}</span></span>` : ''}
              <span class="riga-metrica-valore"><span class="etichetta">Saldo</span><span class="numero">${formattaValuta(c.saldoReale, c.valuta)}</span></span>
            </div>
            <div class="riga-metrica-azioni">
              <button class="btn-icona" title="Modifica" data-azione="modifica" data-id="${c.id}"><i class="fa-solid fa-pen"></i></button>
              <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

  collegaBarraOrdinamento(lista, stato, 'conti', () => renderTabella(container, contiCompleti));

  lista.querySelectorAll('button[data-azione="modifica"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      contoInModifica = contiCompleti.find((c) => c.id === btn.dataset.id);
      apriFormConto(container);
    });
  });

  lista.querySelectorAll('button[data-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [fondiCollegati, budgetCollegati] = await Promise.all([
        elencoFondiPerConto(btn.dataset.id),
        elencoBudgetPerConto(btn.dataset.id)
      ]);
      if (fondiCollegati.length > 0 || budgetCollegati.length > 0) {
        alert('Impossibile eliminare: il Conto contiene Fondi o Budget collegati.');
        return;
      }
      const ok = await mostraConferma({
        titolo: 'Eliminare il Conto?',
        messaggio: 'Eliminare definitivamente questo Conto? Verranno eliminati anche eventuali movimenti (Trasferimenti, Rettifiche) che lo referenziano.',
        testoConferma: 'Elimina Conto',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await eliminaConto(btn.dataset.id);
        renderConti(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function apriFormConto(container) {
  const c = contoInModifica || {};

  apriModaleVista({
    titolo: contoInModifica ? 'Modifica Conto' : 'Nuovo Conto',
    render: (corpo) => {
      corpo.innerHTML = `
        <form id="form-conto" class="form-scheda">
          <label>Nome *<input name="nome" required value="${c.nome || ''}"></label>
          <label>Istituto<input name="istituto" value="${c.istituto || ''}"></label>
          <label>Descrizione<input name="descrizione" value="${c.descrizione || ''}"></label>
          <label>Saldo reale *
            <input name="saldoReale" type="number" step="any" required value="${c.saldoReale ?? 0}" ${contoInModifica ? 'disabled' : ''}>
          </label>
          ${contoInModifica ? '<p class="nota">Il saldo non è più modificabile qui: per correggerlo usa una Rettifica dal Registro Movimenti (lascia sempre traccia storica).</p>' : ''}
          <label>Valuta<input name="valuta" value="${c.valuta || 'EUR'}"></label>
          <label>Tipologia
            <select name="tipologia">
              <option value="risparmio" ${c.tipologia === 'spesa' ? '' : 'selected'}>Risparmio</option>
              <option value="spesa" ${c.tipologia === 'spesa' ? 'selected' : ''}>Spesa</option>
            </select>
          </label>
          ${c.tipologia === 'spesa' || !contoInModifica ? '<p class="nota">Un Conto "Spesa" non può avere un saldo diverso da zero.</p>' : ''}
          <label>Ordinamento<input name="ordinamento" type="number" value="${c.ordinamento ?? 0}"></label>
          <label class="riga-checkbox">
            <input type="checkbox" name="inclusoProspettiDefault" ${c.inclusoProspettiDefault !== false ? 'checked' : ''}>
            Incluso di default nei Prospetti
          </label>
          <div class="form-azioni">
            <button type="submit" class="btn-primario">Salva</button>
            <button type="button" id="btn-annulla-conto">Annulla</button>
          </div>
        </form>
      `;

      corpo.querySelector('#btn-annulla-conto').addEventListener('click', () => {
        contoInModifica = null;
        chiudiModaleVista();
      });

      corpo.querySelector('#form-conto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const dati = Object.fromEntries(new FormData(e.target).entries());
        dati.inclusoProspettiDefault = e.target.inclusoProspettiDefault.checked;
        try {
          if (contoInModifica) {
            await aggiornaConto(contoInModifica.id, dati);
          } else {
            await creaConto(dati);
          }
          contoInModifica = null;
          chiudiModaleVista();
          renderConti(container);
        } catch (err) {
          alert(err.message);
        }
      });
    }
  });
}
