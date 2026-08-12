import {
  elencoConsuntivi, ottieniDettaglioConsuntivo, creaConsuntivo, eliminaConsuntivo,
  elencoPeriodiSenzaConsuntivo, diagnosiPeriodoConsuntivo
} from '../domain/consuntivi.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { formattaData } from '../utils/dateUtils.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';

let consuntivoEspansoId = null;
let mostraFormNuovo = false;
const stato = { ordineChiave: 'periodoInizio', ordineDecrescente: true, ricerca: '' };

const CHIAVI_ORDINAMENTO = {
  periodoInizio: (c) => c.periodoInizio,
  dataCreazione: (c) => c.dataCreazione
};

export async function renderConsuntivi(container) {
  const [consuntivi, periodiDisponibili] = await Promise.all([
    elencoConsuntivi(), elencoPeriodiSenzaConsuntivo()
  ]);

  container.innerHTML = `
    <section class="pannello">
      <h2>Consuntivi</h2>
      <p class="nota">
        Il Consuntivo è una fotografia reale di fine periodo: Budget (assegnato/utilizzato/
        residuo), saldo dei Fondi e dettaglio degli Obiettivi, tutti congelati al momento della
        creazione. Non è collegato in modo vivo a Budget/Fondi/Obiettivi: un Piano successivo,
        o qualsiasi modifica futura a quelle entità, non lo altera mai.
      </p>
      <div class="barra-ricerca">
        <input type="text" id="ricerca-consuntivi" placeholder="Cerca per periodo o note..." value="${stato.ricerca}">
      </div>
      <div id="lista-consuntivi"></div>
      <button id="btn-nuovo-consuntivo" class="btn-primario">
        <i class="fa-solid fa-plus"></i> Nuovo Consuntivo
      </button>
      <div id="form-consuntivo-container"></div>
    </section>
  `;

  container.querySelector('#ricerca-consuntivi').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, consuntivi);
  });

  await renderTabella(container, consuntivi);

  container.querySelector('#btn-nuovo-consuntivo').addEventListener('click', async () => {
    if (periodiDisponibili.length === 0) {
      const diagnosi = await diagnosiPeriodoConsuntivo();
      const messaggi = {
        nessun_ciclo: 'Non è stato ancora aperto alcun Ciclo Budget: apri e chiudi un Ciclo (in "Conti → Budget → Mese") prima di generare un Consuntivo.',
        cicli_aperti: `Il periodo ${formattaData(diagnosi.periodoInizio)} — ${formattaData(diagnosi.periodoFine)} ha ancora ${diagnosi.numeroAperti} Ciclo/i Budget aperto/i: chiudili tutti (in "Conti → Budget → Mese") prima di generare il Consuntivo per questo periodo.`,
        tutti_fotografati: 'Tutti i periodi già chiusi hanno già un Consuntivo: non c\'è nessun nuovo periodo da fotografare al momento.'
      };
      alert(messaggi[diagnosi.tipo] || 'Nessun periodo disponibile per un nuovo Consuntivo al momento.');
      return;
    }
    mostraFormNuovo = !mostraFormNuovo;
    if (mostraFormNuovo) mostraFormNuovoConsuntivo(container, periodiDisponibili);
    else container.querySelector('#form-consuntivo-container').innerHTML = '';
  });
  if (mostraFormNuovo) mostraFormNuovoConsuntivo(container, periodiDisponibili);
}

async function renderTabella(container, consuntiviCompleti) {
  const lista = container.querySelector('#lista-consuntivi');

  let consuntivi = filtraTesto(
    consuntiviCompleti, stato.ricerca,
    (c) => `${formattaData(c.periodoInizio)} ${formattaData(c.periodoFine)} ${c.note || ''}`
  );
  consuntivi = ordina(consuntivi, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.periodoInizio, stato.ordineDecrescente);

  if (consuntivi.length === 0) {
    lista.innerHTML = '<p class="nota">Nessun Consuntivo trovato.</p>';
    return;
  }

  const righeHtml = [];
  for (const c of consuntivi) {
    righeHtml.push(await renderRigaConsuntivo(c));
  }

  lista.innerHTML = `
    <table class="tabella">
      <thead><tr>
        ${intestazioneOrdinabile('Periodo', 'periodoInizio', stato)}
        ${intestazioneOrdinabile('Creato il', 'dataCreazione', stato)}
        <th>Note</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${righeHtml.join('')}
      </tbody>
    </table>
  `;

  collegaOrdinamento(lista, stato, () => renderTabella(container, consuntiviCompleti));

  lista.querySelectorAll('button[data-azione="espandi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      consuntivoEspansoId = consuntivoEspansoId === btn.dataset.id ? null : btn.dataset.id;
      renderConsuntivi(container);
    });
  });

  lista.querySelectorAll('button[data-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const primaConferma = await mostraConferma({
        titolo: 'Eliminare il Consuntivo?',
        messaggio: 'Eliminare DEFINITIVAMENTE questo Consuntivo? È una fotografia storica: una volta eliminata non è recuperabile.',
        testoConferma: 'Elimina Consuntivo',
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
      try {
        await eliminaConsuntivo(btn.dataset.id);
        renderConsuntivi(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function renderRigaConsuntivo(c) {
  const espanso = consuntivoEspansoId === c.id;
  return `
    <tr>
      <td>${formattaData(c.periodoInizio)} — ${formattaData(c.periodoFine)}</td>
      <td>${formattaData(c.dataCreazione)}</td>
      <td class="nota-inline">${c.note || '—'}</td>
      <td>
        <div class="azioni-riga">
          <button class="btn-icona" title="${espanso ? 'Chiudi' : 'Dettaglio'}" data-azione="espandi" data-id="${c.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button>
          <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
    ${espanso ? `
      <tr>
        <td colspan="4" style="background:var(--colore-sfondo-soft);">
          ${await renderDettaglioConsuntivo(c.id)}
        </td>
      </tr>
    ` : ''}
  `;
}

async function renderDettaglioConsuntivo(consuntivoId) {
  const { righeBudget, righeFondo, righeObiettivo } = await ottieniDettaglioConsuntivo(consuntivoId);
  const mappaObiettiviPerFondo = new Map();
  righeObiettivo.forEach((o) => {
    if (!mappaObiettiviPerFondo.has(o.fondoId)) mappaObiettiviPerFondo.set(o.fondoId, []);
    mappaObiettiviPerFondo.get(o.fondoId).push(o);
  });

  return `
    <h4>Budget (Operatività)</h4>
    ${righeBudget.length === 0 ? '<p class="nota">Nessun Budget in questo periodo.</p>' : `
      <table class="tabella">
        <thead><tr><th>Budget</th><th>Conto</th><th>Assegnato</th><th>Riporto</th><th>Utilizzato</th><th>Avanzo/Sforamento</th><th>Esito</th><th>Controparte</th></tr></thead>
        <tbody>
          ${righeBudget.map((r) => `
            <tr>
              <td>${r.budgetNome}</td>
              <td>${r.contoNome}</td>
              <td class="numero">${formattaValuta(r.importoAssegnato)}</td>
              <td class="numero ${r.riportoIniziale < 0 ? 'testo-errore' : ''}">${formattaValuta(r.riportoIniziale)}</td>
              <td class="numero">${formattaValuta(r.importoUtilizzato)}</td>
              <td class="numero ${r.residuo < 0 ? 'testo-errore' : ''}">${formattaValuta(r.residuo)}</td>
              <td class="nota-inline">${r.residuoAzione || '—'}</td>
              <td class="nota-inline">${r.controparteNome ? `${r.controparteTipo === 'obiettivo' ? 'Obiettivo' : 'Fondo'}: ${r.controparteNome}` : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}

    <h4 style="margin-top:16px;">Fondi e Obiettivi (Patrimonio)</h4>
    ${righeFondo.length === 0 ? '<p class="nota">Nessun Fondo presente in questo periodo.</p>' : `
      <table class="tabella">
        <thead><tr><th>Fondo</th><th>Conto</th><th>Saldo</th><th>Avanzamento Obiettivi</th></tr></thead>
        <tbody>
          ${righeFondo.map((f) => {
            const obiettiviDelFondo = mappaObiettiviPerFondo.get(f.fondoId) || [];
            return `
              <tr>
                <td>${f.fondoNome}</td>
                <td>${f.contoNome}</td>
                <td class="numero">${formattaValuta(f.saldo)}</td>
                <td>
                  ${f.percentuale == null ? '<span class="nota-inline">—</span>' : `
                    <span class="nota-inline">${formattaValuta(f.saldoAccumulatoTotale)} / ${formattaValuta(f.obiettivoComplessivo)} (${f.percentuale}%)</span>
                  `}
                </td>
              </tr>
              ${obiettiviDelFondo.length > 0 ? `
                <tr>
                  <td colspan="4">
                    <table class="tabella" style="margin-left:16px;">
                      <thead><tr><th>Obiettivo</th><th>Scadenza</th><th>Accumulato</th><th>Target</th><th>%</th></tr></thead>
                      <tbody>
                        ${obiettiviDelFondo.map((o) => `
                          <tr>
                            <td>${o.obiettivoNome}</td>
                            <td>${formattaData(o.dataPrevista)}</td>
                            <td class="numero">${formattaValuta(o.saldoAccumulato)}</td>
                            <td class="numero">${formattaValuta(o.importoTarget)}</td>
                            <td class="numero">${o.percentuale}%</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ` : ''}
            `;
          }).join('')}
        </tbody>
      </table>
    `}
  `;
}

function mostraFormNuovoConsuntivo(container, periodiDisponibili) {
  const formContainer = container.querySelector('#form-consuntivo-container');
  if (periodiDisponibili.length === 0) { formContainer.innerHTML = ''; return; }

  formContainer.innerHTML = `
    <form id="form-consuntivo" class="form-scheda">
      <h4>Nuovo Consuntivo</h4>
      <label>Periodo *
        <select name="periodoChiave" required>
          ${periodiDisponibili.map((p) => `
            <option value="${p.periodoInizio}|${p.periodoFine}">
              ${formattaData(p.periodoInizio)} — ${formattaData(p.periodoFine)} (${p.numeroBudget} Budget)
            </option>
          `).join('')}
        </select>
      </label>
      <label>Note (facoltative)<input name="note" placeholder="es. commento, evento particolare del periodo..."></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Genera Consuntivo</button>
        <button type="button" id="btn-annulla-consuntivo">Annulla</button>
      </div>
    </form>
  `;

  formContainer.querySelector('#btn-annulla-consuntivo').addEventListener('click', () => {
    mostraFormNuovo = false;
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('#form-consuntivo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    const [periodoInizio, periodoFine] = dati.periodoChiave.split('|');
    try {
      await creaConsuntivo({ periodoInizio, periodoFine, note: dati.note });
      mostraFormNuovo = false;
      renderConsuntivi(container);
    } catch (err) {
      alert(err.message);
    }
  });
}
