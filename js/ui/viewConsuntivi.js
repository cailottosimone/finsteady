import {
  elencoConsuntivi, ottieniDettaglioConsuntivo, creaConsuntivo, eliminaConsuntivo,
  elencoPeriodiSenzaConsuntivo, diagnosiPeriodoConsuntivo
} from '../domain/consuntivi.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { formattaData } from '../utils/dateUtils.js';
import { ordina, filtraTesto, barraOrdinamentoHtml, collegaBarraOrdinamento } from '../utils/listaUtils.js';
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

  lista.innerHTML = barraOrdinamentoHtml([
    { chiave: 'periodoInizio', etichetta: 'Periodo' },
    { chiave: 'dataCreazione', etichetta: 'Creato il' }
  ], stato, 'consuntivi') + `
    <div class="lista-azioni-elenco">
      ${righeHtml.join('')}
    </div>
  `;

  collegaBarraOrdinamento(lista, stato, 'consuntivi', () => renderTabella(container, consuntiviCompleti));

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
    <div class="riga-elenco-azioni">
      <div class="riga-elenco-azioni-testata">
        <span class="riga-elenco-azioni-titolo">${formattaData(c.periodoInizio)} — ${formattaData(c.periodoFine)}</span>
      </div>
      <div class="riga-elenco-azioni-meta">
        <span>Creato il ${formattaData(c.dataCreazione)}</span>
        ${c.note ? `<span>· ${c.note}</span>` : ''}
      </div>
      <div class="riga-elenco-azioni-azioni azioni-riga">
        <button class="btn-icona" title="${espanso ? 'Chiudi' : 'Dettaglio'}" data-azione="espandi" data-id="${c.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button>
        <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${espanso ? `
        <div class="riga-elenco-azioni-dettaglio">
          ${await renderDettaglioConsuntivo(c.id)}
        </div>
      ` : ''}
    </div>
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
      <div class="lista-metriche">
        ${righeBudget.map((r) => `
          <div class="riga-metrica">
            <span class="riga-metrica-nome">${r.budgetNome}<span class="riga-metrica-sotto">${r.contoNome}${r.controparteNome ? ` · ${r.controparteTipo === 'obiettivo' ? 'Obiettivo' : 'Fondo'}: ${r.controparteNome}` : ''}</span></span>
            <div class="riga-metrica-valori">
              <span class="riga-metrica-valore"><span class="etichetta">Assegnato</span><span class="numero">${formattaValuta(r.importoAssegnato)}</span></span>
              <span class="riga-metrica-valore"><span class="etichetta">Riporto</span><span class="numero ${r.riportoIniziale < 0 ? 'negativo' : ''}">${formattaValuta(r.riportoIniziale)}</span></span>
              <span class="riga-metrica-valore"><span class="etichetta">Utilizzato</span><span class="numero">${formattaValuta(r.importoUtilizzato)}</span></span>
              <span class="riga-metrica-valore"><span class="etichetta">${r.residuo < 0 ? 'Sforamento' : 'Avanzo'}</span><span class="numero ${r.residuo < 0 ? 'negativo' : 'positivo'}">${formattaValuta(r.residuo)}</span></span>
              ${r.residuoAzione ? `<span class="riga-metrica-valore"><span class="etichetta">Esito</span><span class="numero" style="font-family:var(--font-corpo); font-weight:500;">${r.residuoAzione}</span></span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `}

    <h4 style="margin-top:16px;">Fondi e Obiettivi (Patrimonio)</h4>
    ${righeFondo.length === 0 ? '<p class="nota">Nessun Fondo presente in questo periodo.</p>' : `
      <div class="lista-metriche">
        ${righeFondo.map((f) => {
          const obiettiviDelFondo = mappaObiettiviPerFondo.get(f.fondoId) || [];
          return `
            <div class="riga-metrica" style="flex-wrap:wrap;">
              <span class="riga-metrica-nome">${f.fondoNome}<span class="riga-metrica-sotto">${f.contoNome}</span></span>
              <div class="riga-metrica-valori">
                <span class="riga-metrica-valore"><span class="etichetta">Saldo</span><span class="numero">${formattaValuta(f.saldo)}</span></span>
                ${f.percentuale != null ? `<span class="riga-metrica-valore"><span class="etichetta">Obiettivi</span><span class="numero">${formattaValuta(f.saldoAccumulatoTotale)} / ${formattaValuta(f.obiettivoComplessivo)} (${f.percentuale}%)</span></span>` : ''}
              </div>
              ${obiettiviDelFondo.length > 0 ? `
                <div class="riga-elenco-azioni-dettaglio" style="flex:1 1 100%;">
                  <div class="lista-metriche">
                    ${obiettiviDelFondo.map((o) => `
                      <div class="riga-metrica">
                        <span class="riga-metrica-nome">${o.obiettivoNome}<span class="riga-metrica-sotto">Scadenza ${formattaData(o.dataPrevista)}</span></span>
                        <div class="riga-metrica-valori">
                          <span class="riga-metrica-valore"><span class="etichetta">Accumulato</span><span class="numero">${formattaValuta(o.saldoAccumulato)}</span></span>
                          <span class="riga-metrica-valore"><span class="etichetta">Target</span><span class="numero">${formattaValuta(o.importoTarget)}</span></span>
                          <span class="riga-metrica-valore"><span class="etichetta">%</span><span class="numero">${o.percentuale}%</span></span>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
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
