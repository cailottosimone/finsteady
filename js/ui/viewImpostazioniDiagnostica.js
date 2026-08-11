// Vista Diagnostica (in Impostazioni): contiene il dettaglio completo della Verifica di
// Integrità Patrimoniale, spostato qui dalla Dashboard per non ingombrare la vista principale
// con un pannello tecnico. In Dashboard resta solo un badge compatto (✓ / ⚠ N problemi) che
// rimanda qui — vedi dashboard.js e il pattern già usato dal pulsante-ingranaggio di Salute
// Finanziaria (impostaTabAttivaImpostazioni + window.mostraVista('impostazioni')).
//
// Il calcolo (query IndexedDB + verificaIntegritaGlobale/eseguiVerificaIntegritaCompleta) è
// condiviso con la Dashboard tramite calcolaStatoIntegrita(), per non duplicarlo: la Dashboard
// lo usa solo per il conteggio del badge, qui viene usato per il dettaglio completo.

import { calcolaStatoIntegrita } from './dashboard.js';
import { ripulisciTuttoOrfano } from '../domain/riparazione.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { mostraConferma } from '../utils/dialogUtils.js';

export async function renderImpostazioniDiagnostica(container) {
  const { verifiche, verificheConMovimento, problemi } = await calcolaStatoIntegrita();

  container.innerHTML = `
    <h3>Verifica di Integrità Patrimoniale</h3>
    <p class="nota">
      Il "controllo di salute" complessivo dell'app: saldo Conto = Fondi + Liquidità libera
      (il Budget non è mai patrimonio: diventa un movimento tracciato solo a chiusura ciclo,
      se un avanzo/eccesso genera un Trasferimento verso/da un Fondo), nessun Fondo negativo,
      nessun Obiettivo che superi il proprio Fondo, nessun riferimento rotto tra entità
      (movimento orfano), nessuno storno incoerente.
    </p>
    ${problemi.length === 0
      ? '<p class="badge badge-ok">✓ Nessun problema rilevato</p>'
      : `${problemi.map((p) => `<p class="badge badge-errore">⚠️ [${p.categoria}] ${p.messaggio}</p>`).join('')}
         <button id="btn-ripara-orfani">Ripara automaticamente</button>
         <p class="nota-inline">Elimina i movimenti e gli Storni ormai orfani (riferiti a Conti/Fondi/Obiettivi eliminati). Non tocca movimenti validi.</p>`}
    <table class="tabella-integrita">
      <thead>
        <tr><th>Conto</th><th>Saldo reale</th><th>Fondi collegati</th><th>Liquidità non allocata</th></tr>
      </thead>
      <tbody>
        ${verifiche.map((v) => `
          <tr>
            <td>${v.conto.nome}</td>
            <td class="numero">${formattaValuta(v.conto.saldoReale)}</td>
            <td class="numero">${formattaValuta(v.totaleFondi)}</td>
            <td class="numero ${v.coerente ? '' : 'testo-errore'}">${formattaValuta(v.liquiditaNonAllocata)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${verificheConMovimento.length > 0 ? `
      <div class="equazione-patrimoniale">
        ${verificheConMovimento.map((v) => {
          const saldo = Number(v.conto.saldoReale) || 0;
          const totale = Math.max(saldo, v.totaleFondi, 0.01);
          const pctFondi = Math.max(0, Math.min(100, (v.totaleFondi / totale) * 100));
          const pctLibera = Math.max(0, 100 - pctFondi);
          return `
            <p class="nota" style="margin-bottom:4px;"><strong>${v.conto.nome}</strong> — Conto = Fondi + Liquidità</p>
            <div class="equazione-barra">
              <div class="equazione-segmento fondi" style="width:${pctFondi}%"></div>
              <div class="equazione-segmento libera" style="width:${pctLibera}%"></div>
            </div>
            <div class="equazione-legenda">
              <span class="equazione-voce"><span class="equazione-pallino fondi"></span>Fondi ${formattaValuta(v.totaleFondi)}</span>
              <span class="equazione-voce"><span class="equazione-pallino libera"></span>Liquidità ${formattaValuta(v.liquiditaNonAllocata)}</span>
            </div>
          `;
        }).join('<div style="height:16px;"></div>')}
      </div>
    ` : ''}
  `;

  const btnRipara = container.querySelector('#btn-ripara-orfani');
  if (btnRipara) {
    btnRipara.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Riparare automaticamente?',
        messaggio: 'Eliminare definitivamente tutti i movimenti e gli Storni orfani (riferiti a entità eliminate)? Non tocca alcun movimento valido. Azione irreversibile.',
        testoConferma: 'Ripara ed elimina orfani',
        pericoloso: true
      });
      if (!ok) return;
      const rimossi = await ripulisciTuttoOrfano();
      const totale = rimossi.righe + rimossi.uscite + rimossi.trasferimenti + rimossi.rettifiche + rimossi.storni + rimossi.cicliBudget;
      alert(`Riparazione completata: rimossi ${totale} record orfani (${rimossi.righe} righe di Allocazione, ${rimossi.uscite} Uscite, ${rimossi.trasferimenti} Trasferimenti, ${rimossi.rettifiche} Rettifiche, ${rimossi.storni} Storni, ${rimossi.cicliBudget} Cicli Budget).`);
      renderImpostazioniDiagnostica(container);
    });
  }
}
