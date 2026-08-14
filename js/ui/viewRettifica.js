import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { creaRettifica } from '../domain/rettifiche.js';
import { oraLocaleInput } from '../utils/dateUtils.js';

export async function renderRettifica(container) {
  const [conti, fondi, obiettivi] = await Promise.all([
    elencoConti(), (await elencoFondi()).filter((f) => f.stato !== 'archiviato'), elencoObiettivi()
  ]);
  const elenchi = { conto: conti, fondo: fondi, obiettivo: obiettivi };

  container.innerHTML = `
    <section class="pannello">
      <h2>Registra Rettifica</h2>
      <p class="nota">
        Unico modo per correggere il saldo di un Conto, un Fondo o un Obiettivo dopo la loro
        creazione (arrotondamenti, interessi, competenze bancarie, correzione di un errore).
        Un importo positivo aumenta il saldo, un importo negativo lo riduce. La descrizione è
        obbligatoria: è l'unica cosa che dà senso a un numero altrimenti "dal nulla".
      </p>
      <form id="form-rettifica" class="form-scheda">
        <label>Applica a *
          <select name="tipoEntita" required>
            <option value="conto">Conto</option>
            <option value="fondo">Fondo</option>
            <option value="obiettivo">Obiettivo</option>
          </select>
        </label>
        <label>Elemento *<select name="entitaId" required></select></label>
        <label>Importo * (positivo = aumenta, negativo = riduce)<input name="importo" type="number" step="any" required></label>
        <label>Data e ora *<input name="data" type="datetime-local" required value="${oraLocaleInput()}"></label>
        <label>Descrizione * (motivo della rettifica)<input name="descrizione" required></label>
        <div class="form-azioni">
          <button type="submit" class="btn-primario">Registra Rettifica</button>
        </div>
      </form>
      <div id="esito-rettifica"></div>
    </section>
  `;

  const selectTipo = container.querySelector('select[name="tipoEntita"]');
  const selectEntita = container.querySelector('select[name="entitaId"]');

  const nomeElemento = (tipo, el) => tipo === 'obiettivo' ? `${el.nome} (accumulato ${el.saldoAccumulato})`
    : tipo === 'fondo' ? `${el.nome} (saldo ${el.saldo})` : `${el.nome} (saldo ${el.saldoReale})`;

  const aggiornaOpzioni = () => {
    const elenco = elenchi[selectTipo.value] || [];
    selectEntita.innerHTML = elenco.map((el) => `<option value="${el.id}">${nomeElemento(selectTipo.value, el)}</option>`).join('');
  };
  selectTipo.addEventListener('change', aggiornaOpzioni);
  aggiornaOpzioni();

  container.querySelector('#form-rettifica').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    dati.data = new Date(dati.data).toISOString();
    try {
      await creaRettifica(dati);
      container.querySelector('#esito-rettifica').innerHTML = '<p class="badge badge-ok">✓ Rettifica registrata.</p>';
      e.target.reset();
    } catch (err) {
      alert(err.message);
    }
  });
}
