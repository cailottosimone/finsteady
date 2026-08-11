import { elencoFondi } from '../domain/fondi.js';
import { elencoObiettiviPerFondo } from '../domain/obiettivi.js';
import { creaUscita } from '../domain/uscite.js';
import { aggiungiAllegato } from '../domain/allegati.js';
import { oraLocaleInput } from '../utils/dateUtils.js';

export async function renderUscita(container) {
  const fondi = (await elencoFondi()).filter((f) => f.stato !== 'archiviato');

  container.innerHTML = `
    <section class="pannello">
      <h2>Registra Uscita</h2>
      <p class="nota">Un pagamento reale che riduce un Fondo (o uno specifico Obiettivo al suo interno). Non riguarda i Budget.</p>
      <form id="form-uscita" class="form-scheda">
        <label>Fondo *
          <select name="fondoId" required>
            <option value="">-- seleziona --</option>
            ${fondi.map((f) => `<option value="${f.id}">${f.nome} (saldo ${f.saldo})</option>`).join('')}
          </select>
        </label>
        <label>Obiettivo (opzionale)
          <select name="obiettivoId"><option value="">-- nessuno specifico --</option></select>
        </label>
        <label>Importo *<input name="importo" type="number" step="any" required></label>
        <label>Data e ora *<input name="data" type="datetime-local" required value="${oraLocaleInput()}"></label>
        <label>Descrizione<input name="descrizione"></label>
        <details class="dettagli-allegato">
          <summary>Allegato (facoltativo — ricevuta, documento...)</summary>
          <label>File<input type="file" name="allegatoFile" accept="image/*,.pdf,.doc,.docx"></label>
          <label>Percorso sul PC (se non carichi un file)<input type="text" name="allegatoPercorso" placeholder="es. /Users/nome/Documenti/ricevuta.pdf"></label>
          <label>Note<input type="text" name="allegatoNote"></label>
        </details>
        <div class="form-azioni">
          <button type="submit" class="btn-primario">Registra Uscita</button>
        </div>
      </form>
      <div id="esito-uscita"></div>
    </section>
  `;

  const selectFondo = container.querySelector('select[name="fondoId"]');
  const selectObiettivo = container.querySelector('select[name="obiettivoId"]');

  selectFondo.addEventListener('change', async () => {
    if (!selectFondo.value) { selectObiettivo.innerHTML = '<option value="">-- nessuno specifico --</option>'; return; }
    const obiettivi = await elencoObiettiviPerFondo(selectFondo.value);
    selectObiettivo.innerHTML = '<option value="">-- nessuno specifico --</option>'
      + obiettivi.map((o) => `<option value="${o.id}">${o.nome} (${o.saldoAccumulato})</option>`).join('');
  });

  container.querySelector('#form-uscita').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const dati = Object.fromEntries(new FormData(form).entries());
    dati.obiettivoId = dati.obiettivoId || null;
    dati.data = new Date(dati.data).toISOString();
    const allegatoFile = dati.allegatoFile && dati.allegatoFile.size > 0 ? dati.allegatoFile : null;
    const allegatoPercorso = dati.allegatoPercorso || '';
    const allegatoNote = dati.allegatoNote || '';
    delete dati.allegatoFile;
    delete dati.allegatoPercorso;
    delete dati.allegatoNote;
    try {
      const uscita = await creaUscita(dati);
      if (allegatoFile || allegatoPercorso || allegatoNote) {
        let contenuto = null, nomeFile = null, tipoMime = null;
        if (allegatoFile) {
          contenuto = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(allegatoFile);
          });
          nomeFile = allegatoFile.name;
          tipoMime = allegatoFile.type;
        }
        await aggiungiAllegato({
          tipoMovimento: 'uscita', movimentoId: uscita.id, nomeFile, tipoMime, contenuto,
          percorsoRiferimento: allegatoPercorso, note: allegatoNote
        });
      }
      container.querySelector('#esito-uscita').innerHTML = '<p class="badge badge-ok">✓ Uscita registrata.</p>';
      form.reset();
    } catch (err) {
      alert(err.message);
    }
  });
}
