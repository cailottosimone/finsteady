import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { creaTrasferimento } from '../domain/trasferimenti.js';
import { oraLocaleInput } from '../utils/dateUtils.js';

export async function renderTrasferimento(container) {
  const [conti, fondi, obiettivi] = await Promise.all([
    elencoConti(), (await elencoFondi()).filter((f) => f.stato !== 'archiviato'), elencoObiettivi()
  ]);
  const elenchi = { conto: conti, fondo: fondi, obiettivo: obiettivi };

  container.innerHTML = `
    <section class="pannello">
      <h2>Registra Trasferimento</h2>
      <p class="nota">
        Movimento reale tra due entità che detengono valore (Conto, Fondo, Obiettivo). Se le due
        entità appartengono allo stesso Conto reale, il saldo del Conto non cambia: cambia solo
        quanto di quel denaro è earmarked in un Fondo/Obiettivo rispetto a quanto è liquidità libera.
      </p>
      <form id="form-trasferimento" class="form-scheda">
        <label>Tipo origine *
          <select name="tipoOrigine" required>
            <option value="conto">Conto</option>
            <option value="fondo">Fondo</option>
            <option value="obiettivo">Obiettivo</option>
          </select>
        </label>
        <label>Origine *<select name="origineId" required></select></label>
        <label>Tipo destinazione *
          <select name="tipoDestinazione" required>
            <option value="conto">Conto</option>
            <option value="fondo">Fondo</option>
            <option value="obiettivo">Obiettivo</option>
          </select>
        </label>
        <label>Destinazione *<select name="destinazioneId" required></select></label>
        <label>Importo *<input name="importo" type="number" step="any" required></label>
        <label>Data e ora *<input name="data" type="datetime-local" required value="${oraLocaleInput()}"></label>
        <label>Descrizione<input name="descrizione"></label>
        <div class="form-azioni">
          <button type="submit" class="btn-primario">Registra Trasferimento</button>
        </div>
      </form>
      <div id="esito-trasferimento"></div>
    </section>
  `;

  const selectTipoOrigine = container.querySelector('select[name="tipoOrigine"]');
  const selectOrigine = container.querySelector('select[name="origineId"]');
  const selectTipoDestinazione = container.querySelector('select[name="tipoDestinazione"]');
  const selectDestinazione = container.querySelector('select[name="destinazioneId"]');

  const nomeElemento = (tipo, el) => tipo === 'obiettivo' ? `${el.nome} (accumulato ${el.saldoAccumulato})`
    : tipo === 'fondo' ? `${el.nome} (saldo ${el.saldo})` : `${el.nome} (saldo ${el.saldoReale})`;

  const aggiornaOpzioni = (selectTipo, selectDest) => {
    const elenco = elenchi[selectTipo.value] || [];
    selectDest.innerHTML = elenco.map((el) => `<option value="${el.id}">${nomeElemento(selectTipo.value, el)}</option>`).join('');
  };

  selectTipoOrigine.addEventListener('change', () => aggiornaOpzioni(selectTipoOrigine, selectOrigine));
  selectTipoDestinazione.addEventListener('change', () => aggiornaOpzioni(selectTipoDestinazione, selectDestinazione));
  aggiornaOpzioni(selectTipoOrigine, selectOrigine);
  aggiornaOpzioni(selectTipoDestinazione, selectDestinazione);

  container.querySelector('#form-trasferimento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    dati.data = new Date(dati.data).toISOString();
    try {
      await creaTrasferimento(dati);
      container.querySelector('#esito-trasferimento').innerHTML = '<p class="badge badge-ok">✓ Trasferimento registrato.</p>';
      e.target.reset();
    } catch (err) {
      alert(err.message);
    }
  });
}
