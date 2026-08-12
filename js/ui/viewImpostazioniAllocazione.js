import { ottieniImpostazioniAllocazione, impostaDestinazioneEccesso } from '../domain/impostazioniAllocazione.js';
import { elencoFondi } from '../domain/fondi.js';

export async function renderImpostazioniAllocazione(container) {
  const [impostazioni, fondi] = await Promise.all([
    ottieniImpostazioniAllocazione(), elencoFondi()
  ]);

  container.innerHTML = `
    <section class="pannello">
      <h3>Eccesso di un'Entrata non coperto da un Piano</h3>
      <p class="nota">
        In Registra Entrata, quando usi un Piano che non copre l'intera Entrata, la parte
        in eccesso resta di default "disponibilità residua" sul Conto di arrivo. Qui puoi
        designare invece un Fondo dove farla confluire automaticamente.
      </p>
      <label style="max-width:320px;">Destinazione dell'eccesso
        <select id="select-tipo-destinazione-eccesso">
          <option value="" ${!impostazioni.destinazioneEccessoTipo ? 'selected' : ''}>Nessuna — lascia come disponibilità residua</option>
          <option value="fondo" ${impostazioni.destinazioneEccessoTipo === 'fondo' ? 'selected' : ''}>Un Fondo specifico</option>
        </select>
      </label>
      <div id="campo-destinazione-eccesso"></div>
    </section>
  `;

  const selectTipo = container.querySelector('#select-tipo-destinazione-eccesso');
  const campoContainer = container.querySelector('#campo-destinazione-eccesso');

  function renderCampo() {
    const tipo = selectTipo.value;
    if (tipo === 'fondo') {
      campoContainer.innerHTML = `
        <label style="max-width:320px;">Fondo
          <select id="select-id-destinazione-eccesso">
            ${fondi.map((f) => `<option value="${f.id}" ${impostazioni.destinazioneEccessoId === f.id ? 'selected' : ''}>${f.nome}</option>`).join('')}
          </select>
        </label>
      `;
    } else {
      campoContainer.innerHTML = '';
    }
    const selectId = campoContainer.querySelector('#select-id-destinazione-eccesso');
    if (selectId) selectId.addEventListener('change', salva);
  }

  async function salva() {
    const tipo = selectTipo.value || null;
    const selectId = campoContainer.querySelector('#select-id-destinazione-eccesso');
    const id = selectId ? selectId.value : null;
    try {
      await impostaDestinazioneEccesso(tipo, id);
    } catch (err) {
      alert(err.message);
    }
  }

  selectTipo.addEventListener('change', async () => {
    renderCampo();
    await salva();
  });
  renderCampo();
}
