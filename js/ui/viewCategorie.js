import { elencoCategorie, creaCategoria, aggiornaCategoria, eliminaCategoria } from '../domain/categorie.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';

let categoriaInModifica = null;
const statoObiettivo = { ordineChiave: 'ordinamento', ordineDecrescente: false, ricerca: '' };
const statoBudget = { ordineChiave: 'ordinamento', ordineDecrescente: false, ricerca: '' };

const CHIAVI_ORDINAMENTO = {
  nome: (c) => c.nome,
  ordinamento: (c) => c.ordinamento ?? 0
};

export async function renderCategorie(container) {
  const [categorieObiettivo, categorieBudget] = await Promise.all([
    elencoCategorie('obiettivo'), elencoCategorie('budget')
  ]);

  container.innerHTML = `
    <section class="pannello">
      <h2>Categorie</h2>
      <p class="nota">
        Le Categorie sono solo raggruppamento: non influenzano alcun calcolo. Appartengono agli
        Obiettivi e ai Budget — non ai Fondi, che invece rappresentano l'esercizio finanziario
        (es. "Spese 2027") indipendentemente dall'ambito della vita a cui il denaro è destinato.
      </p>
      <div class="colonne-categorie">
        <div>
          <h3>Categorie Obiettivo</h3>
          <div class="barra-ricerca">
            <input type="text" id="ricerca-cat-obiettivo" placeholder="Cerca per nome..." value="${statoObiettivo.ricerca}">
          </div>
          <div id="lista-cat-obiettivo"></div>
        </div>
        <div>
          <h3>Categorie Budget</h3>
          <div class="barra-ricerca">
            <input type="text" id="ricerca-cat-budget" placeholder="Cerca per nome..." value="${statoBudget.ricerca}">
          </div>
          <div id="lista-cat-budget"></div>
        </div>
      </div>
      <button id="btn-nuova-categoria" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuova Categoria</button>
      <div id="form-categoria-container"></div>
    </section>
  `;

  container.querySelector('#ricerca-cat-obiettivo').addEventListener('input', (e) => {
    statoObiettivo.ricerca = e.target.value;
    renderTabellaCategorie(container.querySelector('#lista-cat-obiettivo'), categorieObiettivo, statoObiettivo, container);
  });
  container.querySelector('#ricerca-cat-budget').addEventListener('input', (e) => {
    statoBudget.ricerca = e.target.value;
    renderTabellaCategorie(container.querySelector('#lista-cat-budget'), categorieBudget, statoBudget, container);
  });

  renderTabellaCategorie(container.querySelector('#lista-cat-obiettivo'), categorieObiettivo, statoObiettivo, container);
  renderTabellaCategorie(container.querySelector('#lista-cat-budget'), categorieBudget, statoBudget, container);

  container.querySelector('#btn-nuova-categoria').addEventListener('click', () => {
    categoriaInModifica = null;
    mostraForm(container);
  });
}

function renderTabellaCategorie(el, categorieComplete, stato, container) {
  let categorie = filtraTesto(categorieComplete, stato.ricerca, (c) => c.nome);
  categorie = ordina(categorie, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.ordinamento, stato.ordineDecrescente);

  el.innerHTML = categorie.length === 0
    ? '<p class="nota">Nessuna Categoria trovata.</p>'
    : `<table class="tabella">
        <thead><tr>
          ${intestazioneOrdinabile('Nome', 'nome', stato)}
          ${intestazioneOrdinabile('Ordinamento', 'ordinamento', stato)}
          <th></th>
        </tr></thead>
        <tbody>
          ${categorie.map((c) => `
            <tr>
              <td>${c.nome}</td>
              <td class="numero">${c.ordinamento ?? 0}</td>
              <td>
                <div class="azioni-riga">
                  <button class="btn-icona" title="Modifica" data-azione="modifica" data-id="${c.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  collegaOrdinamento(el, stato, () => renderTabellaCategorie(el, categorieComplete, stato, container));

  el.querySelectorAll('button[data-azione="modifica"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoriaInModifica = categorieComplete.find((c) => c.id === btn.dataset.id);
      mostraForm(container);
    });
  });

  el.querySelectorAll('button[data-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Eliminare la Categoria?',
        messaggio: 'Eliminare questa Categoria?',
        testoConferma: 'Elimina Categoria',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await eliminaCategoria(btn.dataset.id);
        renderCategorie(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function mostraForm(container) {
  const formContainer = container.querySelector('#form-categoria-container');
  const c = categoriaInModifica || {};

  formContainer.innerHTML = `
    <form id="form-categoria" class="form-scheda">
      <h3>${categoriaInModifica ? 'Modifica Categoria' : 'Nuova Categoria'}</h3>
      <label>Nome *<input name="nome" required value="${c.nome || ''}"></label>
      <label>Ambito *
        <select name="ambito" required ${categoriaInModifica ? 'disabled' : ''}>
          <option value="obiettivo" ${c.ambito === 'obiettivo' ? 'selected' : ''}>Obiettivo</option>
          <option value="budget" ${c.ambito === 'budget' ? 'selected' : ''}>Budget</option>
        </select>
      </label>
      <label>Ordinamento<input name="ordinamento" type="number" value="${c.ordinamento ?? 0}"></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva</button>
        <button type="button" id="btn-annulla-categoria">Annulla</button>
      </div>
    </form>
  `;

  container.querySelector('#btn-annulla-categoria').addEventListener('click', () => {
    categoriaInModifica = null;
    formContainer.innerHTML = '';
  });

  container.querySelector('#form-categoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    if (categoriaInModifica) dati.ambito = categoriaInModifica.ambito;
    try {
      if (categoriaInModifica) {
        await aggiornaCategoria(categoriaInModifica.id, dati);
      } else {
        await creaCategoria(dati);
      }
      categoriaInModifica = null;
      renderCategorie(container);
    } catch (err) {
      alert(err.message);
    }
  });
}
