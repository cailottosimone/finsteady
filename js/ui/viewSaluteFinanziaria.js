import { calcolaSaluteFinanziaria, calcolaStoricoPatrimonioConti } from '../domain/saluteFinanziaria.js';
import { impostaPeriodoSaluteFinanziaria } from '../domain/impostazioniSaluteFinanziaria.js';
import { impostaTabAttivaImpostazioni } from './viewImpostazioni.js';
import { elencoConti } from '../domain/conti.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { formattaData } from '../utils/dateUtils.js';

const contiSelezionatiGrafico = new Set();
let mostraGrafico = false;

export async function renderSaluteFinanziaria(container) {
  const dati = await calcolaSaluteFinanziaria();

  container.innerHTML = `
    <section class="pannello">
      <h2>Salute Finanziaria</h2>
      <label style="max-width:220px;">Periodo di riferimento
        <select id="select-periodo-salute">
          <option value="3" ${dati.periodoMesi === 3 ? 'selected' : ''}>Ultimi 3 mesi</option>
          <option value="6" ${dati.periodoMesi === 6 ? 'selected' : ''}>Ultimi 6 mesi</option>
          <option value="12" ${dati.periodoMesi === 12 ? 'selected' : ''}>Ultimi 12 mesi</option>
        </select>
      </label>

      <div class="griglia-indicatori-salute">

        <div class="scheda-indicatore scheda-emergenza">
          <button class="btn-icona btn-icona-impostazioni-emergenza" title="Impostazioni Fondo Emergenza" id="btn-impostazioni-emergenza"><i class="fa-solid fa-gear"></i></button>
          <h4>Mesi di autonomia</h4>
          ${dati.fondoEmergenzaEliminato ? '<p class="nota testo-errore">Il Fondo designato è stato eliminato.</p>' : ''}
          ${dati.fondoEmergenza ? `
            <p class="valore-indicatore">${dati.mesiAutonomia !== null ? `${dati.mesiAutonomia} mesi` : '—'}</p>
            <p class="nota">${dati.fondoEmergenza.nome}: ${formattaValuta(dati.fondoEmergenza.saldo)}</p>
          ` : '<p class="nota">Nessun Fondo Emergenza designato.</p>'}
        </div>

        <div class="scheda-indicatore">
          <h4>Obiettivi finanziati</h4>
          <p class="valore-indicatore">${dati.percentualeObiettiviFinanziati !== null ? `${dati.percentualeObiettiviFinanziati}%` : '—'}</p>
          <p class="nota">${dati.numeroObiettiviTotali} Obiettivi in totale</p>
        </div>

        <div class="scheda-indicatore">
          <h4>Obiettivi in ritardo</h4>
          <p class="valore-indicatore ${dati.obiettiviInRitardo.length > 0 ? 'testo-errore' : ''}">${dati.obiettiviInRitardo.length}</p>
          <p class="nota">Scadenza entro 3 mesi, meno dell'80% raggiunto</p>
          ${dati.obiettiviInRitardo.length > 0 ? `
            <ul class="elenco-semplice">
              ${dati.obiettiviInRitardo.map(({ obiettivo, dati: d }) => `
                <li>${obiettivo.nome} — ${d.percentuale}%, scade ${formattaData(obiettivo.dataPrevista)}</li>
              `).join('')}
            </ul>
          ` : ''}
        </div>

        <div class="scheda-indicatore">
          <h4>Crescita patrimoniale</h4>
          <p class="valore-indicatore" style="color:${dati.crescitaPatrimoniale.crescitaAssoluta >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">
            ${dati.crescitaPatrimoniale.crescitaAssoluta >= 0 ? '+' : ''}${formattaValuta(dati.crescitaPatrimoniale.crescitaAssoluta)}
            ${dati.crescitaPatrimoniale.crescitaPercentuale !== null ? ` (${dati.crescitaPatrimoniale.crescitaPercentuale >= 0 ? '+' : ''}${dati.crescitaPatrimoniale.crescitaPercentuale}%)` : ''}
          </p>
          <p class="nota">${formattaValuta(dati.crescitaPatrimoniale.saldoInizioPeriodo)} → ${formattaValuta(dati.crescitaPatrimoniale.saldoFineOeriodo)}</p>
        </div>

      </div>
    </section>

    <section class="pannello">
      <h3>Grafici</h3>
      <p class="nota">Andamento del patrimonio totale (Fondi + liquidità/Budget) di uno o più Conti nel tempo.</p>
      <div id="area-grafici-conti"></div>
    </section>
  `;

  container.querySelector('#select-periodo-salute').addEventListener('change', async (e) => {
    await impostaPeriodoSaluteFinanziaria(e.target.value);
    renderSaluteFinanziaria(container);
  });

  container.querySelector('#btn-impostazioni-emergenza').addEventListener('click', () => {
    impostaTabAttivaImpostazioni('salute');
    window.mostraVista('impostazioni');
  });

  await renderSezioneGrafici(container);
}

const GRANULARITA_LABEL_SALUTE = {
  settimana: 'Settimana', mese: 'Mese', trimestre: 'Trimestre',
  semestre: 'Semestre', anno: 'Anno', quinquennio: '5 anni'
};
let granularitaGraficoSalute = 'mese';

async function renderSezioneGrafici(container) {
  const conti = await elencoConti();
  const zona = container.querySelector('#area-grafici-conti');

  zona.innerHTML = `
    <div class="form-scheda" style="max-width:none;">
      <p class="nota-inline">Scegli quali Conti mostrare (nessuna selezione = tutti):</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
        ${conti.map((c) => `
          <button type="button" class="chip-selezione ${contiSelezionatiGrafico.has(c.id) ? 'selezionato' : ''}" data-id="${c.id}">
            <i class="fa-solid fa-check"></i>${c.nome}
          </button>
        `).join('')}
      </div>
      <label style="max-width:220px;">Dettaglio
        <select id="select-granularita-salute">
          ${Object.entries(GRANULARITA_LABEL_SALUTE).map(([val, label]) => `<option value="${val}" ${val === granularitaGraficoSalute ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <button id="btn-genera-grafico"><i class="fa-solid fa-chart-line"></i> ${mostraGrafico ? 'Aggiorna grafico' : 'Genera grafico'}</button>
    </div>
    <div id="grafico-conti-svg" style="position:relative;"></div>
  `;

  zona.querySelectorAll('.chip-selezione').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      if (contiSelezionatiGrafico.has(id)) contiSelezionatiGrafico.delete(id);
      else contiSelezionatiGrafico.add(id);
      chip.classList.toggle('selezionato');
    });
  });

  zona.querySelector('#select-granularita-salute').addEventListener('change', async (e) => {
    granularitaGraficoSalute = e.target.value;
    finestraGraficoSalute = null;
    puntoSelezionatoSalute = null;
    if (mostraGrafico) {
      const contiDaMostrare = contiSelezionatiGrafico.size > 0
        ? conti.filter((c) => contiSelezionatiGrafico.has(c.id))
        : conti;
      await disegnaGraficoConti(zona.querySelector('#grafico-conti-svg'), contiDaMostrare);
    }
  });

  zona.querySelector('#btn-genera-grafico').addEventListener('click', async () => {
    mostraGrafico = true;
    const contiDaMostrare = contiSelezionatiGrafico.size > 0
      ? conti.filter((c) => contiSelezionatiGrafico.has(c.id))
      : conti;
    await disegnaGraficoConti(zona.querySelector('#grafico-conti-svg'), contiDaMostrare);
  });

  if (mostraGrafico) {
    const contiDaMostrare = contiSelezionatiGrafico.size > 0
      ? conti.filter((c) => contiSelezionatiGrafico.has(c.id))
      : conti;
    await disegnaGraficoConti(zona.querySelector('#grafico-conti-svg'), contiDaMostrare);
  }
}

let finestraGraficoSalute = null; // null = non ancora inizializzata: mostra prima gli ultimi periodi (oggi incluso)
let puntoSelezionatoSalute = null; // { serieIndice, puntoIndice }
const DIMENSIONE_FINESTRA_GRAFICO_SALUTE = 12;

async function disegnaGraficoConti(zonaSvg, conti) {
  if (conti.length === 0) {
    zonaSvg.innerHTML = '<p class="nota">Nessun Conto da mostrare.</p>';
    return;
  }
  zonaSvg.innerHTML = '<p class="nota">Calcolo in corso…</p>';
  const storico = await calcolaStoricoPatrimonioConti(conti.map((c) => c.id), granularitaGraficoSalute);

  const numeroPuntiTotali = storico.etichette.length;
  const finestraMassima = Math.max(0, numeroPuntiTotali - DIMENSIONE_FINESTRA_GRAFICO_SALUTE);
  if (finestraGraficoSalute === null) finestraGraficoSalute = finestraMassima;
  finestraGraficoSalute = Math.max(0, Math.min(finestraGraficoSalute, finestraMassima));
  const fine = finestraGraficoSalute + DIMENSIONE_FINESTRA_GRAFICO_SALUTE;
  const serieFinestra = storico.serie.map((s) => ({ ...s, punti: s.punti.slice(finestraGraficoSalute, fine) }));
  const etichetteFinestra = storico.etichette.slice(finestraGraficoSalute, fine);
  const numeroPunti = etichetteFinestra.length;

  const larghezza = 720;
  const altezza = 320;
  const margine = { alto: 16, basso: 70, sinistra: 70, destra: 16 };
  const tuttiValori = serieFinestra.flatMap((s) => s.punti.map((p) => p.valore));
  const minValore = Math.min(0, ...tuttiValori);
  const maxValore = Math.max(...tuttiValori, 1);

  // Con un solo punto in finestra lo si centra invece di schiacciarlo a sinistra.
  const x = (indice) => numeroPunti === 1
    ? margine.sinistra + (larghezza - margine.sinistra - margine.destra) / 2
    : margine.sinistra + (indice / (numeroPunti - 1)) * (larghezza - margine.sinistra - margine.destra);
  const y = (valore) => altezza - margine.basso - ((valore - minValore) / (maxValore - minValore || 1)) * (altezza - margine.alto - margine.basso);

  const coloriPalette = ['#5B5FEF', '#00B37E', '#E0A500', '#E0546A', '#4C9BE0', '#9A5BE0'];

  const numeroLinee = 4;
  const lineeGriglia = [];
  const etichetteY = [];
  for (let i = 0; i <= numeroLinee; i++) {
    const valore = minValore + ((maxValore - minValore) * i) / numeroLinee;
    const yPos = y(valore);
    lineeGriglia.push(`<line x1="${margine.sinistra}" y1="${yPos}" x2="${larghezza - margine.destra}" y2="${yPos}" stroke="var(--colore-sfondo-soft)" stroke-width="1"></line>`);
    etichetteY.push(`<text x="${margine.sinistra - 8}" y="${yPos + 3}" font-size="9" fill="var(--colore-testo-soft)" text-anchor="end">${formattaValuta(valore)}</text>`);
  }

  const linee = serieFinestra.map((s, i) => {
    const colore = coloriPalette[i % coloriPalette.length];
    const punti = s.punti.map((p, indice) => `${x(indice)},${y(p.valore)}`).join(' ');
    return `<polyline points="${punti}" fill="none" stroke="${colore}" stroke-width="2"></polyline>`;
  }).join('');

  const cerchi = serieFinestra.flatMap((s, i) => s.punti.map((p, indice) => {
    const selezionato = puntoSelezionatoSalute && puntoSelezionatoSalute.serieIndice === i && puntoSelezionatoSalute.puntoIndice === indice;
    return `
    <circle cx="${x(indice)}" cy="${y(p.valore)}" r="${selezionato ? 6 : 4}" fill="${selezionato ? 'var(--colore-avviso)' : coloriPalette[i % coloriPalette.length]}"
      class="punto-grafico-salute" data-serie="${i}" data-punto="${indice}" data-nome="${s.nome}"
      data-inizio="${p.inizio}" data-fine="${p.fine}" data-valore="${p.valore}"
      style="cursor:pointer;"></circle>
  `;
  })).join('');

  const legenda = serieFinestra.map((s, i) => `
    <span style="display:inline-flex; align-items:center; gap:5px; margin-right:14px; font-size:0.8rem;">
      <span style="width:10px; height:10px; border-radius:50%; background:${coloriPalette[i % coloriPalette.length]}; display:inline-block;"></span>
      ${s.nome}
    </span>
  `).join('');

  const etichetteAsseX = etichetteFinestra.map((e, indice) => `
    <text x="${x(indice)}" y="${altezza - margine.basso + 32}" font-size="9" fill="var(--colore-testo-soft)"
      text-anchor="end" transform="rotate(-40 ${x(indice)} ${altezza - margine.basso + 32})">${e}</text>
  `).join('');

  const puntoSelezionatoDati = puntoSelezionatoSalute
    ? serieFinestra[puntoSelezionatoSalute.serieIndice]?.punti[puntoSelezionatoSalute.puntoIndice]
    : null;
  const nomeSerieSelezionata = puntoSelezionatoSalute ? serieFinestra[puntoSelezionatoSalute.serieIndice]?.nome : null;

  zonaSvg.innerHTML = `
    <div style="margin-bottom:8px;">${legenda}</div>
    <div class="azioni-riga" style="margin-bottom:6px;">
      <button id="btn-periodo-indietro-salute" ${finestraGraficoSalute <= 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Periodo precedente</button>
      <button id="btn-periodo-avanti-salute" ${finestraGraficoSalute >= finestraMassima ? 'disabled' : ''}>Periodo successivo <i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div style="position:relative;">
      <svg viewBox="0 0 ${larghezza} ${altezza}" style="width:100%; max-width:${larghezza}px; height:auto;">
        ${lineeGriglia.join('')}
        ${etichetteY.join('')}
        ${linee}
        ${cerchi}
        ${etichetteAsseX}
      </svg>
      <div class="tooltip-grafico" id="tooltip-grafico-salute" style="display:none;"></div>
    </div>
    <div id="eventi-punto-grafico-salute">
      ${puntoSelezionatoDati ? `
        <div class="pannello" style="margin-top:10px; box-shadow:none; border-color:var(--colore-avviso);">
          <h5 style="margin:0 0 6px;">${nomeSerieSelezionata}: movimenti dal ${formattaData(puntoSelezionatoDati.inizio)} al ${formattaData(puntoSelezionatoDati.fine)}</h5>
          ${puntoSelezionatoDati.eventi.length === 0 ? '<p class="nota">Nessun movimento in questo periodo.</p>' : `
            <ul class="elenco-semplice">
              ${puntoSelezionatoDati.eventi.map((ev) => `
                <li>
                  <span>${formattaData(ev.data)} — ${ev.nome}</span>
                  <span style="margin-left:auto; color:${ev.importo >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">${ev.importo >= 0 ? '+' : ''}${formattaValuta(ev.importo)}</span>
                </li>
              `).join('')}
            </ul>
          `}
        </div>
      ` : ''}
    </div>
    <p class="nota">Ricostruito dal registro movimenti (Fondi con precisione mensile; la quota di liquidità/Budget non allocata è considerata costante al valore attuale). Clicca un punto per vedere i movimenti del periodo.</p>
  `;

  zonaSvg.querySelector('#btn-periodo-indietro-salute').addEventListener('click', () => {
    finestraGraficoSalute = Math.max(0, finestraGraficoSalute - DIMENSIONE_FINESTRA_GRAFICO_SALUTE);
    puntoSelezionatoSalute = null;
    disegnaGraficoConti(zonaSvg, conti);
  });
  zonaSvg.querySelector('#btn-periodo-avanti-salute').addEventListener('click', () => {
    finestraGraficoSalute = Math.min(finestraMassima, finestraGraficoSalute + DIMENSIONE_FINESTRA_GRAFICO_SALUTE);
    puntoSelezionatoSalute = null;
    disegnaGraficoConti(zonaSvg, conti);
  });

  const tooltip = zonaSvg.querySelector('#tooltip-grafico-salute');
  zonaSvg.querySelectorAll('.punto-grafico-salute').forEach((cerchio) => {
    cerchio.addEventListener('mouseenter', (e) => {
      const { nome, inizio, fine, valore } = e.target.dataset;
      const valoreFormattato = formattaValuta(Number(valore));
      tooltip.textContent = `${nome} — ${formattaData(inizio)} – ${formattaData(fine)}: ${valoreFormattato}`;
      tooltip.style.display = 'block';
      posizionaTooltip(tooltip, e, zonaSvg);
    });
    cerchio.addEventListener('mousemove', (e) => posizionaTooltip(tooltip, e, zonaSvg));
    cerchio.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    cerchio.addEventListener('click', (e) => {
      const serieIndice = Number(e.target.dataset.serie);
      const puntoIndice = Number(e.target.dataset.punto);
      const stessoPunto = puntoSelezionatoSalute
        && puntoSelezionatoSalute.serieIndice === serieIndice && puntoSelezionatoSalute.puntoIndice === puntoIndice;
      puntoSelezionatoSalute = stessoPunto ? null : { serieIndice, puntoIndice };
      disegnaGraficoConti(zonaSvg, conti);
    });
  });
}

function posizionaTooltip(tooltip, evento, zonaSvg) {
  const rect = zonaSvg.getBoundingClientRect();
  tooltip.style.left = `${evento.clientX - rect.left}px`;
  tooltip.style.top = `${evento.clientY - rect.top}px`;
}
