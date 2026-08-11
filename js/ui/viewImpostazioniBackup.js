// Vista Backup (in Impostazioni): esporta/importa l'intera configurazione del Profilo attivo
// (Conti, Fondi, Obiettivi, Budget, Piano, Movimenti...) in un file JSON, per portarla su un
// altro PC. Spostato qui dalla Dashboard per non ingombrare la vista principale con un pannello
// tecnico — stesso motivo e stesso pattern già seguito per la Diagnostica (vedi
// viewImpostazioniDiagnostica.js).
//
// Per il backup di UN Profilo specifico non attivo, o di TUTTI i Profili insieme, resta invece
// nella vista Profili la sezione "Backup Profili" (domain/backupProfili.js), che è un meccanismo
// distinto: opera su database di Profili anche non attivi, non solo su quello corrente.

import { esportaTutto, importaTutto } from '../domain/backup.js';
import { mostraConferma } from '../utils/dialogUtils.js';

export async function renderImpostazioniBackup(container) {
  container.innerHTML = `
    <section class="pannello">
      <h3>Backup</h3>
      <p class="nota">
        Esporta l'intera configurazione (Conti, Fondi, Obiettivi, Budget, Piano, Movimenti...)
        in un file, per portarla su un altro PC. Importare un backup <strong>sostituisce
        interamente</strong> i dati attuali di questo browser: usalo con cautela.
      </p>
      <div class="azioni-riga">
        <button id="btn-esporta">Esporta configurazione</button>
        <button id="btn-importa">Importa configurazione</button>
      </div>
      <input type="file" id="input-importa-file" accept=".json" style="display:none;">
    </section>
  `;

  container.querySelector('#btn-esporta').addEventListener('click', async () => {
    const pacchetto = await esportaTutto();
    const blob = new Blob([JSON.stringify(pacchetto, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dataFile = new Date().toISOString().substring(0, 10);
    a.href = url;
    a.download = `financial-planner-backup-${dataFile}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const inputFile = container.querySelector('#input-importa-file');
  container.querySelector('#btn-importa').addEventListener('click', () => {
    inputFile.value = '';
    inputFile.click();
  });
  inputFile.addEventListener('change', async () => {
    const file = inputFile.files[0];
    if (!file) return;
    const ok = await mostraConferma({
      titolo: 'Importare la configurazione?',
      messaggio: 'Importare questo file sostituirà INTERAMENTE i dati attuali di questo browser. Continuare?',
      testoConferma: 'Sostituisci tutti i dati',
      pericoloso: true
    });
    if (!ok) return;
    try {
      const testo = await file.text();
      const pacchetto = JSON.parse(testo);
      await importaTutto(pacchetto);
      alert('Importazione completata. La pagina verrà ricaricata.');
      window.location.reload();
    } catch (err) {
      alert(`Importazione fallita: ${err.message}`);
    }
  });
}
