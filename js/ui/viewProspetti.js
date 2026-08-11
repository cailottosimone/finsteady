import {
  elencoProspetti, creaProspetto, aggiornaProspetto, eliminaProspetto, calcolaProiezioneProspetto,
  aggiungiMovimentoProspetto, aggiungiMovimentiProspettoMultipli, aggiornaMovimentoProspetto,
  eliminaMovimentoProspetto, eliminaGruppoMovimentiProspetto,
  impostaSaldoPartenzaProspetto, rimuoviSaldoPartenzaProspetto,
  trasferisciRidistribuisciProspetto, calcolaDataFineEffettiva, ricalcolaProspetto,
  calcolaTraiettoriaDettagliataProspetto,
  impostaModalitaAutonomiaProspetto, elencoVociAutonomiaProspetto,
  aggiungiVoceAutonomiaProspetto, rimuoviVoceAutonomiaProspetto,
  duplicaProspetto, impostaBloccoProspetto, impostaObiettiviMonitoratiProspetto,
  DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE
} from '../domain/prospetti.js';
import { calcolaSaluteFinanziariaProspetto } from '../domain/saluteFinanziaria.js';
import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoPiani, elencoVociPerPiano } from '../domain/piano.js';
import { calcolaPropostaEqua, calcolaPropostaProporzionale } from '../engine/allocationEngine.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { arrotonda } from '../utils/denaro.js';
import { formattaData } from '../utils/dateUtils.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';

let prospettoEspansoId = null;
let mostraFormNuovo = false;
let prospettoInModifica = null;
let mostraFormMovimento = {}; // prospettoId -> bool
let movimentoInModifica = {}; // prospettoId -> movimento | null
const righeInModificaPartenza = new Set(); // chiavi "fondo:<id>" / "obiettivo:<id>"
const selezionatiConfronto = new Set();
let mostraConfronto = false;
const mostraTuttiPerProspetto = new Set(); // prospettoId con "mostra anche non coinvolti" attivo
let mostraFormTrasferimento = {}; // prospettoId -> 'trasferisci' | 'ridistribuisci' | null
const stato = { ordineChiave: 'dataCreazione', ordineDecrescente: true, ricerca: '' };

// Sezioni "Movimenti manuali", "Salute Finanziaria a fine Prospetto" e "Grafici" sono espandibili
// e di default COMPRESSE (solo titolo + chevron) — richiesto dall'utente per non affollare la
// vista di dettaglio. Chiave: `${prospettoId}:movimenti|salute|grafici`.
const sezioniEspanse = new Set();
// Tab attiva dentro "Movimenti manuali": Manuali (default) / Trasferimenti / Ridistribuzioni.
const tabMovimentiPerProspetto = {}; // prospettoId -> 'manuali' | 'trasferimenti' | 'ridistribuzioni'
// Una Ridistribuzione (gruppo di righe con più di una destinazione) è di default compressa,
// espandibile singolarmente col proprio chevron.
const gruppiRidistribuzioneEspansi = new Set(); // chiavi gruppoId
// Configurazione "Scegli quali Obiettivi monitorare" (Salute Finanziaria del Prospetto).
const mostraFormObiettiviMonitorati = new Set(); // prospettoId con il form aperto

const CHIAVI_ORDINAMENTO = {
  nome: (p) => p.nome,
  dataCreazione: (p) => p.dataCreazione
};

// Header cliccabile con chevron per una sezione collassabile — usato per "Movimenti manuali",
// "Salute Finanziaria a fine Prospetto" e "Grafici" nel dettaglio di un Prospetto. Di default
// compressa: mostra solo titolo e chevron finché non viene espansa esplicitamente.
function headerSezioneCollassabile(titolo, chiave, extra = '') {
  const espansa = sezioniEspanse.has(chiave);
  return `
    <h4 class="sezione-collassabile-header" data-azione="toggle-sezione" data-chiave="${chiave}" style="cursor:pointer; display:flex; align-items:center; gap:8px; margin-top:16px;">
      <i class="fa-solid ${espansa ? 'fa-chevron-up' : 'fa-chevron-down'}"></i> ${titolo}${extra}
    </h4>
  `;
}

export async function renderProspetti(container) {
  const [prospetti, piani] = await Promise.all([elencoProspetti(), elencoPiani()]);
  const mappaPiani = new Map(piani.map((p) => [p.id, p]));

  container.innerHTML = `
    <section class="pannello">
      <h2>Prospetti</h2>
      <p class="nota">Simulazione della crescita di Fondi e Obiettivi: non modifica alcun dato.</p>
      <div class="barra-ricerca">
        <input type="text" id="ricerca-prospetti" placeholder="Cerca per nome..." value="${stato.ricerca}">
      </div>
      <div id="lista-prospetti"></div>
      <div class="azioni-riga" style="margin-top:8px;">
        <button id="btn-nuovo-prospetto" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuovo Prospetto</button>
        <button id="btn-confronta" ${selezionatiConfronto.size < 2 ? 'disabled' : ''}>
          <i class="fa-solid fa-scale-balanced"></i> Confronta selezionati (${selezionatiConfronto.size})
        </button>
      </div>
      <div id="form-prospetto-container"></div>
      <div id="confronto-container" style="margin-top:16px;"></div>
    </section>
  `;

  container.querySelector('#ricerca-prospetti').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, prospetti, mappaPiani);
  });

  await renderTabella(container, prospetti, mappaPiani);

  container.querySelector('#btn-nuovo-prospetto').addEventListener('click', () => {
    prospettoInModifica = null;
    mostraFormNuovo = !mostraFormNuovo;
    if (mostraFormNuovo) mostraFormProspetto(container, piani, null, prospetti);
    else container.querySelector('#form-prospetto-container').innerHTML = '';
  });
  if (mostraFormNuovo) mostraFormProspetto(container, piani, prospettoInModifica, prospetti);

  container.querySelector('#btn-confronta').addEventListener('click', () => {
    mostraConfronto = true;
    renderConfronto(container, prospetti, mappaPiani);
  });
  if (mostraConfronto && selezionatiConfronto.size >= 2) {
    await renderConfronto(container, prospetti, mappaPiani);
  }
}

async function renderTabella(container, prospettiCompleti, mappaPiani) {
  const lista = container.querySelector('#lista-prospetti');

  let prospetti = filtraTesto(prospettiCompleti, stato.ricerca, (p) => p.nome);
  prospetti = ordina(prospetti, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.dataCreazione, stato.ordineDecrescente);

  if (prospetti.length === 0) {
    lista.innerHTML = '<p class="nota">Nessun Prospetto trovato. Creane uno per iniziare a proiettare la crescita dei tuoi Fondi.</p>';
    return;
  }

  const righeHtml = [];
  const mappaProspetti = new Map(prospettiCompleti.map((x) => [x.id, x]));
  for (const p of prospetti) {
    righeHtml.push(await renderRigaProspetto(p, mappaPiani, mappaProspetti));
  }

  lista.innerHTML = `
    <table class="tabella">
      <thead><tr>
        <th></th>
        ${intestazioneOrdinabile('Nome', 'nome', stato)}
        <th>Piano</th>
        <th>Parte da</th>
        <th>Orizzonte</th>
        <th>Entrata/ciclo</th>
        ${intestazioneOrdinabile('Creato il', 'dataCreazione', stato)}
        <th></th>
      </tr></thead>
      <tbody>
        ${righeHtml.join('')}
      </tbody>
    </table>
  `;

  collegaOrdinamento(lista, stato, () => renderTabella(container, prospettiCompleti, mappaPiani));

  lista.querySelectorAll('input.checkbox-confronto').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) selezionatiConfronto.add(cb.dataset.id);
      else selezionatiConfronto.delete(cb.dataset.id);
      const btnConfronta = container.querySelector('#btn-confronta');
      btnConfronta.disabled = selezionatiConfronto.size < 2;
      btnConfronta.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Confronta selezionati (${selezionatiConfronto.size})`;
    });
  });

  lista.querySelectorAll('button[data-azione="espandi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      prospettoEspansoId = prospettoEspansoId === btn.dataset.id ? null : btn.dataset.id;
      renderProspetti(container);
    });
  });

  lista.querySelectorAll('button[data-azione="anteprima"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const eraGiaEspanso = prospettoEspansoId === btn.dataset.id;
      prospettoEspansoId = btn.dataset.id;
      await renderProspetti(container);
      // Dopo il re-render il pulsante di stampa del dettaglio esiste già: lo attiviamo subito,
      // evitando di duplicare qui la logica di apriAnteprimaStampa.
      const btnStampa = container.querySelector(`#btn-stampa-prospetto-${btn.dataset.id}`);
      if (btnStampa) btnStampa.click();
      if (!eraGiaEspanso) { /* la riga resta aperta, comportamento coerente con "Proiezione" */ }
    });
  });

  lista.querySelectorAll('button[data-azione="modifica"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      prospettoInModifica = prospettiCompleti.find((p) => p.id === btn.dataset.id);
      mostraFormNuovo = true;
      mostraFormProspetto(container, [...mappaPiani.values()], prospettoInModifica, prospettiCompleti);
    });
  });

  lista.querySelectorAll('button[data-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Eliminare il Prospetto?',
        messaggio: 'Eliminare questo Prospetto? È solo una configurazione di simulazione: nessun dato reale verrà toccato.',
        testoConferma: 'Elimina Prospetto',
        pericoloso: true
      });
      if (!ok) return;
      await eliminaProspetto(btn.dataset.id);
      selezionatiConfronto.delete(btn.dataset.id);
      renderProspetti(container);
    });
  });

  lista.querySelectorAll('button[data-azione="duplica-prospetto"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { copia } = await duplicaProspetto(btn.dataset.id);
      alert(`Creato "${copia.nome}", una copia indipendente e modificabile.`);
      renderProspetti(container);
    });
  });

  lista.querySelectorAll('button[data-azione="blocca-prospetto"], button[data-azione="sblocca-prospetto"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await impostaBloccoProspetto(btn.dataset.id, btn.dataset.azione === 'blocca-prospetto');
      renderProspetti(container);
    });
  });

  if (prospettoEspansoId) {
    await renderDettaglioProspetto(container, prospettoEspansoId);
  }
}

function descrizioneOrizzonte(p) {
  return p.tipoOrizzonte === 'mesi' ? `${p.numeroMesi} mesi` : `fino al ${formattaData(p.dataFine)}`;
}

// Anteprima di stampa/PDF: apre in una nuova scheda un documento HTML essenziale (solo tabelle,
// senza le descrizioni discorsive presenti nell'app) e invoca la stampa nativa del browser —
// che mostra già un'anteprima prima di stampare o salvare come PDF, senza bisogno di generare
// un PDF lato applicazione.
function apriAnteprimaStampa(dati) {
  const {
    prospetto, numeroCicli, dataFineEffettiva, baselineReale,
    contiProiettati, patrimonioTotaleAttuale, patrimonioTotaleProiettato, patrimonioTotalePrecedente,
    budgetStimati, budgetStimatiDaPiano,
    fondiDaMostrare, obiettiviDaMostrare, mappaFondiAttuali, mappaFondiPartenza, mappaObiettiviAttuali, mappaObiettiviPartenza,
    movimentiManuali, nomeDestinazioneMovimento, nonAllocatoLordo, nonAllocatoDisponibile
  } = dati;

  const rigaConto = ({ conto, proiettato, saldoPrecedente }) => `
    <tr>
      <td>${conto.nome}</td>
      <td class="numero">${formattaValuta(conto.saldoReale)}</td>
      ${!baselineReale ? `<td class="numero">${formattaValuta(saldoPrecedente)}</td>` : ''}
      <td class="numero">${formattaValuta(proiettato)}</td>
    </tr>
  `;

  const html = `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <title>${prospetto.nome} — Prospetto</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; color: #111; padding: 24px; font-size: 13px; }
        h1 { font-size: 18px; margin-bottom: 2px; }
        h2 { font-size: 14px; margin: 20px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        p.meta { color: #555; margin-top: 0; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
        th { border-bottom: 1px solid #999; }
        td.numero, th.numero { text-align: right; }
        tr.totale { font-weight: 600; border-top: 1px solid #999; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${prospetto.nome}</h1>
      <p class="meta">
        ${formattaData(prospetto.dataInizio)} → ${formattaData(dataFineEffettiva)} · ${numeroCicli} cicli
        ${prospetto.pianoId ? ` · Entrata/ciclo: ${formattaValuta(prospetto.importoEntrataPerCiclo)}` : ''}
        ${!baselineReale ? ' · Concatenato' : ''}
        ${nonAllocatoLordo > 0.005 ? ` · Non allocati dal Piano: ${formattaValuta(nonAllocatoLordo)} (${formattaValuta(nonAllocatoDisponibile)} ancora disponibili)` : ''}
      </p>

      <h2>Conti</h2>
      <table>
        <thead><tr>
          <th>Conto</th><th class="numero">Attuale</th>
          ${!baselineReale ? '<th class="numero">Prospetto precedente</th>' : ''}
          <th class="numero">Previsto</th>
        </tr></thead>
        <tbody>
          ${contiProiettati.map(rigaConto).join('')}
          <tr class="totale">
            <td>Totale</td><td class="numero">${formattaValuta(patrimonioTotaleAttuale)}</td>
            ${!baselineReale ? `<td class="numero">${formattaValuta(patrimonioTotalePrecedente)}</td>` : ''}
            <td class="numero">${formattaValuta(patrimonioTotaleProiettato)}</td>
          </tr>
        </tbody>
      </table>

      ${budgetStimati.length > 0 ? `
        <h2>Budget${budgetStimatiDaPiano ? ' (da Piano)' : ' (stima)'}</h2>
        <table>
          <thead><tr><th>Budget</th><th class="numero">Per ciclo</th><th class="numero">Cicli</th><th class="numero">Totale</th></tr></thead>
          <tbody>
            ${budgetStimati.map(({ budget: b, totaleImpegnato }) => `
              <tr>
                <td>${b.nome}</td>
                <td class="numero">${formattaValuta(numeroCicli > 0 ? totaleImpegnato / numeroCicli : 0)}</td>
                <td class="numero">${numeroCicli}</td>
                <td class="numero">${formattaValuta(totaleImpegnato)}</td>
              </tr>
            `).join('')}
            <tr class="totale">
              <td colspan="3">Totale</td>
              <td class="numero">${formattaValuta(budgetStimati.reduce((s, x) => s + x.totaleImpegnato, 0))}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}

      ${fondiDaMostrare.length > 0 ? `
        <h2>Fondi</h2>
        <table>
          <thead><tr><th>Fondo</th><th class="numero">Partenza</th><th class="numero">Proiettato</th></tr></thead>
          <tbody>
            ${fondiDaMostrare.map((f) => `
              <tr>
                <td>${mappaFondiAttuali.get(f.id)?.nome || '(eliminato)'}</td>
                <td class="numero">${formattaValuta(mappaFondiPartenza.get(f.id)?.saldo)}</td>
                <td class="numero">${formattaValuta(f.saldo)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      ${obiettiviDaMostrare.length > 0 ? `
        <h2>Obiettivi</h2>
        <table>
          <thead><tr><th>Obiettivo</th><th class="numero">Partenza</th><th class="numero">Proiettato</th><th class="numero">Target</th></tr></thead>
          <tbody>
            ${obiettiviDaMostrare.map((o) => `
              <tr>
                <td>${mappaObiettiviAttuali.get(o.id)?.nome || '(eliminato)'}</td>
                <td class="numero">${formattaValuta(mappaObiettiviPartenza.get(o.id)?.saldoAccumulato)}</td>
                <td class="numero">${formattaValuta(o.saldoAccumulato)}</td>
                <td class="numero">${formattaValuta(mappaObiettiviAttuali.get(o.id)?.importoTarget)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
      ${movimentiManuali.length > 0 ? `
        <h2>Movimenti manuali</h2>
        <table>
          <thead><tr><th>Tipo</th><th>Quando</th><th class="numero">Importo</th><th>Destinazione</th><th>Note</th></tr></thead>
          <tbody>
            ${movimentiManuali.map((m) => `
              <tr>
                <td>${m.tipo === 'ripetitivo' ? 'Ripetitivo' : 'Singolo'}</td>
                <td>${m.tipo === 'ripetitivo' ? `ogni ${m.giornoMese}` : formattaData(m.data)}</td>
                <td class="numero">${m.importo >= 0 ? '+' : ''}${formattaValuta(m.importo)}</td>
                <td>${m.tipoDestinazione === 'obiettivo' ? 'Obiettivo: ' : 'Fondo: '}${nomeDestinazioneMovimento(m)}</td>
                <td>${m.descrizione || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </body>
    </html>
  `;

  const finestra = window.open('', '_blank');
  if (!finestra) { alert('Il browser ha bloccato l\'apertura della finestra di anteprima. Consenti i popup per questo sito.'); return; }
  finestra.document.write(html);
  finestra.document.close();
  finestra.focus();
  setTimeout(() => finestra.print(), 250);
}

// Riga di una tabella Fondi/Obiettivi con "Punto di partenza" modificabile (override simulato,
// specifico di questo Prospetto — mai il saldo reale). colonnaExtra, se fornita, sostituisce la
// quarta colonna calcolata di default (Differenza) con un contenuto diverso (es. Target per gli
// Obiettivi).
function renderRigaProiezione({ prospettoId, tipo, id, nome, attuale, partenza, proiettato, override, colonnaExtra }) {
  const chiave = `${tipo}:${id}`;
  const inModifica = righeInModificaPartenza.has(chiave);
  const diff = proiettato - partenza;
  const cellaQuarta = colonnaExtra !== undefined
    ? colonnaExtra
    : `<td class="numero" style="color:${diff >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">${diff >= 0 ? '+' : ''}${formattaValuta(diff)}</td>`;

  if (inModifica) {
    return `
      <tr>
        <td>${nome}</td>
        <td><input type="number" step="any" class="input-modifica-partenza" data-chiave="${chiave}" value="${partenza}" style="width:110px;"></td>
        <td class="numero">${formattaValuta(proiettato)}</td>
        ${colonnaExtra !== undefined ? colonnaExtra : '<td></td>'}
        <td>
          <div class="azioni-riga">
            <button class="btn-icona" title="Salva" data-azione="salva-partenza" data-chiave="${chiave}" data-tipo="${tipo}" data-id="${id}"><i class="fa-solid fa-check"></i></button>
            <button class="btn-icona" title="Annulla" data-azione="annulla-partenza" data-chiave="${chiave}"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </td>
      </tr>
    `;
  }

  return `
    <tr>
      <td>${nome}</td>
      <td class="numero">${formattaValuta(partenza)}${override ? ` <span class="nota-inline">(reale ${formattaValuta(attuale)})</span>` : ''}</td>
      <td class="numero">${formattaValuta(proiettato)}</td>
      ${cellaQuarta}
      <td>
        <div class="azioni-riga">
          <button class="btn-icona" title="Modifica punto di partenza" data-azione="modifica-partenza" data-chiave="${chiave}"><i class="fa-solid fa-pen"></i></button>
          ${override ? `<button class="btn-icona" title="Ripristina saldo reale" data-azione="reset-partenza" data-override-id="${override.id}"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function mostraFormAggiungiPartenza(zona, container, prospettoId, tipoElemento, elenco) {
  const formContainer = zona.querySelector(`#form-partenza-${tipoElemento}-${prospettoId}`);
  if (elenco.length === 0) {
    formContainer.innerHTML = `<p class="nota">Nessun ${tipoElemento === 'fondo' ? 'Fondo' : 'Obiettivo'} disponibile.</p>`;
    return;
  }

  formContainer.innerHTML = `
    <form class="form-scheda">
      <label>${tipoElemento === 'fondo' ? 'Fondo' : 'Obiettivo'}
        <select name="elementoId">
          ${elenco.map((el) => `<option value="${el.id}">${el.nome}</option>`).join('')}
        </select>
      </label>
      <label>Punto di partenza personalizzato (€)<input name="saldoIniziale" type="number" step="any" required></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva</button>
        <button type="button" id="btn-annulla-partenza-${tipoElemento}">Annulla</button>
      </div>
    </form>
  `;

  formContainer.querySelector(`#btn-annulla-partenza-${tipoElemento}`).addEventListener('click', () => {
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    try {
      await impostaSaldoPartenzaProspetto(prospettoId, tipoElemento, dati.elementoId, dati.saldoIniziale);
      formContainer.innerHTML = '';
      renderDettaglioProspetto(container, prospettoId);
    } catch (err) {
      alert(err.message);
    }
  });
}

async function renderRigaProspetto(p, mappaPiani, mappaProspetti) {
  const espanso = prospettoEspansoId === p.id;
  const pianoNome = p.pianoId ? (mappaPiani.get(p.pianoId)?.nome || '(Piano eliminato)') : '— (solo movimenti manuali)';
  const parteDa = p.prospettoOrigineId
    ? `Prospetto: ${mappaProspetti.get(p.prospettoOrigineId)?.nome || '(eliminato)'}`
    : `Oggi (${formattaData(p.dataInizio)})`;
  return `
    <tr>
      <td><input type="checkbox" class="checkbox-confronto" data-id="${p.id}" ${selezionatiConfronto.has(p.id) ? 'checked' : ''}></td>
      <td>${p.nome}${p.bloccato ? ' <span class="badge" style="background:#eee;" title="Bloccato: sblocca per modificarlo"><i class="fa-solid fa-lock"></i></span>' : ''}</td>
      <td>${pianoNome}</td>
      <td class="nota-inline">${parteDa}</td>
      <td>${descrizioneOrizzonte(p)}</td>
      <td class="numero">${formattaValuta(p.importoEntrataPerCiclo)}</td>
      <td>${formattaData(p.dataCreazione)}</td>
      <td style="white-space:nowrap;">
        <div class="azioni-riga" style="flex-wrap:nowrap;">
          <button class="btn-icona" title="Visualizza anteprima" data-azione="anteprima" data-id="${p.id}"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icona" title="${espanso ? 'Chiudi' : 'Proiezione'}" data-azione="espandi" data-id="${p.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button>
          <button class="btn-icona" title="${p.bloccato ? 'Bloccato: sblocca per modificare' : 'Modifica'}" data-azione="modifica" data-id="${p.id}" ${p.bloccato ? 'disabled' : ''}><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icona" title="Duplica (nuova copia indipendente, modificabile)" data-azione="duplica-prospetto" data-id="${p.id}"><i class="fa-solid fa-clone"></i></button>
          ${p.bloccato
            ? `<button class="btn-icona" title="Sblocca (rendi di nuovo modificabile)" data-azione="sblocca-prospetto" data-id="${p.id}"><i class="fa-solid fa-lock-open"></i></button>`
            : `<button class="btn-icona" title="Blocca (impedisce modifiche involontarie)" data-azione="blocca-prospetto" data-id="${p.id}"><i class="fa-solid fa-lock"></i></button>`}
          <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
    ${espanso ? `
      <tr>
        <td colspan="8" style="background:var(--colore-sfondo-soft);">
          <div id="dettaglio-prospetto-${p.id}"></div>
        </td>
      </tr>
    ` : ''}
  `;
}

async function renderDettaglioProspetto(container, prospettoId) {
  const zona = container.querySelector(`#dettaglio-prospetto-${prospettoId}`);
  if (!zona) return;

  let risultato;
  try {
    risultato = await calcolaProiezioneProspetto(prospettoId);
  } catch (err) {
    zona.innerHTML = `<p class="badge badge-errore">⚠️ ${err.message}</p>`;
    return;
  }

  const conti = await elencoConti();
  const mappaConti = new Map(conti.map((c) => [c.id, c]));

  const {
    fondiAttuali, fondiReali, fondiPartenza, fondiProiettati, obiettiviAttuali, obiettiviPartenza, obiettiviProiettati,
    numeroCicli, movimenti, overrideSaldi, baselineReale, budgetStimati, budgetStimatiDaPiano
  } = risultato;
  const mappaFondiAttuali = new Map(fondiAttuali.map((f) => [f.id, f]));
  const mappaObiettiviAttuali = new Map(obiettiviAttuali.map((o) => [o.id, o]));
  const mappaFondiPartenza = new Map(fondiPartenza.map((f) => [f.id, f]));
  const mappaObiettiviPartenza = new Map(obiettiviPartenza.map((o) => [o.id, o]));
  const mappaOverrideFondi = new Map(overrideSaldi.filter((e) => e.tipoElemento === 'fondo').map((e) => [e.elementoId, e]));
  const mappaOverrideObiettivi = new Map(overrideSaldi.filter((e) => e.tipoElemento === 'obiettivo').map((e) => [e.elementoId, e]));

  const nomeDestinazioneMovimento = (m) => m.tipoDestinazione === 'fondo'
    ? (mappaFondiAttuali.get(m.destinazioneId)?.nome || '(eliminato)')
    : (mappaObiettiviAttuali.get(m.destinazioneId)?.nome || '(eliminato)');

  const mostraTutti = mostraTuttiPerProspetto.has(prospettoId);

  // Di norma solo i Fondi/Obiettivi realmente coinvolti (saldo cambiato, o con un punto di
  // partenza personalizzato) — con "mostra tutti" attivo, l'intero elenco, come richiesto
  // dall'utente per poter vedere anche ciò che il Prospetto non tocca.
  const fondiDaMostrare = fondiProiettati.filter((f) => {
    if (mostraTutti) return mappaFondiPartenza.has(f.id);
    const partenza = mappaFondiPartenza.get(f.id);
    return partenza && (Math.abs(f.saldo - partenza.saldo) > 0.005 || mappaOverrideFondi.has(f.id));
  });
  const obiettiviDaMostrare = obiettiviProiettati.filter((o) => {
    if (mostraTutti) return mappaObiettiviPartenza.has(o.id);
    const partenza = mappaObiettiviPartenza.get(o.id);
    return partenza && (Math.abs(o.saldoAccumulato - partenza.saldoAccumulato) > 0.005 || mappaOverrideObiettivi.has(o.id));
  });

  // Situazione dei Conti a fine Prospetto. Saldo Conto previsto = quota reale del Conto che non
  // è dentro nessun Fondo (liquidità libera + Budget assegnato — sempre reale, mai simulata) +
  // somma dei Fondi proiettati. Se il Prospetto è concatenato, saldoPrecedente = la stessa cosa
  // ma con i Fondi di PARTENZA (fondiAttuali = ereditati dal Prospetto di origine) invece che
  // di arrivo: è il punto da cui parte questo specifico Prospetto, distinto dal saldo reale di
  // oggi — segnalato dall'utente: la Differenza deve dichiarare esplicitamente rispetto a quale
  // dei due si calcola.
  const contiProiettati = conti.map((c) => {
    const sommaFondiRealiOggi = fondiReali
      .filter((f) => f.contoId === c.id)
      .reduce((s, f) => s + f.saldo, 0);
    const liquiditaEBudgetReale = arrotonda(c.saldoReale - sommaFondiRealiOggi);
    const sommaFondiProiettatiFinale = fondiProiettati
      .filter((f) => mappaFondiAttuali.get(f.id)?.contoId === c.id)
      .reduce((s, f) => s + f.saldo, 0);
    const sommaFondiPartenza = fondiAttuali
      .filter((f) => f.contoId === c.id)
      .reduce((s, f) => s + f.saldo, 0);
    return {
      conto: c,
      proiettato: arrotonda(liquiditaEBudgetReale + sommaFondiProiettatiFinale),
      saldoPrecedente: arrotonda(liquiditaEBudgetReale + sommaFondiPartenza)
    };
  });
  const patrimonioTotaleProiettato = contiProiettati.reduce((s, x) => s + x.proiettato, 0);
  const patrimonioTotaleAttuale = conti.reduce((s, c) => s + c.saldoReale, 0);
  const patrimonioTotalePrecedente = contiProiettati.reduce((s, x) => s + x.saldoPrecedente, 0);

  zona.innerHTML = `
    <p class="nota">Proiezione su ${numeroCicli} cicli, dal ${formattaData(risultato.prospetto.dataInizio)} al ${formattaData(risultato.dataFineEffettiva)}${risultato.prospetto.pianoId ? `, entrata ipotizzata ${formattaValuta(risultato.prospetto.importoEntrataPerCiclo)}/ciclo` : ' (nessun Piano collegato)'}.${!baselineReale ? ' <i class="fa-solid fa-link"></i> Concatenato: parte dal risultato del Prospetto di origine.' : ''}</p>
    ${risultato.nonAllocatoLordo > 0.005 ? `
      <h4 style="margin-top:16px;">Non allocati dal Piano</h4>
      <p class="nota">Non sono un errore: sono la parte di entrata ipotizzata che il Piano collegato non assegna a nessuna destinazione — mai sparita, riallocabile con "Ridistribuisci" più sotto.</p>
      <table class="tabella">
        <thead><tr><th>Per ciclo</th><th>Cicli</th><th>Totale nel periodo</th><th>Ancora disponibili</th></tr></thead>
        <tbody>
          <tr>
            <td class="numero">${formattaValuta(risultato.nonAllocatoPerCiclo)}</td>
            <td class="numero">${numeroCicli}</td>
            <td class="numero">${formattaValuta(risultato.nonAllocatoLordo)}</td>
            <td class="numero ${risultato.nonAllocatoDisponibile > 0.005 ? 'testo-errore' : ''}">${formattaValuta(risultato.nonAllocatoDisponibile)}</td>
          </tr>
        </tbody>
      </table>
    ` : ''}
    <div class="azioni-riga" style="margin-bottom:8px; flex-wrap:nowrap; overflow-x:auto;">
      <button id="btn-mostra-tutti-${prospettoId}" style="white-space:nowrap;">
        <i class="fa-solid fa-eye"></i> ${mostraTutti ? 'Mostra solo i Fondi/Obiettivi coinvolti' : 'Mostra anche non coinvolti'}
      </button>
      <button id="btn-ricalcola-prospetto-${prospettoId}" style="white-space:nowrap;" title="Corregge i movimenti di Trasferisci/Ridistribuisci calcolati con versioni precedenti dell'app">
        <i class="fa-solid fa-rotate"></i> Ricalcola Prospetto
      </button>
      <button id="btn-stampa-prospetto-${prospettoId}" style="white-space:nowrap;"><i class="fa-solid fa-print"></i> Anteprima stampa / PDF</button>
    </div>

    <h4>Conti a fine Prospetto</h4>
    ${contiProiettati.length === 0 ? '<p class="nota">Nessun Conto presente.</p>' : `
      <table class="tabella">
        <thead><tr>
          <th>Conto</th>
          <th>Saldo attuale</th>
          ${!baselineReale ? '<th>Saldo Prospetto precedente</th>' : ''}
          <th>Patrimonio previsto</th>
          <th>Differenza (vs. ${baselineReale ? 'saldo attuale' : 'Prospetto precedente'})</th>
        </tr></thead>
        <tbody>
          ${contiProiettati.map(({ conto, proiettato, saldoPrecedente }) => {
            const diff = arrotonda(proiettato - (baselineReale ? conto.saldoReale : saldoPrecedente));
            return `
              <tr>
                <td>${conto.nome}</td>
                <td class="numero">${formattaValuta(conto.saldoReale)}</td>
                ${!baselineReale ? `<td class="numero">${formattaValuta(saldoPrecedente)}</td>` : ''}
                <td class="numero">${formattaValuta(proiettato)}</td>
                <td class="numero" style="color:${diff >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">${diff >= 0 ? '+' : ''}${formattaValuta(diff)}</td>
              </tr>
            `;
          }).join('')}
          <tr style="font-weight:600; border-top: 2px solid var(--colore-bordo-forte);">
            <td>Totale</td>
            <td class="numero">${formattaValuta(patrimonioTotaleAttuale)}</td>
            ${!baselineReale ? `<td class="numero">${formattaValuta(patrimonioTotalePrecedente)}</td>` : ''}
            <td class="numero">${formattaValuta(patrimonioTotaleProiettato)}</td>
            <td class="numero" style="color:${patrimonioTotaleProiettato - (baselineReale ? patrimonioTotaleAttuale : patrimonioTotalePrecedente) >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">
              ${patrimonioTotaleProiettato - (baselineReale ? patrimonioTotaleAttuale : patrimonioTotalePrecedente) >= 0 ? '+' : ''}${formattaValuta(patrimonioTotaleProiettato - (baselineReale ? patrimonioTotaleAttuale : patrimonioTotalePrecedente))}
            </td>
          </tr>
        </tbody>
      </table>
    `}

    <h4 style="margin-top:16px;">Andamento Budget (stima)</h4>
    <p class="nota">
      ${budgetStimatiDaPiano ? 'Importo per ciclo calcolato dal Piano collegato.' : 'Stima generica sull\'importo di default (nessun Piano collegato con Voci verso Budget).'}
    </p>
    ${budgetStimati.length === 0 ? '<p class="nota">Nessun Budget da mostrare.</p>' : `
      <table class="tabella">
        <thead><tr><th>Budget</th><th>Importo per ciclo</th><th>Cicli nel periodo</th><th>Totale impegnato</th></tr></thead>
        <tbody>
          ${budgetStimati.map(({ budget: b, totaleImpegnato }) => `
            <tr>
              <td>${b.nome}</td>
              <td class="numero">${formattaValuta(numeroCicli > 0 ? totaleImpegnato / numeroCicli : 0)}</td>
              <td>${numeroCicli}</td>
              <td class="numero">${formattaValuta(totaleImpegnato)}</td>
            </tr>
          `).join('')}
          <tr style="font-weight:600; border-top: 2px solid var(--colore-bordo-forte);">
            <td colspan="3">Totale impegnato su tutti i Budget${budgetStimatiDaPiano ? ' collegati al Piano' : ' attivi'}</td>
            <td class="numero">${formattaValuta(budgetStimati.reduce((s, x) => s + x.totaleImpegnato, 0))}</td>
          </tr>
        </tbody>
      </table>
    `}

    <h4 style="margin-top:16px;">Fondi</h4>
    <button id="btn-aggiungi-partenza-fondo-${prospettoId}" style="margin-bottom:8px;"><i class="fa-solid fa-plus"></i> Personalizza punto di partenza di un Fondo</button>
    ${fondiDaMostrare.length === 0 ? '<p class="nota">Nessun Fondo da mostrare.</p>' : `
      <table class="tabella">
        <thead><tr><th>Fondo</th><th>Punto di partenza</th><th>Saldo proiettato</th><th>Differenza</th><th></th></tr></thead>
        <tbody>
          ${fondiDaMostrare.map((f) => renderRigaProiezione({
            prospettoId, tipo: 'fondo', id: f.id,
            nome: mappaFondiAttuali.get(f.id)?.nome || '(eliminato)',
            attuale: mappaFondiAttuali.get(f.id)?.saldo,
            partenza: mappaFondiPartenza.get(f.id)?.saldo,
            proiettato: f.saldo,
            override: mappaOverrideFondi.get(f.id)
          })).join('')}
        </tbody>
      </table>
    `}
    <div id="form-partenza-fondo-${prospettoId}"></div>

    <h4 style="margin-top:16px;">Obiettivi</h4>
    <button id="btn-aggiungi-partenza-obiettivo-${prospettoId}" style="margin-bottom:8px;"><i class="fa-solid fa-plus"></i> Personalizza punto di partenza di un Obiettivo</button>
    ${obiettiviDaMostrare.length === 0 ? '<p class="nota">Nessun Obiettivo da mostrare.</p>' : `
      <table class="tabella">
        <thead><tr><th>Obiettivo</th><th>Punto di partenza</th><th>Accumulato proiettato</th><th>Target</th><th></th></tr></thead>
        <tbody>
          ${obiettiviDaMostrare.map((o) => renderRigaProiezione({
            prospettoId, tipo: 'obiettivo', id: o.id,
            nome: mappaObiettiviAttuali.get(o.id)?.nome || '(eliminato)',
            attuale: mappaObiettiviAttuali.get(o.id)?.saldoAccumulato,
            partenza: mappaObiettiviPartenza.get(o.id)?.saldoAccumulato,
            proiettato: o.saldoAccumulato,
            override: mappaOverrideObiettivi.get(o.id),
            colonnaExtra: `<td class="numero">${formattaValuta(mappaObiettiviAttuali.get(o.id)?.importoTarget)}</td>`
          })).join('')}
        </tbody>
      </table>
    `}
    <div id="form-partenza-obiettivo-${prospettoId}"></div>

    <h4 style="margin-top:16px;">Trasferisci o Ridistribuisci il risultato finale</h4>
    <div class="azioni-riga">
      <button id="btn-trasferisci-prospetto-${prospettoId}"><i class="fa-solid fa-arrow-right"></i> Trasferisci (una destinazione)</button>
      <button id="btn-ridistribuisci-prospetto-${prospettoId}"><i class="fa-solid fa-arrows-split-up-and-left"></i> Ridistribuisci (più destinazioni)</button>
    </div>
    <div id="form-trasferimento-${prospettoId}"></div>

    ${headerSezioneCollassabile('Movimenti manuali', `${prospettoId}:movimenti`)}
    <div id="corpo-movimenti-${prospettoId}"></div>

    ${headerSezioneCollassabile('Salute Finanziaria a fine Prospetto', `${prospettoId}:salute`)}
    <div id="salute-prospetto-${prospettoId}"></div>

    ${headerSezioneCollassabile('Grafici', `${prospettoId}:grafici`)}
    <div id="grafici-prospetto-${prospettoId}"></div>
  `;

  zona.querySelector(`#btn-ricalcola-prospetto-${prospettoId}`).addEventListener('click', async () => {
    if (!confirm(
      'Corregge i movimenti di Trasferisci/Ridistribuisci di questo Prospetto se calcolati con una versione precedente dell\'app (doppio conteggio sugli Obiettivi). Non tocca nient\'altro. Procedere?'
    )) return;
    try {
      const { righeCorrette, log } = await ricalcolaProspetto(prospettoId);
      console.log('Ricalcola Prospetto — dettaglio movimenti esaminati:', log);
      alert(righeCorrette > 0
        ? `Corretti ${righeCorrette} movimenti di Trasferisci/Ridistribuisci.`
        : 'Nessuna correzione necessaria: questo Prospetto era già corretto.');
      renderDettaglioProspetto(container, prospettoId);
    } catch (err) {
      alert(err.message);
    }
  });

  zona.querySelector(`#btn-stampa-prospetto-${prospettoId}`).addEventListener('click', () => {
    const movimentiManualiPuri = movimenti.filter((m) => m.descrizione !== DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE);
    apriAnteprimaStampa({
      prospetto: risultato.prospetto, numeroCicli, dataFineEffettiva: risultato.dataFineEffettiva,
      baselineReale, contiProiettati, patrimonioTotaleAttuale, patrimonioTotaleProiettato, patrimonioTotalePrecedente,
      budgetStimati, budgetStimatiDaPiano,
      fondiDaMostrare, obiettiviDaMostrare, mappaFondiAttuali, mappaFondiPartenza, mappaObiettiviAttuali, mappaObiettiviPartenza,
      movimentiManuali: movimentiManualiPuri, nomeDestinazioneMovimento,
      nonAllocatoLordo: risultato.nonAllocatoLordo, nonAllocatoDisponibile: risultato.nonAllocatoDisponibile
    });
  });

  zona.querySelector(`#btn-mostra-tutti-${prospettoId}`).addEventListener('click', () => {
    if (mostraTuttiPerProspetto.has(prospettoId)) mostraTuttiPerProspetto.delete(prospettoId);
    else mostraTuttiPerProspetto.add(prospettoId);
    renderDettaglioProspetto(container, prospettoId);
  });

  zona.querySelector(`#btn-trasferisci-prospetto-${prospettoId}`).addEventListener('click', () => {
    mostraFormTrasferimento[prospettoId] = mostraFormTrasferimento[prospettoId] === 'trasferisci' ? null : 'trasferisci';
    if (mostraFormTrasferimento[prospettoId]) {
      mostraFormTrasferisciProspetto(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, fondiProiettati, obiettiviProiettati, contiProiettati);
    } else {
      zona.querySelector(`#form-trasferimento-${prospettoId}`).innerHTML = '';
    }
  });
  zona.querySelector(`#btn-ridistribuisci-prospetto-${prospettoId}`).addEventListener('click', () => {
    mostraFormTrasferimento[prospettoId] = mostraFormTrasferimento[prospettoId] === 'ridistribuisci' ? null : 'ridistribuisci';
    if (mostraFormTrasferimento[prospettoId]) {
      mostraFormRidistribuisciProspetto(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, fondiProiettati, obiettiviProiettati, contiProiettati, risultato.nonAllocatoDisponibile);
    } else {
      zona.querySelector(`#form-trasferimento-${prospettoId}`).innerHTML = '';
    }
  });
  if (mostraFormTrasferimento[prospettoId] === 'trasferisci') {
    mostraFormTrasferisciProspetto(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, fondiProiettati, obiettiviProiettati, contiProiettati);
  } else if (mostraFormTrasferimento[prospettoId] === 'ridistribuisci') {
    mostraFormRidistribuisciProspetto(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, fondiProiettati, obiettiviProiettati, contiProiettati, risultato.nonAllocatoDisponibile);
  }
  // --- Punto di partenza personalizzato: modifica/salva/annulla/reset per riga già mostrata ---
  zona.querySelectorAll('button[data-azione="modifica-partenza"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      righeInModificaPartenza.add(btn.dataset.chiave);
      renderDettaglioProspetto(container, prospettoId);
    });
  });
  zona.querySelectorAll('button[data-azione="annulla-partenza"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      righeInModificaPartenza.delete(btn.dataset.chiave);
      renderDettaglioProspetto(container, prospettoId);
    });
  });
  zona.querySelectorAll('button[data-azione="salva-partenza"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const input = zona.querySelector(`.input-modifica-partenza[data-chiave="${btn.dataset.chiave}"]`);
      try {
        await impostaSaldoPartenzaProspetto(prospettoId, btn.dataset.tipo, btn.dataset.id, input.value);
        righeInModificaPartenza.delete(btn.dataset.chiave);
        renderDettaglioProspetto(container, prospettoId);
      } catch (err) {
        alert(err.message);
      }
    });
  });
  zona.querySelectorAll('button[data-azione="reset-partenza"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await rimuoviSaldoPartenzaProspetto(btn.dataset.overrideId);
      renderDettaglioProspetto(container, prospettoId);
    });
  });

  // --- Personalizza punto di partenza di un Fondo/Obiettivo non ancora mostrato in tabella ---
  zona.querySelector(`#btn-aggiungi-partenza-fondo-${prospettoId}`).addEventListener('click', () => {
    mostraFormAggiungiPartenza(zona, container, prospettoId, 'fondo', fondiAttuali);
  });
  zona.querySelector(`#btn-aggiungi-partenza-obiettivo-${prospettoId}`).addEventListener('click', () => {
    mostraFormAggiungiPartenza(zona, container, prospettoId, 'obiettivo', obiettiviAttuali);
  });

  zona.querySelectorAll('[data-azione="toggle-sezione"]').forEach((el) => {
    el.addEventListener('click', () => {
      const chiave = el.dataset.chiave;
      if (sezioniEspanse.has(chiave)) sezioniEspanse.delete(chiave);
      else sezioniEspanse.add(chiave);
      renderDettaglioProspetto(container, prospettoId);
    });
  });

  if (sezioniEspanse.has(`${prospettoId}:movimenti`)) {
    renderMovimentiManualiProspetto(zona, container, prospettoId, movimenti, fondiAttuali, obiettiviAttuali, nomeDestinazioneMovimento);
  }

  if (sezioniEspanse.has(`${prospettoId}:salute`)) {
    await renderSaluteFinanziariaProspetto(zona, container, prospettoId);
  }
  if (sezioniEspanse.has(`${prospettoId}:grafici`)) {
    await renderGraficiProspetto(zona, prospettoId);
  }
}

// Divide i movimenti di un Prospetto in tre categorie (punto UX richiesto dall'utente):
// - manuali: tutto ciò che l'utente ha inserito a mano (righe singole o distribuite su più
//   Obiettivi di un Fondo tramite aggiungiMovimentiProspettoMultipli — restano "manuali" anche
//   se in più righe, perché non generate da Trasferisci/Ridistribuisci);
// - trasferimenti: gruppi generati da trasferisciRidistribuisciProspetto con UNA sola
//   destinazione (drenaggio + eventuale riga "non allocato" + una riga di arrivo);
// - ridistribuzioni: stessa origine, ma con PIÙ di una destinazione.
// Il discriminante tra "manuale" e "Trasferisci/Ridistribuisci" è la descrizione fissa
// DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE; tra Trasferimento e Ridistribuzione è il numero di
// righe con importo positivo (destinazioni) all'interno dello stesso gruppoId.
function classificaMovimentiProspetto(movimenti) {
  const manuali = [];
  const gruppiSpeciali = new Map(); // gruppoId -> righe[]
  movimenti.forEach((m) => {
    if (m.descrizione === DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE) {
      const chiave = m.gruppoId || m.id;
      if (!gruppiSpeciali.has(chiave)) gruppiSpeciali.set(chiave, []);
      gruppiSpeciali.get(chiave).push(m);
    } else {
      manuali.push(m);
    }
  });
  const trasferimenti = [];
  const ridistribuzioni = [];
  gruppiSpeciali.forEach((righe, gruppoId) => {
    const numDestinazioni = righe.filter((r) => r.importo > 0).length;
    if (numDestinazioni <= 1) trasferimenti.push(...righe);
    else ridistribuzioni.push({ gruppoId, righe });
  });
  return { manuali, trasferimenti, ridistribuzioni };
}

// Riga di una tabella movimenti Prospetto (riusata da Movimenti Manuali, Trasferimenti e dentro
// ogni Ridistribuzione espansa) — stesso markup di sempre, solo estratto in funzione condivisa.
function rigaMovimentoProspettoHtml(m, righeStessoGruppo, nomeDestinazioneMovimento) {
  const primoDelGruppo = righeStessoGruppo[0]?.id === m.id;
  const etichettaDestinazione = m.tipoDestinazione === 'nonAllocato'
    ? 'Non allocato'
    : `${m.tipoDestinazione === 'obiettivo' ? 'Obiettivo: ' : 'Fondo: '}${nomeDestinazioneMovimento(m)}`;
  const nota = m.descrizione && m.descrizione !== DESCRIZIONE_TRASFERIMENTO_RIDISTRIBUZIONE ? m.descrizione : '—';
  return `
    <tr>
      <td>${m.tipo === 'ripetitivo' ? 'Ripetitivo' : 'Singolo'}</td>
      <td>${m.tipo === 'ripetitivo' ? `ogni ${m.giornoMese} del mese` : formattaData(m.data)}${m.fuoriOrizzonte ? ' <span class="badge badge-errore">fuori orizzonte</span>' : ''}</td>
      <td class="numero ${m.importo < 0 ? 'testo-errore' : ''}">${m.importo >= 0 ? '+' : ''}${formattaValuta(m.importo)}</td>
      <td>${etichettaDestinazione}${righeStessoGruppo.length > 1 ? ` <span class="nota-inline">(1 di ${righeStessoGruppo.length})</span>` : ''}</td>
      <td class="nota-inline">${nota}</td>
      <td>
        <div class="azioni-riga">
          <button class="btn-icona" title="Modifica questa riga" data-azione="modifica-movimento" data-id="${m.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icona" title="Elimina questa riga" data-azione="elimina-movimento" data-id="${m.id}"><i class="fa-solid fa-trash"></i></button>
          ${righeStessoGruppo.length > 1 && primoDelGruppo ? `<button class="btn-icona" title="Elimina l'intero gruppo" data-azione="elimina-gruppo-movimento" data-gruppo-id="${m.gruppoId || m.id}"><i class="fa-solid fa-trash-can-arrow-up"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function tabellaMovimentiProspettoHtml(righe, nomeDestinazioneMovimento, messaggioVuoto) {
  if (righe.length === 0) return `<p class="nota">${messaggioVuoto}</p>`;
  return `
    <table class="tabella">
      <thead><tr><th>Tipo</th><th>Quando</th><th>Importo</th><th>Destinazione</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${righe.map((m) => rigaMovimentoProspettoHtml(m, righe.filter((x) => (x.gruppoId || x.id) === (m.gruppoId || m.id)), nomeDestinazioneMovimento)).join('')}
      </tbody>
    </table>
  `;
}

// Sezione "Movimenti manuali" del dettaglio Prospetto: tre tab (Movimenti Manuali di default,
// Trasferimenti, Ridistribuzioni — quest'ultima con gruppi collassabili singolarmente, chiuso
// di default, nome "Ridistribuzione"). Auto-contenuta: gestisce qui tutta la wiring propria
// (cambio tab, apertura/chiusura di una Ridistribuzione, modifica/elimina riga o gruppo,
// aggiungi movimento) così da poter essere richiamata anche solo al cambio tab, senza dover
// ricalcolare l'intera proiezione del Prospetto.
function renderMovimentiManualiProspetto(zona, container, prospettoId, movimenti, fondiAttuali, obiettiviAttuali, nomeDestinazioneMovimento) {
  const corpo = zona.querySelector(`#corpo-movimenti-${prospettoId}`);
  if (!corpo) return;

  const tabAttiva = tabMovimentiPerProspetto[prospettoId] || 'manuali';
  const { manuali, trasferimenti, ridistribuzioni } = classificaMovimentiProspetto(movimenti);

  corpo.innerHTML = `
    <div class="barra-tab" role="tablist" style="margin-bottom:8px;">
      <button class="tab-btn ${tabAttiva === 'manuali' ? 'tab-btn-attiva' : ''}" type="button" data-azione="tab-movimenti-prospetto" data-tab="manuali">Movimenti Manuali (${manuali.length})</button>
      <button class="tab-btn ${tabAttiva === 'trasferimenti' ? 'tab-btn-attiva' : ''}" type="button" data-azione="tab-movimenti-prospetto" data-tab="trasferimenti">Trasferimenti (${trasferimenti.length})</button>
      <button class="tab-btn ${tabAttiva === 'ridistribuzioni' ? 'tab-btn-attiva' : ''}" type="button" data-azione="tab-movimenti-prospetto" data-tab="ridistribuzioni">Ridistribuzioni (${ridistribuzioni.length})</button>
    </div>
    <div id="corpo-tab-movimenti-${prospettoId}"></div>
    <button id="btn-nuovo-movimento-${prospettoId}" style="margin-top:8px;"><i class="fa-solid fa-plus"></i> Aggiungi movimento manuale</button>
    <div id="form-movimento-${prospettoId}"></div>
  `;

  const corpoTab = corpo.querySelector(`#corpo-tab-movimenti-${prospettoId}`);
  if (tabAttiva === 'manuali') {
    corpoTab.innerHTML = tabellaMovimentiProspettoHtml(manuali, nomeDestinazioneMovimento, 'Nessun movimento manuale aggiunto.');
  } else if (tabAttiva === 'trasferimenti') {
    corpoTab.innerHTML = tabellaMovimentiProspettoHtml(trasferimenti, nomeDestinazioneMovimento, 'Nessun Trasferimento registrato.');
  } else {
    corpoTab.innerHTML = ridistribuzioni.length === 0 ? '<p class="nota">Nessuna Ridistribuzione registrata.</p>' : ridistribuzioni.map(({ gruppoId, righe }) => {
      const espansa = gruppiRidistribuzioneEspansi.has(gruppoId);
      const totaleDistribuito = arrotonda(righe.filter((r) => r.importo > 0).reduce((s, r) => s + r.importo, 0));
      const numDestinazioni = righe.filter((r) => r.importo > 0).length;
      const dataGruppo = righe[0]?.data;
      return `
        <div class="pannello" style="margin-bottom:8px; box-shadow:none;">
          <h5 style="margin:0; cursor:pointer; display:flex; align-items:center; gap:8px;" data-azione="toggle-ridistribuzione" data-gruppo-id="${gruppoId}">
            <i class="fa-solid ${espansa ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
            Ridistribuzione${dataGruppo ? ` — ${formattaData(dataGruppo)}` : ''} — ${formattaValuta(totaleDistribuito)} distribuiti (${numDestinazioni} destinazioni)
          </h5>
          ${espansa ? tabellaMovimentiProspettoHtml(righe, nomeDestinazioneMovimento, 'Nessuna riga.') : ''}
        </div>
      `;
    }).join('');
  }

  corpo.querySelectorAll('button[data-azione="tab-movimenti-prospetto"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabMovimentiPerProspetto[prospettoId] = btn.dataset.tab;
      renderMovimentiManualiProspetto(zona, container, prospettoId, movimenti, fondiAttuali, obiettiviAttuali, nomeDestinazioneMovimento);
    });
  });
  corpo.querySelectorAll('[data-azione="toggle-ridistribuzione"]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.gruppoId;
      if (gruppiRidistribuzioneEspansi.has(id)) gruppiRidistribuzioneEspansi.delete(id);
      else gruppiRidistribuzioneEspansi.add(id);
      renderMovimentiManualiProspetto(zona, container, prospettoId, movimenti, fondiAttuali, obiettiviAttuali, nomeDestinazioneMovimento);
    });
  });

  corpo.querySelectorAll('button[data-azione="modifica-movimento"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      movimentoInModifica[prospettoId] = movimenti.find((m) => m.id === btn.dataset.id);
      mostraFormMovimento[prospettoId] = true;
      mostraFormNuovoMovimento(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, movimentoInModifica[prospettoId]);
    });
  });

  corpo.querySelectorAll('button[data-azione="elimina-movimento"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await eliminaMovimentoProspetto(btn.dataset.id);
      renderDettaglioProspetto(container, prospettoId);
    });
  });

  corpo.querySelectorAll('button[data-azione="elimina-gruppo-movimento"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Eliminare il gruppo?',
        messaggio: 'Eliminare l\'intero gruppo (tutte le righe create insieme)?',
        testoConferma: 'Elimina il gruppo',
        pericoloso: true
      });
      if (!ok) return;
      await eliminaGruppoMovimentiProspetto(btn.dataset.gruppoId);
      renderDettaglioProspetto(container, prospettoId);
    });
  });

  corpo.querySelector(`#btn-nuovo-movimento-${prospettoId}`).addEventListener('click', () => {
    movimentoInModifica[prospettoId] = null;
    mostraFormMovimento[prospettoId] = !mostraFormMovimento[prospettoId];
    if (mostraFormMovimento[prospettoId]) {
      mostraFormNuovoMovimento(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, null);
    } else {
      zona.querySelector(`#form-movimento-${prospettoId}`).innerHTML = '';
    }
  });
  if (mostraFormMovimento[prospettoId]) {
    mostraFormNuovoMovimento(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, movimentoInModifica[prospettoId]);
  }
}

let mostraFormVoceAutonomiaProspetto = {}; // prospettoId -> bool

async function renderSaluteFinanziariaProspetto(zona, container, prospettoId) {
  const contenitore = zona.querySelector(`#salute-prospetto-${prospettoId}`);
  let dati;
  try {
    dati = await calcolaSaluteFinanziariaProspetto(prospettoId);
  } catch (err) {
    contenitore.innerHTML = `<p class="badge badge-errore">⚠️ ${err.message}</p>`;
    return;
  }

  contenitore.innerHTML = `
    <div class="griglia-indicatori-salute">
      <div class="scheda-indicatore" style="grid-column: 1 / -1;">
        <h5 style="margin:0 0 6px;">Mesi di autonomia (Fondo Emergenza)</h5>
        ${dati.fondoEmergenzaEliminato ? '<p class="nota testo-errore">Il Fondo Emergenza designato è stato eliminato.</p>' : ''}
        ${dati.fondoEmergenza ? `
          <p class="valore-indicatore">${dati.mesiAutonomia !== null ? `${dati.mesiAutonomia} mesi` : '—'}</p>
          <p class="nota">${dati.fondoEmergenza.nome}: ${formattaValuta(dati.fondoEmergenza.saldo)} (proiettato) · spesa mensile stimata ${formattaValuta(dati.spesaMensileStimata)}</p>
        ` : '<p class="nota">Nessun Fondo Emergenza designato (Impostazioni → Salute Finanziaria).</p>'}
        <label style="max-width:320px; margin-top:8px;">Come calcolare la spesa mensile per questo Prospetto
          <select id="select-modalita-autonomia-${prospettoId}">
            <option value="eredita" ${dati.modalitaAutonomia === 'eredita' ? 'selected' : ''}>Eredita da Impostazioni</option>
            <option value="personalizzata" ${dati.modalitaAutonomia === 'personalizzata' ? 'selected' : ''}>Personalizza per questo Prospetto</option>
          </select>
        </label>
        <ul class="elenco-semplice" style="margin-top:8px;">
          ${dati.vociComposizione.length === 0 ? '<li class="nota">Nessuna voce.</li>' : dati.vociComposizione.map((v) => `
            <li>
              <span>${v.etichetta || 'Bundle Budget attivi'}</span>
              <span style="margin-left:auto;">${formattaValuta(v.importo)}</span>
              ${(dati.modalitaAutonomia === 'personalizzata' && v.tipo !== 'budgetBundle') ? `<button class="btn-icona" title="Rimuovi voce" data-azione="rimuovi-voce-prospetto" data-id="${v.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
            </li>
          `).join('')}
        </ul>
        ${dati.modalitaAutonomia === 'personalizzata' ? `
          <button id="btn-aggiungi-voce-autonomia-prospetto-${prospettoId}"><i class="fa-solid fa-plus"></i> Aggiungi voce</button>
          <div id="form-voce-autonomia-prospetto-${prospettoId}"></div>
        ` : ''}
      </div>

      <div class="scheda-indicatore">
        <h5 style="margin:0 0 6px;">Obiettivi finanziati</h5>
        <p class="valore-indicatore">${dati.percentualeObiettiviFinanziati !== null ? `${dati.percentualeObiettiviFinanziati}%` : '—'}</p>
        <p class="nota">${dati.numeroObiettiviTotali} Obiettivi monitorati, a fine Prospetto</p>
        <button id="btn-scegli-obiettivi-monitorati-${prospettoId}" ${dati.prospetto.bloccato ? 'disabled title="Prospetto bloccato: sblocca per modificare la selezione"' : ''}>
          <i class="fa-solid fa-sliders"></i> Scegli quali Obiettivi monitorare
        </button>
        <div id="form-obiettivi-monitorati-${prospettoId}"></div>
      </div>

      <div class="scheda-indicatore">
        <h5 style="margin:0 0 6px;">Obiettivi in ritardo</h5>
        <p class="valore-indicatore ${dati.obiettiviInRitardo.length > 0 ? 'testo-errore' : ''}">${dati.obiettiviInRitardo.length}</p>
        <p class="nota">Rispetto alla data fine del Prospetto</p>
      </div>

      <div class="scheda-indicatore">
        <h5 style="margin:0 0 6px;">Crescita patrimoniale (sull'orizzonte)</h5>
        <p class="valore-indicatore" style="color:${dati.crescitaPatrimoniale.crescitaAssoluta >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">
          ${dati.crescitaPatrimoniale.crescitaAssoluta >= 0 ? '+' : ''}${formattaValuta(dati.crescitaPatrimoniale.crescitaAssoluta)}
          ${dati.crescitaPatrimoniale.crescitaPercentuale !== null ? ` (${dati.crescitaPatrimoniale.crescitaPercentuale >= 0 ? '+' : ''}${dati.crescitaPatrimoniale.crescitaPercentuale}%)` : ''}
        </p>
      </div>
    </div>
  `;

  contenitore.querySelector(`#select-modalita-autonomia-${prospettoId}`).addEventListener('change', async (e) => {
    await impostaModalitaAutonomiaProspetto(prospettoId, e.target.value);
    renderSaluteFinanziariaProspetto(zona, container, prospettoId);
  });

  contenitore.querySelectorAll('button[data-azione="rimuovi-voce-prospetto"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await rimuoviVoceAutonomiaProspetto(btn.dataset.id);
      renderSaluteFinanziariaProspetto(zona, container, prospettoId);
    });
  });

  const btnAggiungi = contenitore.querySelector(`#btn-aggiungi-voce-autonomia-prospetto-${prospettoId}`);
  if (btnAggiungi) {
    btnAggiungi.addEventListener('click', () => {
      mostraFormVoceAutonomiaProspetto[prospettoId] = !mostraFormVoceAutonomiaProspetto[prospettoId];
      const formContainer = contenitore.querySelector(`#form-voce-autonomia-prospetto-${prospettoId}`);
      if (mostraFormVoceAutonomiaProspetto[prospettoId]) {
        mostraFormVoceAutonomiaProspetto_render(formContainer, zona, container, prospettoId, dati);
      } else {
        formContainer.innerHTML = '';
      }
    });
  }

  const btnScegliObiettivi = contenitore.querySelector(`#btn-scegli-obiettivi-monitorati-${prospettoId}`);
  if (btnScegliObiettivi) {
    btnScegliObiettivi.addEventListener('click', async () => {
      if (mostraFormObiettiviMonitorati.has(prospettoId)) {
        mostraFormObiettiviMonitorati.delete(prospettoId);
        contenitore.querySelector(`#form-obiettivi-monitorati-${prospettoId}`).innerHTML = '';
        return;
      }
      mostraFormObiettiviMonitorati.add(prospettoId);
      await renderFormObiettiviMonitoratiProspetto(contenitore, zona, container, prospettoId, dati);
    });
  }
  if (mostraFormObiettiviMonitorati.has(prospettoId)) {
    await renderFormObiettiviMonitoratiProspetto(contenitore, zona, container, prospettoId, dati);
  }
}

// Form "Scegli quali Obiettivi monitorare" (§ Salute Finanziaria del Prospetto): se il Prospetto
// ha già una selezione salvata (anche vuota) la si preselziona così com'è; altrimenti, se è
// collegato a un Piano, si preseleziona come default gli Obiettivi coinvolti dalle Voci di quel
// Piano (tipoDestinazione 'obiettivo'); se non è collegato a nessun Piano la selezione parte
// vuota, con un avviso esplicito (non un errore: è solo la condizione di partenza).
async function renderFormObiettiviMonitoratiProspetto(contenitore, zona, container, prospettoId, dati) {
  const formContainer = contenitore.querySelector(`#form-obiettivi-monitorati-${prospettoId}`);
  const obiettiviDisponibili = dati.obiettiviProiettati;
  const salvati = Array.isArray(dati.prospetto.obiettiviMonitorati) ? dati.prospetto.obiettiviMonitorati : null;

  let preselezionati;
  let avviso = '';
  if (salvati) {
    preselezionati = new Set(salvati);
  } else if (dati.prospetto.pianoId) {
    const vociPiano = await elencoVociPerPiano(dati.prospetto.pianoId);
    preselezionati = new Set(vociPiano.filter((v) => v.tipoDestinazione === 'obiettivo').map((v) => v.destinazioneId));
  } else {
    preselezionati = new Set();
    avviso = '<p class="badge badge-errore" style="display:block;">Questo Prospetto non è collegato a un Piano: la selezione parte vuota — scegli manualmente quali Obiettivi vuoi monitorare.</p>';
  }

  formContainer.innerHTML = `
    <div class="form-scheda" style="margin-top:8px;">
      <h5 style="margin:0 0 6px;">Scegli quali Obiettivi monitorare</h5>
      <p class="nota">Solo gli Obiettivi selezionati contano per "Obiettivi finanziati" e "Obiettivi in ritardo" di questo Prospetto.</p>
      ${avviso}
      ${obiettiviDisponibili.length === 0 ? '<p class="nota">Nessun Obiettivo proiettato da mostrare.</p>' : `
        <ul class="elenco-semplice">
          ${obiettiviDisponibili.map((o) => `
            <li>
              <label class="riga-checkbox">
                <input type="checkbox" class="checkbox-obiettivo-monitorato" value="${o.id}" ${preselezionati.has(o.id) ? 'checked' : ''}>
                ${o.nome}
              </label>
            </li>
          `).join('')}
        </ul>
      `}
      <div class="form-azioni">
        <button id="btn-salva-obiettivi-monitorati-${prospettoId}" class="btn-primario">Salva selezione</button>
        <button type="button" id="btn-annulla-obiettivi-monitorati-${prospettoId}">Annulla</button>
      </div>
    </div>
  `;

  formContainer.querySelector(`#btn-annulla-obiettivi-monitorati-${prospettoId}`).addEventListener('click', () => {
    mostraFormObiettiviMonitorati.delete(prospettoId);
    formContainer.innerHTML = '';
  });

  formContainer.querySelector(`#btn-salva-obiettivi-monitorati-${prospettoId}`).addEventListener('click', async () => {
    const selezionati = [...formContainer.querySelectorAll('.checkbox-obiettivo-monitorato:checked')].map((cb) => cb.value);
    try {
      await impostaObiettiviMonitoratiProspetto(prospettoId, selezionati);
      mostraFormObiettiviMonitorati.delete(prospettoId);
      renderSaluteFinanziariaProspetto(zona, container, prospettoId);
    } catch (err) {
      alert(err.message);
    }
  });
}

function mostraFormVoceAutonomiaProspetto_render(formContainer, zona, container, prospettoId, dati) {
  const fondiConObiettivi = dati.fondiProiettati.filter((f) => dati.obiettiviProiettati.some((o) => o.fondoId === f.id));

  formContainer.innerHTML = `
    <div class="form-scheda">
      <label>Tipo di voce
        <select id="select-tipo-voce-prospetto">
          <option value="pianoCollegato">Eredita i Budget del Piano collegato a questo Prospetto</option>
          <option value="budgetSingolo">Budget scelto liberamente</option>
          <option value="risparmioAnnuale">Risparmio annuale (obiettivo complessivo Fondo proiettato ÷ 12)</option>
          <option value="risparmioMensile">Risparmio mensile (importo a mano)</option>
        </select>
      </label>
      <div id="campi-voce-autonomia-prospetto"></div>
      <div class="form-azioni">
        <button id="btn-conferma-voce-autonomia-prospetto" class="btn-primario">Aggiungi</button>
      </div>
    </div>
  `;

  const selectTipo = formContainer.querySelector('#select-tipo-voce-prospetto');
  const campiContainer = formContainer.querySelector('#campi-voce-autonomia-prospetto');

  function renderCampi() {
    const tipo = selectTipo.value;
    if (tipo === 'pianoCollegato') {
      campiContainer.innerHTML = dati.prospetto.pianoId
        ? `<p class="nota">Userà i ${dati.budgetStimati.length} Budget del Piano collegato a questo Prospetto.</p>`
        : '<p class="nota testo-errore">Questo Prospetto non ha un Piano collegato: questa voce contribuirebbe 0€.</p>';
    } else if (tipo === 'budgetSingolo') {
      campiContainer.innerHTML = `<label>Budget<select id="campo-budget-id-prospetto">${dati.budgetDisponibili.map((b) => `<option value="${b.id}">${b.nome}</option>`).join('')}</select></label>`;
    } else if (tipo === 'risparmioAnnuale') {
      campiContainer.innerHTML = fondiConObiettivi.length === 0
        ? '<p class="nota">Nessun Fondo con Obiettivi disponibile.</p>'
        : `<label>Fondo<select id="campo-fondo-id-prospetto">${fondiConObiettivi.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('')}</select></label>`;
    } else {
      campiContainer.innerHTML = `
        <label>Fondo<select id="campo-fondo-id-prospetto">${dati.fondiProiettati.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('')}</select></label>
        <label>Importo mensile (€)<input type="number" step="any" id="campo-importo-prospetto"></label>
      `;
    }
  }
  selectTipo.addEventListener('change', renderCampi);
  renderCampi();

  formContainer.querySelector('#btn-conferma-voce-autonomia-prospetto').addEventListener('click', async () => {
    const tipo = selectTipo.value;
    try {
      if (tipo === 'pianoCollegato') {
        await aggiungiVoceAutonomiaProspetto(prospettoId, { tipo });
      } else if (tipo === 'budgetSingolo') {
        const budgetId = formContainer.querySelector('#campo-budget-id-prospetto')?.value;
        await aggiungiVoceAutonomiaProspetto(prospettoId, { tipo, budgetId });
      } else if (tipo === 'risparmioAnnuale') {
        const fondoId = formContainer.querySelector('#campo-fondo-id-prospetto')?.value;
        await aggiungiVoceAutonomiaProspetto(prospettoId, { tipo, fondoId });
      } else {
        const fondoId = formContainer.querySelector('#campo-fondo-id-prospetto')?.value;
        const importo = formContainer.querySelector('#campo-importo-prospetto')?.value;
        await aggiungiVoceAutonomiaProspetto(prospettoId, { tipo, fondoId, importo });
      }
      mostraFormVoceAutonomiaProspetto[prospettoId] = false;
      renderSaluteFinanziariaProspetto(zona, container, prospettoId);
    } catch (err) {
      alert(err.message);
    }
  });
}

const GRANULARITA_LABEL = {
  giorno: 'Giorno', settimana: 'Settimana', mese: 'Mese', trimestre: 'Trimestre',
  semestre: 'Semestre', anno: 'Anno', quinquennio: '5 anni'
};
const granularitaSceltaPerProspetto = {}; // prospettoId -> granularità

const finestraGraficoPerProspetto = {}; // prospettoId -> indice di inizio finestra
const puntoSelezionatoPerProspetto = {}; // prospettoId -> indice del punto cliccato (nella finestra corrente)
const DIMENSIONE_FINESTRA_GRAFICO = 12;

async function renderGraficiProspetto(zona, prospettoId) {
  const contenitore = zona.querySelector(`#grafici-prospetto-${prospettoId}`);
  const granularita = granularitaSceltaPerProspetto[prospettoId] || 'mese';

  contenitore.innerHTML = `
    <label style="max-width:220px; margin-bottom:8px;">Dettaglio
      <select id="select-granularita-grafico-${prospettoId}">
        ${Object.entries(GRANULARITA_LABEL).map(([val, label]) => `<option value="${val}" ${val === granularita ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    <div id="corpo-grafico-prospetto-${prospettoId}"><p class="nota">Calcolo in corso…</p></div>
  `;

  contenitore.querySelector(`#select-granularita-grafico-${prospettoId}`).addEventListener('change', (e) => {
    granularitaSceltaPerProspetto[prospettoId] = e.target.value;
    finestraGraficoPerProspetto[prospettoId] = 0;
    puntoSelezionatoPerProspetto[prospettoId] = null;
    renderGraficiProspetto(zona, prospettoId);
  });

  const corpo = contenitore.querySelector(`#corpo-grafico-prospetto-${prospettoId}`);
  let dati;
  try {
    dati = await calcolaTraiettoriaDettagliataProspetto(prospettoId, granularita);
  } catch (err) {
    corpo.innerHTML = `<p class="nota">Grafico non disponibile: ${err.message}</p>`;
    return;
  }

  const tuttiIPunti = dati.punti;
  if (!tuttiIPunti || tuttiIPunti.length === 0) {
    corpo.innerHTML = '<p class="nota">Nessun dato da mostrare.</p>';
    return;
  }

  // Finestra scorrevole: mostra al più DIMENSIONE_FINESTRA_GRAFICO periodi alla volta, con
  // frecce avanti/indietro per navigare — richiesto dall'utente per non affollare il grafico
  // con granularità fitte (es. settimana su un orizzonte di anni).
  const finestraMassima = Math.max(0, tuttiIPunti.length - DIMENSIONE_FINESTRA_GRAFICO);
  let inizioFinestra = finestraGraficoPerProspetto[prospettoId];
  if (inizioFinestra === undefined) inizioFinestra = finestraMassima; // parte mostrando gli ultimi periodi (i più recenti/rilevanti)
  inizioFinestra = Math.max(0, Math.min(inizioFinestra, finestraMassima));
  finestraGraficoPerProspetto[prospettoId] = inizioFinestra;
  const punti = tuttiIPunti.slice(inizioFinestra, inizioFinestra + DIMENSIONE_FINESTRA_GRAFICO);

  const larghezza = 720;
  const altezza = 320;
  const margine = { alto: 16, basso: 70, sinistra: 70, destra: 16 };
  const valori = punti.map((p) => p.valore);
  const minValore = Math.min(0, ...valori);
  const maxValore = Math.max(...valori, 1);

  // Con un solo punto (es. prima pagina di un Prospetto appena iniziato) lo si centra invece di
  // schiacciarlo a sinistra; con 2 o più punti occupano già tutta la larghezza disponibile.
  const x = (indice) => punti.length === 1
    ? margine.sinistra + (larghezza - margine.sinistra - margine.destra) / 2
    : margine.sinistra + (indice / (punti.length - 1)) * (larghezza - margine.sinistra - margine.destra);
  const y = (valore) => altezza - margine.basso - ((valore - minValore) / (maxValore - minValore || 1)) * (altezza - margine.alto - margine.basso);

  const numeroLinee = 4;
  const lineeGriglia = [];
  const etichetteY = [];
  for (let i = 0; i <= numeroLinee; i++) {
    const valore = minValore + ((maxValore - minValore) * i) / numeroLinee;
    const yPos = y(valore);
    lineeGriglia.push(`<line x1="${margine.sinistra}" y1="${yPos}" x2="${larghezza - margine.destra}" y2="${yPos}" stroke="var(--colore-sfondo-soft)" stroke-width="1"></line>`);
    etichetteY.push(`<text x="${margine.sinistra - 8}" y="${yPos + 3}" font-size="9" fill="var(--colore-testo-soft)" text-anchor="end">${formattaValuta(valore)}</text>`);
  }

  const puntoSelezionato = puntoSelezionatoPerProspetto[prospettoId];
  const puntiSvg = punti.map((p, i) => `${x(i)},${y(p.valore)}`).join(' ');
  const cerchi = punti.map((p, i) => `
    <circle cx="${x(i)}" cy="${y(p.valore)}" r="${i === puntoSelezionato ? 6 : 4}" fill="${i === puntoSelezionato ? 'var(--colore-avviso)' : 'var(--colore-operativita)'}"
      class="punto-grafico-prospetto" data-indice="${i}" data-etichetta="${p.etichetta}" data-inizio="${p.inizio}" data-fine="${p.fine}" data-valore="${p.valore}"
      style="cursor:pointer;"></circle>
  `).join('');
  // Più margine in basso ed etichette ruotate per non essere tagliate (segnalato dall'utente).
  const etichetteX = punti.map((p, i) => `
    <text x="${x(i)}" y="${altezza - margine.basso + 32}" font-size="9" fill="var(--colore-testo-soft)"
      text-anchor="end" transform="rotate(-40 ${x(i)} ${altezza - margine.basso + 32})">${p.etichetta}</text>
  `).join('');

  const eventiPuntoSelezionato = puntoSelezionato != null ? punti[puntoSelezionato] : null;

  corpo.innerHTML = `
    <p class="nota">Patrimonio totale in Fondi, con le date reali degli eventi (Piano e movimenti ripetitivi sul giorno del ciclo, movimenti singoli sulla loro data). Clicca un punto per vedere i movimenti del periodo.</p>
    <div class="azioni-riga" style="margin-bottom:6px;">
      <button id="btn-periodo-indietro-${prospettoId}" ${inizioFinestra <= 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Periodo precedente</button>
      <button id="btn-periodo-avanti-${prospettoId}" ${inizioFinestra >= finestraMassima ? 'disabled' : ''}>Periodo successivo <i class="fa-solid fa-chevron-right"></i></button>
      <span class="nota-inline">${punti[0]?.inizio ? formattaData(punti[0].inizio) : ''} — ${punti[punti.length - 1]?.fine ? formattaData(punti[punti.length - 1].fine) : ''}</span>
    </div>
    <div style="position:relative;">
      <svg viewBox="0 0 ${larghezza} ${altezza}" style="width:100%; height:auto;">
        ${lineeGriglia.join('')}
        ${etichetteY.join('')}
        <polyline points="${puntiSvg}" fill="none" stroke="var(--colore-operativita)" stroke-width="2"></polyline>
        ${cerchi}
        ${etichetteX}
      </svg>
      <div class="tooltip-grafico" id="tooltip-grafico-prospetto-${prospettoId}" style="display:none;"></div>
    </div>
    <div id="eventi-punto-grafico-${prospettoId}">
      ${eventiPuntoSelezionato ? `
        <div class="pannello" style="margin-top:10px; box-shadow:none; border-color:var(--colore-avviso);">
          <h5 style="margin:0 0 6px;">Movimenti dal ${formattaData(eventiPuntoSelezionato.inizio)} al ${formattaData(eventiPuntoSelezionato.fine)}</h5>
          ${eventiPuntoSelezionato.eventi.length === 0 ? '<p class="nota">Nessun movimento in questo periodo.</p>' : `
            <ul class="elenco-semplice">
              ${eventiPuntoSelezionato.eventi.map((ev) => `
                <li>
                  <span>${formattaData(ev.data)} — ${ev.nome}${ev.nota ? ` <span class="nota-inline">(${ev.nota})</span>` : ''}</span>
                  <span style="margin-left:auto; color:${ev.importo >= 0 ? 'var(--colore-patrimonio)' : 'var(--colore-avviso)'};">${ev.importo >= 0 ? '+' : ''}${formattaValuta(ev.importo)}</span>
                </li>
              `).join('')}
            </ul>
          `}
        </div>
      ` : ''}
    </div>
  `;

  corpo.querySelector(`#btn-periodo-indietro-${prospettoId}`).addEventListener('click', () => {
    finestraGraficoPerProspetto[prospettoId] = Math.max(0, inizioFinestra - DIMENSIONE_FINESTRA_GRAFICO);
    puntoSelezionatoPerProspetto[prospettoId] = null;
    renderGraficiProspetto(zona, prospettoId);
  });
  corpo.querySelector(`#btn-periodo-avanti-${prospettoId}`).addEventListener('click', () => {
    finestraGraficoPerProspetto[prospettoId] = Math.min(finestraMassima, inizioFinestra + DIMENSIONE_FINESTRA_GRAFICO);
    puntoSelezionatoPerProspetto[prospettoId] = null;
    renderGraficiProspetto(zona, prospettoId);
  });

  const tooltip = corpo.querySelector(`#tooltip-grafico-prospetto-${prospettoId}`);
  const svgWrapper = corpo.querySelector('div');
  corpo.querySelectorAll('.punto-grafico-prospetto').forEach((cerchio) => {
    cerchio.addEventListener('mouseenter', (e) => {
      const { inizio, fine, valore } = e.target.dataset;
      tooltip.textContent = `${formattaData(inizio)} – ${formattaData(fine)}: ${formattaValuta(Number(valore))}`;
      tooltip.style.display = 'block';
      posizionaTooltipProspetto(tooltip, e, svgWrapper);
    });
    cerchio.addEventListener('mousemove', (e) => posizionaTooltipProspetto(tooltip, e, svgWrapper));
    cerchio.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    cerchio.addEventListener('click', (e) => {
      const indice = Number(e.target.dataset.indice);
      puntoSelezionatoPerProspetto[prospettoId] = puntoSelezionatoPerProspetto[prospettoId] === indice ? null : indice;
      renderGraficiProspetto(zona, prospettoId);
    });
  });
}

function posizionaTooltipProspetto(tooltip, evento, wrapper) {
  const rect = wrapper.getBoundingClientRect();
  tooltip.style.left = `${evento.clientX - rect.left}px`;
  tooltip.style.top = `${evento.clientY - rect.top}px`;
}

function mostraFormNuovoMovimento(zona, container, prospettoId, fondi, obiettivi, movimentoEsistente) {
  const formContainer = zona.querySelector(`#form-movimento-${prospettoId}`);
  const obiettiviPerFondo = (fondoId) => obiettivi.filter((o) => o.fondoId === fondoId);
  const m = movimentoEsistente || {};

  // Stato locale della divisione Fondo->Obiettivi, vive solo per la durata di questo form aperto.
  const statoDivisione = { fondoId: fondi[0]?.id || null, obiettiviSelezionati: new Set(), importoTotale: 0, strategia: 'equa', valoriManuali: {} };

  formContainer.innerHTML = `
    <form class="form-scheda">
      <h4>${movimentoEsistente ? 'Modifica movimento manuale' : 'Nuovo movimento manuale'}</h4>
      <label>Tipo *
        <select name="tipo" required>
          <option value="ripetitivo" ${(!m.tipo || m.tipo === 'ripetitivo') ? 'selected' : ''}>Ripetitivo (ogni ciclo)</option>
          <option value="singolo" ${m.tipo === 'singolo' ? 'selected' : ''}>Singolo (una data precisa)</option>
        </select>
      </label>
      <label id="label-giorno-mese">Giorno del mese<input name="giornoMese" type="number" min="1" max="31" value="${m.giornoMese || 1}"></label>
      <label id="label-data-movimento" style="display:none;">Data<input name="data" type="date" value="${m.data ? m.data.slice(0, 10) : ''}"></label>
      <label>Note (facoltative)<input name="descrizione" placeholder="es. spesa auto, tredicesima..." value="${m.descrizione || ''}"></label>

      <label>Destinazione *
        <select name="modalitaDestinazione" required>
          <option value="obiettivo" ${(!m.tipoDestinazione || m.tipoDestinazione === 'obiettivo') ? 'selected' : ''}>Un Obiettivo</option>
          <option value="fondo" ${m.tipoDestinazione === 'fondo' ? 'selected' : ''}>Un Fondo (intero)</option>
          ${movimentoEsistente ? '' : '<option value="fondo-diviso">Un Fondo, diviso tra i suoi Obiettivi</option>'}
        </select>
      </label>

      <div id="blocco-destinazione-semplice">
        <select name="destinazioneId"></select>
        <label>Importo (€) * — positivo per un'entrata, negativo per un'uscita<input name="importo" type="number" step="any" value="${m.importo || ''}" required></label>
      </div>

      <div id="blocco-destinazione-fondo-diviso" style="display:none;"></div>

      <div class="form-azioni">
        <button type="submit" class="btn-primario">${movimentoEsistente ? 'Salva modifiche' : 'Aggiungi'}</button>
        <button type="button" id="btn-annulla-movimento">Annulla</button>
      </div>
    </form>
  `;

  const selectTipo = formContainer.querySelector('select[name="tipo"]');
  const aggiornaVisibilitaTipo = () => {
    const ripetitivo = selectTipo.value === 'ripetitivo';
    formContainer.querySelector('#label-giorno-mese').style.display = ripetitivo ? '' : 'none';
    formContainer.querySelector('#label-data-movimento').style.display = ripetitivo ? 'none' : '';
  };
  selectTipo.addEventListener('change', aggiornaVisibilitaTipo);
  aggiornaVisibilitaTipo();

  const selectModalita = formContainer.querySelector('select[name="modalitaDestinazione"]');
  const bloccoSemplice = formContainer.querySelector('#blocco-destinazione-semplice');
  const bloccoDiviso = formContainer.querySelector('#blocco-destinazione-fondo-diviso');
  const selectDestinazioneSemplice = bloccoSemplice.querySelector('select[name="destinazioneId"]');
  const inputImportoSemplice = bloccoSemplice.querySelector('input[name="importo"]');

  function aggiornaSelectSemplice() {
    const elenco = selectModalita.value === 'obiettivo' ? obiettivi : fondi;
    selectDestinazioneSemplice.innerHTML = elenco.map((el) => `<option value="${el.id}" ${m.destinazioneId === el.id ? 'selected' : ''}>${el.nome}</option>`).join('');
  }

  selectModalita.addEventListener('change', () => {
    const diviso = selectModalita.value === 'fondo-diviso';
    bloccoSemplice.style.display = diviso ? 'none' : '';
    bloccoDiviso.style.display = diviso ? '' : 'none';
    inputImportoSemplice.required = !diviso;
    if (diviso) {
      statoDivisione.fondoId = fondi[0]?.id || null;
      statoDivisione.obiettiviSelezionati = new Set(obiettiviPerFondo(statoDivisione.fondoId).map((o) => o.id));
      renderBloccoDivisione(bloccoDiviso, statoDivisione, fondi, obiettiviPerFondo);
    } else {
      aggiornaSelectSemplice();
    }
  });
  aggiornaSelectSemplice();

  formContainer.querySelector('#btn-annulla-movimento').addEventListener('click', () => {
    mostraFormMovimento[prospettoId] = false;
    movimentoInModifica[prospettoId] = null;
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target).entries());

    try {
      if (formData.modalitaDestinazione === 'fondo-diviso') {
        const obiettiviFondo = obiettiviPerFondo(statoDivisione.fondoId);
        const righe = calcolaRigheDivisione(obiettiviFondo, statoDivisione)
          .filter((r) => statoDivisione.obiettiviSelezionati.has(r.id))
          .map((r) => ({ tipoDestinazione: 'obiettivo', destinazioneId: r.id, importo: r.importo }));
        await aggiungiMovimentiProspettoMultipli(prospettoId, formData, righe);
      } else if (movimentoEsistente) {
        await aggiornaMovimentoProspetto(movimentoEsistente.id, {
          ...formData,
          tipoDestinazione: formData.modalitaDestinazione,
          destinazioneId: selectDestinazioneSemplice.value
        });
      } else {
        await aggiungiMovimentoProspetto(prospettoId, {
          ...formData,
          tipoDestinazione: formData.modalitaDestinazione,
          destinazioneId: selectDestinazioneSemplice.value
        });
      }
      mostraFormMovimento[prospettoId] = false;
      movimentoInModifica[prospettoId] = null;
      renderDettaglioProspetto(container, prospettoId);
    } catch (err) {
      alert(err.message);
    }
  });
}

// Calcola l'importo proposto per ciascun Obiettivo selezionato di un Fondo, secondo la
// strategia scelta — stesso linguaggio (Equa/Proporzionale/Manuale) già usato in Piano
// ("Collega Movimenti") e nei movimenti reali (Registra Entrata, Ridistribuisci).
function calcolaRigheDivisione(obiettiviFondo, stato) {
  const selezionati = obiettiviFondo.filter((o) => stato.obiettiviSelezionati.has(o.id));
  if (selezionati.length === 0) return [];

  if (stato.strategia === 'manuale') {
    return selezionati.map((o) => ({ id: o.id, importo: stato.valoriManuali[o.id] != null ? stato.valoriManuali[o.id] : 0 }));
  }
  if (stato.strategia === 'proporzionale') {
    try {
      return calcolaPropostaProporzionale(stato.importoTotale || 0, selezionati).map((r) => ({ id: r.destinazioneId, importo: r.importo }));
    } catch {
      return selezionati.map((o) => ({ id: o.id, importo: 0 }));
    }
  }
  try {
    return calcolaPropostaEqua(stato.importoTotale || 0, selezionati.map((o) => ({ id: o.id }))).map((r) => ({ id: r.id, importo: r.importo }));
  } catch {
    return selezionati.map((o) => ({ id: o.id, importo: 0 }));
  }
}

function renderBloccoDivisione(bloccoDiviso, stato, fondi, obiettiviPerFondo) {
  const obiettiviFondo = obiettiviPerFondo(stato.fondoId);

  bloccoDiviso.innerHTML = `
    <label>Fondo da dividere
      <select class="select-fondo-diviso">
        ${fondi.map((f) => `<option value="${f.id}" ${f.id === stato.fondoId ? 'selected' : ''}>${f.nome}</option>`).join('')}
      </select>
    </label>
    ${obiettiviFondo.length === 0 ? '<p class="nota">Questo Fondo non ha Obiettivi da dividere.</p>' : `
      <label>Importo totale da dividere (positivo o negativo)
        <input type="number" step="any" class="input-importo-totale-diviso" value="${stato.importoTotale || ''}">
      </label>
      <label>Strategia
        <select class="select-strategia-diviso">
          <option value="equa" ${stato.strategia === 'equa' ? 'selected' : ''}>Equa</option>
          <option value="proporzionale" ${stato.strategia === 'proporzionale' ? 'selected' : ''}>Proporzionale (per Importo Target)</option>
          <option value="manuale" ${stato.strategia === 'manuale' ? 'selected' : ''}>Manuale</option>
        </select>
      </label>
      <table class="tabella" style="margin-top:8px;">
        <thead><tr><th></th><th>Obiettivo</th><th>Importo</th></tr></thead>
        <tbody>
          ${obiettiviFondo.map((o) => `
            <tr>
              <td><input type="checkbox" class="checkbox-obiettivo-diviso" data-obiettivo-id="${o.id}" ${stato.obiettiviSelezionati.has(o.id) ? 'checked' : ''}></td>
              <td>${o.nome}</td>
              <td><input type="number" step="any" class="input-importo-obiettivo-diviso" data-obiettivo-id="${o.id}" value="0"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}
  `;

  bloccoDiviso.querySelector('.select-fondo-diviso').addEventListener('change', (e) => {
    stato.fondoId = e.target.value;
    stato.obiettiviSelezionati = new Set(obiettiviPerFondo(stato.fondoId).map((o) => o.id));
    stato.valoriManuali = {};
    renderBloccoDivisione(bloccoDiviso, stato, fondi, obiettiviPerFondo);
  });

  if (obiettiviFondo.length === 0) return;

  aggiornaValoriDivisione(bloccoDiviso, obiettiviFondo, stato);

  // Come nel form Collega Movimenti di Piano: l'input "Importo totale" NON ricostruisce il
  // blocco (perderebbe il focus a ogni carattere) — aggiorna solo i valori calcolati.
  bloccoDiviso.querySelector('.input-importo-totale-diviso').addEventListener('input', (e) => {
    stato.importoTotale = Number(e.target.value) || 0;
    aggiornaValoriDivisione(bloccoDiviso, obiettiviFondo, stato);
  });
  bloccoDiviso.querySelector('.select-strategia-diviso').addEventListener('change', (e) => {
    stato.strategia = e.target.value;
    renderBloccoDivisione(bloccoDiviso, stato, fondi, obiettiviPerFondo);
  });
  bloccoDiviso.querySelectorAll('.checkbox-obiettivo-diviso').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) stato.obiettiviSelezionati.add(cb.dataset.obiettivoId);
      else stato.obiettiviSelezionati.delete(cb.dataset.obiettivoId);
      renderBloccoDivisione(bloccoDiviso, stato, fondi, obiettiviPerFondo);
    });
  });
  bloccoDiviso.querySelectorAll('.input-importo-obiettivo-diviso').forEach((input) => {
    input.addEventListener('input', () => {
      stato.valoriManuali[input.dataset.obiettivoId] = Number(input.value) || 0;
    });
  });
}

function mostraFormTrasferisciProspetto(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, fondiProiettati, obiettiviProiettati, contiProiettati) {
  const formContainer = zona.querySelector(`#form-trasferimento-${prospettoId}`);

  // Il "proiettato" di un Conto come origine deve corrispondere ESATTAMENTE a quanto il
  // dominio preleva davvero (somma dei suoi Fondi proiettati) — non al saldo reale + variazione
  // mostrato nella sezione "Conti a fine Prospetto" (che include anche liquidità non allocata e
  // non è ciò che viene spostato qui). Erano due numeri diversi: causa del bug segnalato
  // dall'utente ("il Conto ha un saldo proiettato di 1000" quando in realtà erano 800).
  const contiOrigine = contiProiettati.map(({ conto }) => ({
    conto,
    proiettato: arrotonda(fondiProiettati
      .filter((f) => fondiAttuali.find((x) => x.id === f.id)?.contoId === conto.id)
      .reduce((s, f) => s + f.saldo, 0))
  }));

  const elementi = [
    ...contiOrigine.map(({ conto, proiettato }) => ({
      tipo: 'conto', id: conto.id, nome: `Conto (somma dei Fondi, esclusa liquidità non allocata): ${conto.nome}`, proiettato
    })),
    ...fondiAttuali.map((f) => ({
      tipo: 'fondo', id: f.id, nome: `Fondo: ${f.nome}`,
      proiettato: fondiProiettati.find((x) => x.id === f.id)?.saldo ?? f.saldo
    })),
    ...obiettiviAttuali.map((o) => ({
      tipo: 'obiettivo', id: o.id, nome: `Obiettivo: ${o.nome}`,
      proiettato: obiettiviProiettati.find((x) => x.id === o.id)?.saldoAccumulato ?? o.saldoAccumulato
    }))
  ];

  if (elementi.length === 0) {
    formContainer.innerHTML = '<p class="nota">Nessun Conto, Fondo o Obiettivo disponibile.</p>';
    return;
  }

  // Con origine 'conto' l'importo è sempre il saldo previsto del Conto (non modificabile): deve
  // corrispondere esattamente a quanto viene prelevato per intero da ciascuno dei suoi Fondi.
  const statoWizard = { origineChiave: `${elementi[0].tipo}:${elementi[0].id}` };

  formContainer.innerHTML = `
    <form class="form-scheda">
      <h4>Trasferisci il risultato finale</h4>
      <label>Da (saldo finale proiettato)
        <select class="select-origine-trasferimento">
          ${elementi.map((el) => `<option value="${el.tipo}:${el.id}">${el.nome} — ${formattaValuta(el.proiettato)}</option>`).join('')}
        </select>
      </label>
      <div class="blocco-destinazioni-trasferimento"></div>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Conferma</button>
        <button type="button" class="btn-annulla-trasferimento">Annulla</button>
      </div>
    </form>
  `;

  const selectOrigine = formContainer.querySelector('.select-origine-trasferimento');
  const bloccoDestinazioni = formContainer.querySelector('.blocco-destinazioni-trasferimento');

  function origineCorrente() {
    return elementi.find((el) => `${el.tipo}:${el.id}` === statoWizard.origineChiave);
  }
  function elementiDestinazionePossibili() {
    return elementi.filter((el) => el.tipo !== 'conto' && `${el.tipo}:${el.id}` !== statoWizard.origineChiave);
  }

  function renderBloccoDestinazioni() {
    const possibili = elementiDestinazionePossibili();
    const origine = origineCorrente();
    const importoOrigine = origine ? origine.proiettato : 0;
    const bloccatoAlSaldoConto = origine && origine.tipo === 'conto';
    bloccoDestinazioni.innerHTML = `
      <label>A
        <select class="select-destinazione-singola">
          ${possibili.map((el) => `<option value="${el.tipo}:${el.id}">${el.nome}</option>`).join('')}
        </select>
      </label>
      <label>Importo (€)<input type="number" step="any" class="input-importo-singolo" value="${importoOrigine}" ${bloccatoAlSaldoConto ? 'disabled' : ''}></label>
      ${bloccatoAlSaldoConto ? '<p class="nota-inline">Origine un Conto: si trasferisce sempre il suo intero saldo previsto.</p>' : ''}
    `;
  }

  selectOrigine.addEventListener('change', () => {
    statoWizard.origineChiave = selectOrigine.value;
    renderBloccoDestinazioni();
  });
  renderBloccoDestinazioni();

  formContainer.querySelector('.btn-annulla-trasferimento').addEventListener('click', () => {
    mostraFormTrasferimento[prospettoId] = null;
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const [origineTipo, origineId] = statoWizard.origineChiave.split(':');
    const selectDest = bloccoDestinazioni.querySelector('.select-destinazione-singola');
    const inputImporto = bloccoDestinazioni.querySelector('.input-importo-singolo');
    if (!selectDest || !selectDest.value) { alert('Seleziona una destinazione.'); return; }
    const [destTipo, destId] = selectDest.value.split(':');
    const destinazioni = [{ tipo: destTipo, id: destId, importo: Number(inputImporto.value) }];

    try {
      await trasferisciRidistribuisciProspetto(prospettoId, { origineTipo, origineId, destinazioni });
      mostraFormTrasferimento[prospettoId] = null;
      renderDettaglioProspetto(container, prospettoId);
    } catch (err) {
      alert(err.message);
    }
  });
}

// Ridistribuzione gerarchica: prima si ripartisce il totale tra i Fondi (livello 1), poi per
// ciascun Fondo si può (facoltativamente) scendere di un livello e ripartire la SUA quota tra i
// suoi Obiettivi — mai un elenco piatto Fondi+Obiettivi mescolati insieme, segnalato
// dall'utente: "non ha senso ridistribuire equamente tra un Fondo e un suo Obiettivo, non sono
// allo stesso livello". Stessa grafica di "Ridistribuisci Liquidità" in Dashboard: riga per
// Fondo con importo modificabile ed espansione verso i suoi Obiettivi, eventi 'change' (non
// 'input') per non perdere il focus ricostruendo l'HTML ad ogni carattere digitato.
function mostraFormRidistribuisciProspetto(zona, container, prospettoId, fondiAttuali, obiettiviAttuali, fondiProiettati, obiettiviProiettati, contiProiettati, nonAllocatoDisponibile) {
  const formContainer = zona.querySelector(`#form-trasferimento-${prospettoId}`);

  // Vedi nota identica in mostraFormTrasferisciProspetto: il "proiettato" di un Conto come
  // origine deve corrispondere a quanto il dominio preleva davvero (somma dei suoi Fondi
  // proiettati), non al saldo reale + variazione (che include liquidità non allocata).
  const contiOrigine = contiProiettati.map(({ conto }) => ({
    conto,
    proiettato: arrotonda(fondiProiettati
      .filter((f) => fondiAttuali.find((x) => x.id === f.id)?.contoId === conto.id)
      .reduce((s, f) => s + f.saldo, 0))
  }));

  const origini = [
    ...contiOrigine.map(({ conto, proiettato }) => ({ tipo: 'conto', id: conto.id, nome: `Conto (somma dei Fondi, esclusa liquidità non allocata): ${conto.nome}`, proiettato })),
    ...fondiAttuali.map((f) => ({ tipo: 'fondo', id: f.id, nome: `Fondo: ${f.nome}`, proiettato: fondiProiettati.find((x) => x.id === f.id)?.saldo ?? f.saldo })),
    ...obiettiviAttuali.map((o) => ({ tipo: 'obiettivo', id: o.id, nome: `Obiettivo: ${o.nome}`, proiettato: obiettiviProiettati.find((x) => x.id === o.id)?.saldoAccumulato ?? o.saldoAccumulato }))
  ];
  if (origini.length === 0) {
    formContainer.innerHTML = '<p class="nota">Nessun Conto, Fondo o Obiettivo disponibile.</p>';
    return;
  }

  const obiettiviDelFondo = (fondoId) => obiettiviAttuali.filter((o) => o.fondoId === fondoId);

  const s = { origineChiave: `${origini[0].tipo}:${origini[0].id}`, importoTotale: origini[0].proiettato, righeFondi: [], usaNonAllocato: false };

  function origineCorrente() {
    return origini.find((o) => `${o.tipo}:${o.id}` === s.origineChiave);
  }

  function ricostruisciRigheFondi() {
    const origine = origineCorrente();
    // Il Fondo origine può comparire anche come destinazione (utile per "tieni una quota qui,
    // sposta il resto altrove" in un'unica Ridistribuzione): il drenaggio ora gestisce
    // correttamente anche i prelievi parziali, quindi non serve più escluderlo.
    s.righeFondi = fondiAttuali
      .map((f) => ({
        fondoId: f.id, nome: f.nome, nuovo: 0, espanso: false,
        // Divisione verso gli Obiettivi di QUESTO Fondo: stessa struttura/logica già usata per
        // "Fondo diviso tra Obiettivi" altrove nel Prospetto — riusa calcolaRigheDivisione.
        divisione: { obiettiviSelezionati: new Set(), importoTotale: 0, strategia: 'equa', valoriManuali: {} }
      }));
    if (origine && origine.tipo === 'conto') s.importoTotale = origine.proiettato;
  }
  ricostruisciRigheFondi();

  function renderForm() {
    const origine = origineCorrente();
    const bloccatoAlSaldoConto = origine && origine.tipo === 'conto';
    const extraNonAllocato = s.usaNonAllocato ? nonAllocatoDisponibile : 0;
    if (bloccatoAlSaldoConto) s.importoTotale = arrotonda(origine.proiettato + extraNonAllocato);

    const totaleAssegnato = arrotonda(s.righeFondi.reduce((sum, r) => sum + (Number(r.nuovo) || 0), 0));
    const residuo = arrotonda(s.importoTotale - totaleAssegnato);
    const valido = Math.abs(residuo) < 0.005 && s.righeFondi.length > 0;

    formContainer.innerHTML = `
      <form class="form-scheda" style="max-width:760px;">
        <h4>Ridistribuisci il risultato finale</h4>
        <label>Da (saldo finale proiettato)
          <select class="select-origine-ridistr">
            ${origini.map((o) => `<option value="${o.tipo}:${o.id}" ${`${o.tipo}:${o.id}` === s.origineChiave ? 'selected' : ''}>${o.nome} — ${formattaValuta(o.proiettato)}</option>`).join('')}
          </select>
        </label>
        ${nonAllocatoDisponibile > 0.005 ? `
          <label class="riga-checkbox">
            <input type="checkbox" class="checkbox-usa-non-allocato" ${s.usaNonAllocato ? 'checked' : ''}>
            Distribuisci anche i non allocati (${formattaValuta(nonAllocatoDisponibile)})
          </label>
        ` : ''}
        <label>Importo totale da ridistribuire (€)
          <input type="number" step="any" class="input-importo-totale-ridistr" value="${s.importoTotale}" ${bloccatoAlSaldoConto ? 'disabled' : ''}>
        </label>
        ${bloccatoAlSaldoConto ? '<p class="nota-inline">Origine un Conto: l\'importo totale coincide sempre col suo saldo previsto (+ i non allocati, se inclusi).</p>' : ''}

        ${s.righeFondi.length === 0 ? '<p class="nota">Nessun altro Fondo disponibile come destinazione.</p>' : `
          <p class="nota-inline">Scorciatoie per i Fondi:</p>
          <div class="form-azioni" style="margin-bottom:10px;">
            <button type="button" class="btn-equa-fondi-ridistr">Equamente</button>
          </div>
          ${s.righeFondi.map((r, i) => renderRigaFondoRidistribuzione(r, i)).join('')}
          <p class="${valido ? '' : 'testo-errore'}" style="margin-top:8px;">
            Assegnato ai Fondi: ${formattaValuta(totaleAssegnato)} / Totale da ridistribuire: ${formattaValuta(s.importoTotale)}
            ${valido ? '' : ` — differenza di ${formattaValuta(residuo)}: la somma deve coincidere esattamente`}
          </p>
        `}

        <div class="form-azioni">
          <button type="submit" class="btn-primario" ${valido ? '' : 'disabled'}>Conferma</button>
          <button type="button" class="btn-annulla-trasferimento">Annulla</button>
        </div>
      </form>
    `;

    collegaEventiForm();
  }

  function renderRigaFondoRidistribuzione(r, i) {
    const obDelFondo = obiettiviDelFondo(r.fondoId);
    let blocchettoObiettivi = '';
    if (r.espanso) {
      if (obDelFondo.length === 0) {
        blocchettoObiettivi = '<p class="nota">Questo Fondo non ha Obiettivi.</p>';
      } else {
        r.divisione.importoTotale = Number(r.nuovo) || 0;
        const righeCalcolate = calcolaRigheDivisione(obDelFondo, r.divisione);
        const totaleObiettivi = arrotonda(obDelFondo.reduce((sum, o) => sum + (r.divisione.obiettiviSelezionati.has(o.id) ? (righeCalcolate.find((x) => x.id === o.id)?.importo || 0) : 0), 0));
        const nonAssegnato = arrotonda((Number(r.nuovo) || 0) - totaleObiettivi);
        blocchettoObiettivi = `
          <p class="nota-inline">Dividi la quota di questo Fondo (${formattaValuta(r.nuovo)}) tra i suoi Obiettivi (facoltativo — quanto non assegni resta al Fondo):</p>
          <div class="azioni-riga" style="margin-bottom:6px;">
            <button type="button" class="btn-seleziona-tutti-obiettivi" data-i="${i}">Seleziona tutti</button>
            <button type="button" class="btn-deseleziona-tutti-obiettivi" data-i="${i}">Deseleziona tutti</button>
          </div>
          <label>Strategia
            <select class="select-strategia-obiettivi-ridistr" data-i="${i}">
              <option value="equa" ${r.divisione.strategia === 'equa' ? 'selected' : ''}>Equa</option>
              <option value="proporzionale" ${r.divisione.strategia === 'proporzionale' ? 'selected' : ''}>Proporzionale (per Target)</option>
              <option value="manuale" ${r.divisione.strategia === 'manuale' ? 'selected' : ''}>Manuale</option>
            </select>
          </label>
          <table class="tabella" style="margin-top:6px;">
            <thead><tr><th></th><th>Obiettivo</th><th>Importo</th></tr></thead>
            <tbody>
              ${obDelFondo.map((o) => {
                const riga = righeCalcolate.find((x) => x.id === o.id);
                const selezionato = r.divisione.obiettiviSelezionati.has(o.id);
                return `
                  <tr>
                    <td><input type="checkbox" class="checkbox-obiettivo-ridistr" data-i="${i}" data-obiettivo-id="${o.id}" ${selezionato ? 'checked' : ''}></td>
                    <td>${o.nome}</td>
                    <td><input type="number" step="any" class="input-obiettivo-ridistr" data-i="${i}" data-obiettivo-id="${o.id}" value="${riga ? riga.importo : 0}" ${r.divisione.strategia !== 'manuale' || !selezionato ? 'disabled' : ''}></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <p class="nota-inline ${nonAssegnato < -0.005 ? 'testo-errore' : ''}">
            Assegnato agli Obiettivi: ${formattaValuta(totaleObiettivi)} / Quota del Fondo: ${formattaValuta(r.nuovo)} —
            resta al Fondo: ${formattaValuta(nonAssegnato)}${nonAssegnato < -0.005 ? ' (superi la quota del Fondo)' : ''}
          </p>
        `;
      }
    }
    return `
      <div class="riga-obiettivo" style="border-bottom:1px solid var(--colore-bordo);">
        <div style="display:flex; align-items:center; gap:12px;">
          <strong style="min-width:160px;">${r.nome}</strong>
          <input type="number" step="any" data-i="${i}" class="input-nuovo-fondo-ridistr" value="${r.nuovo}" style="width:110px;">
          ${obDelFondo.length > 0 ? `<button type="button" data-azione="espandi-fondo-ridistr" data-i="${i}" style="margin-left:auto;">${r.espanso ? 'Chiudi' : 'Obiettivi'}</button>` : ''}
        </div>
        ${r.espanso ? `<div style="margin-top:10px;">${blocchettoObiettivi}</div>` : ''}
      </div>
    `;
  }

  function collegaEventiForm() {
    formContainer.querySelector('.select-origine-ridistr').addEventListener('change', (e) => {
      s.origineChiave = e.target.value;
      ricostruisciRigheFondi();
      renderForm();
    });
    const checkboxNonAllocato = formContainer.querySelector('.checkbox-usa-non-allocato');
    if (checkboxNonAllocato) {
      checkboxNonAllocato.addEventListener('change', (e) => {
        const origineAttuale = origineCorrente();
        if (!(origineAttuale && origineAttuale.tipo === 'conto')) {
          // Origine Fondo/Obiettivo (importoTotale editabile): sommo/sottraggo una tantum,
          // l'utente resta libero di aggiustarlo ulteriormente.
          s.importoTotale = arrotonda(s.importoTotale + (e.target.checked ? nonAllocatoDisponibile : -nonAllocatoDisponibile));
        }
        s.usaNonAllocato = e.target.checked;
        renderForm();
      });
    }
    const inputTotale = formContainer.querySelector('.input-importo-totale-ridistr');
    if (inputTotale && !inputTotale.disabled) {
      inputTotale.addEventListener('change', (e) => {
        s.importoTotale = Number(e.target.value) || 0;
        renderForm();
      });
    }
    const btnEqua = formContainer.querySelector('.btn-equa-fondi-ridistr');
    if (btnEqua) {
      btnEqua.addEventListener('click', () => {
        try {
          const proposta = calcolaPropostaEqua(s.importoTotale, s.righeFondi.map((r) => ({ fondoId: r.fondoId })));
          proposta.forEach((p, i) => { s.righeFondi[i].nuovo = p.importo; });
          renderForm();
        } catch (err) { alert(err.message); }
      });
    }
    formContainer.querySelectorAll('.input-nuovo-fondo-ridistr').forEach((input) => {
      input.addEventListener('change', () => {
        s.righeFondi[Number(input.dataset.i)].nuovo = Number(input.value) || 0;
        renderForm();
      });
    });
    formContainer.querySelectorAll('button[data-azione="espandi-fondo-ridistr"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = s.righeFondi[Number(btn.dataset.i)];
        r.espanso = !r.espanso;
        renderForm();
      });
    });
    formContainer.querySelectorAll('.select-strategia-obiettivi-ridistr').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        s.righeFondi[Number(sel.dataset.i)].divisione.strategia = e.target.value;
        renderForm();
      });
    });
    formContainer.querySelectorAll('.checkbox-obiettivo-ridistr').forEach((cb) => {
      cb.addEventListener('change', () => {
        const div = s.righeFondi[Number(cb.dataset.i)].divisione;
        if (cb.checked) div.obiettiviSelezionati.add(cb.dataset.obiettivoId);
        else div.obiettiviSelezionati.delete(cb.dataset.obiettivoId);
        renderForm();
      });
    });
    formContainer.querySelectorAll('.btn-seleziona-tutti-obiettivi').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = s.righeFondi[Number(btn.dataset.i)];
        obiettiviDelFondo(r.fondoId).forEach((o) => r.divisione.obiettiviSelezionati.add(o.id));
        renderForm();
      });
    });
    formContainer.querySelectorAll('.btn-deseleziona-tutti-obiettivi').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = s.righeFondi[Number(btn.dataset.i)];
        r.divisione.obiettiviSelezionati.clear();
        renderForm();
      });
    });
    formContainer.querySelectorAll('.input-obiettivo-ridistr').forEach((input) => {
      input.addEventListener('change', () => {
        const r = s.righeFondi[Number(input.dataset.i)];
        r.divisione.valoriManuali[input.dataset.obiettivoId] = Number(input.value) || 0;
        renderForm();
      });
    });
    formContainer.querySelector('.btn-annulla-trasferimento').addEventListener('click', () => {
      mostraFormTrasferimento[prospettoId] = null;
      formContainer.innerHTML = '';
    });
    formContainer.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const [origineTipo, origineId] = s.origineChiave.split(':');

      const destinazioni = [];
      for (const r of s.righeFondi) {
        const obDelFondo = obiettiviDelFondo(r.fondoId);
        const selezionati = obDelFondo.filter((o) => r.divisione.obiettiviSelezionati.has(o.id));
        if (selezionati.length === 0) {
          if (Math.abs(r.nuovo) > 0.005) destinazioni.push({ tipo: 'fondo', id: r.fondoId, importo: Number(r.nuovo) });
          continue;
        }
        r.divisione.importoTotale = Number(r.nuovo) || 0;
        const righeCalcolate = calcolaRigheDivisione(obDelFondo, r.divisione).filter((x) => r.divisione.obiettiviSelezionati.has(x.id));
        let assegnatoObiettivi = 0;
        righeCalcolate.forEach((riga) => {
          if (Math.abs(riga.importo) > 0.005) {
            destinazioni.push({ tipo: 'obiettivo', id: riga.id, importo: riga.importo });
            assegnatoObiettivi += riga.importo;
          }
        });
        const restoAlFondo = arrotonda(Number(r.nuovo) - assegnatoObiettivi);
        if (Math.abs(restoAlFondo) > 0.005) destinazioni.push({ tipo: 'fondo', id: r.fondoId, importo: restoAlFondo });
      }

      try {
        await trasferisciRidistribuisciProspetto(prospettoId, {
          origineTipo, origineId, destinazioni,
          nonAllocatoUsato: s.usaNonAllocato ? nonAllocatoDisponibile : 0
        });
        mostraFormTrasferimento[prospettoId] = null;
        renderDettaglioProspetto(container, prospettoId);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  renderForm();
}

function aggiornaValoriDivisione(bloccoDiviso, obiettiviFondo, stato) {
  const righe = calcolaRigheDivisione(obiettiviFondo, stato);
  obiettiviFondo.forEach((o) => {
    const input = bloccoDiviso.querySelector(`.input-importo-obiettivo-diviso[data-obiettivo-id="${o.id}"]`);
    if (!input) return;
    const selezionato = stato.obiettiviSelezionati.has(o.id);
    input.disabled = stato.strategia !== 'manuale' || !selezionato;
    if (stato.strategia !== 'manuale') {
      const riga = righe.find((r) => r.id === o.id);
      input.value = riga ? riga.importo : 0;
    }
  });
}

async function renderConfronto(container, prospettiCompleti, mappaPiani) {
  const zona = container.querySelector('#confronto-container');
  if (!mostraConfronto || selezionatiConfronto.size < 2) { zona.innerHTML = ''; return; }

  const selezionati = prospettiCompleti.filter((p) => selezionatiConfronto.has(p.id));
  const [conti, fondiReali] = await Promise.all([elencoConti(), elencoFondi()]);

  const risultati = [];
  for (const p of selezionati) {
    try {
      const dati = await calcolaProiezioneProspetto(p.id);
      const salute = await calcolaSaluteFinanziariaProspetto(p.id).catch(() => null);
      risultati.push({ prospetto: p, dati, salute });
    } catch (err) {
      risultati.push({ prospetto: p, errore: err.message });
    }
  }

  // Conti: stessa formula già usata nel dettaglio del Prospetto (quota reale di liquidità/
  // Budget, mai simulata, + somma dei Fondi proiettati) — vedi renderDettaglioProspetto per la
  // spiegazione completa del perché serve isolare i Fondi REALI di oggi.
  function contiProiettatiDi(r) {
    if (r.errore) return [];
    const mappaFondiAttuali = new Map(r.dati.fondiAttuali.map((f) => [f.id, f]));
    return conti.map((c) => {
      const sommaFondiRealiOggi = fondiReali.filter((f) => f.contoId === c.id).reduce((s, f) => s + f.saldo, 0);
      const liquiditaEBudgetReale = arrotonda(c.saldoReale - sommaFondiRealiOggi);
      const sommaFondiProiettatiFinale = r.dati.fondiProiettati
        .filter((f) => mappaFondiAttuali.get(f.id)?.contoId === c.id)
        .reduce((s, f) => s + f.saldo, 0);
      return { contoId: c.id, nome: c.nome, proiettato: arrotonda(liquiditaEBudgetReale + sommaFondiProiettatiFinale) };
    });
  }

  // Unione di tutti i Fondi coinvolti in almeno uno dei Prospetti confrontati.
  const nomiFondi = new Map();
  risultati.forEach((r) => {
    if (r.errore) return;
    const mappaAttuali = new Map(r.dati.fondiAttuali.map((f) => [f.id, f]));
    r.dati.fondiProiettati.forEach((f) => {
      const attuale = mappaAttuali.get(f.id);
      if (attuale && Math.abs(f.saldo - attuale.saldo) > 0.005) nomiFondi.set(f.id, attuale.nome);
    });
  });

  // Unione di tutti gli Obiettivi coinvolti in almeno uno dei Prospetti confrontati.
  const nomiObiettivi = new Map();
  risultati.forEach((r) => {
    if (r.errore) return;
    const mappaAttuali = new Map(r.dati.obiettiviAttuali.map((o) => [o.id, o]));
    r.dati.obiettiviProiettati.forEach((o) => {
      const attuale = mappaAttuali.get(o.id);
      if (attuale && Math.abs(o.saldoAccumulato - attuale.saldoAccumulato) > 0.005) nomiObiettivi.set(o.id, attuale);
    });
  });

  // Unione di tutti i Budget stimati in almeno uno dei Prospetti confrontati.
  const nomiBudget = new Map();
  risultati.forEach((r) => {
    if (r.errore) return;
    (r.dati.budgetStimati || []).forEach((bs) => nomiBudget.set(bs.budget.id, bs.budget.nome));
  });

  const intestazioni = risultati.map((r) => `<th>${r.prospetto.nome}${r.errore ? ' ⚠️' : ''}</th>`).join('');

  zona.innerHTML = `
    <div class="pannello">
      <h3>Confronto Prospetti</h3>

      <h4>Conti (patrimonio previsto)</h4>
      <table class="tabella">
        <thead><tr><th>Conto</th>${intestazioni}</tr></thead>
        <tbody>
          ${conti.map((c) => `
            <tr>
              <td>${c.nome}</td>
              ${risultati.map((r) => {
                if (r.errore) return '<td class="nota-inline">—</td>';
                const ct = contiProiettatiDi(r).find((x) => x.contoId === c.id);
                return `<td class="numero">${ct ? formattaValuta(ct.proiettato) : '—'}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h4 style="margin-top:16px;">Fondi</h4>
      ${nomiFondi.size === 0 ? '<p class="nota">Nessun Fondo coinvolto nei Prospetti selezionati.</p>' : `
        <table class="tabella">
          <thead><tr><th>Fondo</th>${intestazioni}</tr></thead>
          <tbody>
            ${[...nomiFondi.entries()].map(([fondoId, nome]) => `
              <tr>
                <td>${nome}</td>
                ${risultati.map((r) => {
                  if (r.errore) return '<td class="nota-inline">—</td>';
                  const proiettato = r.dati.fondiProiettati.find((f) => f.id === fondoId);
                  return `<td class="numero">${proiettato ? formattaValuta(proiettato.saldo) : '—'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <h4 style="margin-top:16px;">Obiettivi (% completamento)</h4>
      ${nomiObiettivi.size === 0 ? '<p class="nota">Nessun Obiettivo coinvolto nei Prospetti selezionati.</p>' : `
        <table class="tabella">
          <thead><tr><th>Obiettivo</th>${intestazioni}</tr></thead>
          <tbody>
            ${[...nomiObiettivi.entries()].map(([obId, attuale]) => `
              <tr>
                <td>${attuale.nome}</td>
                ${risultati.map((r) => {
                  if (r.errore) return '<td class="nota-inline">—</td>';
                  const proiettato = r.dati.obiettiviProiettati.find((o) => o.id === obId);
                  if (!proiettato || !attuale.importoTarget) return '<td class="numero">—</td>';
                  const percentuale = Math.min(100, Math.round((proiettato.saldoAccumulato / attuale.importoTarget) * 1000) / 10);
                  return `<td class="numero">${formattaValuta(proiettato.saldoAccumulato)} (${percentuale}%)</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <h4 style="margin-top:16px;">Budget (totale impegnato)</h4>
      ${nomiBudget.size === 0 ? '<p class="nota">Nessun Budget stimato nei Prospetti selezionati.</p>' : `
        <table class="tabella">
          <thead><tr><th>Budget</th>${intestazioni}</tr></thead>
          <tbody>
            ${[...nomiBudget.entries()].map(([budgetId, nome]) => `
              <tr>
                <td>${nome}</td>
                ${risultati.map((r) => {
                  if (r.errore) return '<td class="nota-inline">—</td>';
                  const bs = (r.dati.budgetStimati || []).find((x) => x.budget.id === budgetId);
                  return `<td class="numero">${bs ? formattaValuta(bs.totaleImpegnato) : '—'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <h4 style="margin-top:16px;">Salute Finanziaria a fine Prospetto</h4>
      <table class="tabella">
        <thead><tr><th>Indicatore</th>${intestazioni}</tr></thead>
        <tbody>
          <tr>
            <td>Mesi di autonomia</td>
            ${risultati.map((r) => `<td class="numero">${r.salute?.mesiAutonomia != null ? `${r.salute.mesiAutonomia} mesi` : '—'}</td>`).join('')}
          </tr>
          <tr>
            <td>Obiettivi finanziati</td>
            ${risultati.map((r) => `<td class="numero">${r.salute?.percentualeObiettiviFinanziati != null ? `${r.salute.percentualeObiettiviFinanziati}%` : '—'}</td>`).join('')}
          </tr>
          <tr>
            <td>Obiettivi in ritardo</td>
            ${risultati.map((r) => `<td class="numero">${r.salute ? r.salute.obiettiviInRitardo.length : '—'}</td>`).join('')}
          </tr>
          <tr>
            <td>Crescita patrimoniale</td>
            ${risultati.map((r) => `<td class="numero">${r.salute ? formattaValuta(r.salute.crescitaPatrimoniale.crescitaAssoluta) : '—'}</td>`).join('')}
          </tr>
        </tbody>
      </table>

      ${risultati.some((r) => r.errore) ? `
        <p class="nota" style="margin-top:8px;">
          ${risultati.filter((r) => r.errore).map((r) => `⚠️ "${r.prospetto.nome}": ${r.errore}`).join('<br>')}
        </p>
      ` : ''}
    </div>
  `;
}

function mostraFormProspetto(container, piani, prospettoEsistente, tuttiIProspetti) {
  const formContainer = container.querySelector('#form-prospetto-container');
  const p = prospettoEsistente || {};
  // Esclude se stesso e (in prima approssimazione) chi già dipende da lui, evitando le scelte
  // più ovviamente circolari — il dominio comunque verifica sempre in modo completo.
  const prospettiScelta = (tuttiIProspetti || []).filter((x) => x.id !== p.id);

  formContainer.innerHTML = `
    <form id="form-prospetto" class="form-scheda">
      <h4>${prospettoEsistente ? 'Modifica Prospetto' : 'Nuovo Prospetto'}</h4>
      <label>Nome *<input name="nome" required placeholder="es. Base, Aumento stipendio..." value="${p.nome || ''}"></label>
      <label>Piano da proiettare (facoltativo)
        <select name="pianoId">
          <option value="" ${!p.pianoId ? 'selected' : ''}>Nessuno — solo movimenti manuali</option>
          ${piani.map((piano) => `<option value="${piano.id}" ${p.pianoId === piano.id ? 'selected' : ''}>${piano.nome}</option>`).join('')}
        </select>
      </label>
      <label id="label-importo-entrata">Entrata ipotizzata per ciclo (€) *<input name="importoEntrataPerCiclo" type="number" step="any" value="${p.importoEntrataPerCiclo || ''}"></label>

      <label>Parti da
        <select name="prospettoOrigineId">
          <option value="" ${!p.prospettoOrigineId ? 'selected' : ''}>Situazione attuale (saldi reali di oggi)</option>
          ${prospettiScelta.map((x) => `<option value="${x.id}" ${p.prospettoOrigineId === x.id ? 'selected' : ''}>Risultato finale di: ${x.nome}</option>`).join('')}
        </select>
      </label>
      <label id="label-data-inizio">Data inizio
        <input name="dataInizio" type="date" value="${p.dataInizio ? p.dataInizio.slice(0, 10) : ''}" ${p.prospettoOrigineId ? 'disabled' : ''}>
      </label>
      <p class="nota-inline" id="nota-data-inizio-ereditata" style="${p.prospettoOrigineId ? '' : 'display:none;'}">
        La data inizio e i saldi di partenza verranno ereditati automaticamente dal Prospetto scelto (data fine + 1 giorno).
      </p>
      <label>Giorno del ciclo (es. il giorno dello stipendio) *
        <input name="giornoCiclo" type="number" min="1" max="31" required value="${p.giornoCiclo || (p.dataInizio ? new Date(p.dataInizio).getDate() : '')}">
      </label>
      <p class="nota-inline">
        Se diverso da "Data inizio" (es. stipendio il 15, oggi il 26): indica 15, il primo
        ciclo utile sarà il prossimo 15.
      </p>

      <label>Orizzonte *
        <select name="tipoOrizzonte" required>
          <option value="mesi" ${(!p.tipoOrizzonte || p.tipoOrizzonte === 'mesi') ? 'selected' : ''}>Numero di mesi</option>
          <option value="data" ${p.tipoOrizzonte === 'data' ? 'selected' : ''}>Fino a una data</option>
        </select>
      </label>
      <label id="label-numero-mesi">Numero di mesi<input name="numeroMesi" type="number" min="1" value="${p.numeroMesi || 6}"></label>
      <label id="label-data-fine" style="display:none;">Data fine<input name="dataFine" type="date" value="${p.dataFine ? p.dataFine.slice(0, 10) : ''}"></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">${prospettoEsistente ? 'Salva modifiche' : 'Crea Prospetto'}</button>
        <button type="button" id="btn-annulla-prospetto">Annulla</button>
      </div>
    </form>
  `;

  const selectOrigine = formContainer.querySelector('select[name="prospettoOrigineId"]');
  const inputDataInizio = formContainer.querySelector('input[name="dataInizio"]');
  const inputGiornoCiclo = formContainer.querySelector('input[name="giornoCiclo"]');
  const notaEreditata = formContainer.querySelector('#nota-data-inizio-ereditata');
  selectOrigine.addEventListener('change', () => {
    const haOrigine = selectOrigine.value !== '';
    inputDataInizio.disabled = haOrigine;
    notaEreditata.style.display = haOrigine ? '' : 'none';
  });
  if (!prospettoEsistente) {
    inputDataInizio.addEventListener('change', () => {
      if (inputDataInizio.value) inputGiornoCiclo.value = Number(inputDataInizio.value.split('-')[2]);
    });
  }

  const selectPiano = formContainer.querySelector('select[name="pianoId"]');
  const inputImportoEntrata = formContainer.querySelector('input[name="importoEntrataPerCiclo"]');
  const labelImportoEntrata = formContainer.querySelector('#label-importo-entrata');
  const aggiornaVisibilitaImportoEntrata = () => {
    const haPiano = selectPiano.value !== '';
    labelImportoEntrata.style.display = haPiano ? '' : 'none';
    inputImportoEntrata.required = haPiano;
  };
  selectPiano.addEventListener('change', () => {
    aggiornaVisibilitaImportoEntrata();
    // Propone come default l'entrata simulata salvata sul Piano scelto (§4.7/§4.10): solo per
    // un Prospetto nuovo e solo se il campo è ancora vuoto — non sovrascrive mai una scelta già
    // fatta dall'utente (es. passando da un Piano all'altro dopo aver già digitato un importo).
    if (!prospettoEsistente && !inputImportoEntrata.value) {
      const pianoScelto = piani.find((piano) => piano.id === selectPiano.value);
      if (pianoScelto?.importoEntrataSimulata != null) {
        inputImportoEntrata.value = pianoScelto.importoEntrataSimulata;
      }
    }
  });
  aggiornaVisibilitaImportoEntrata();

  const selectOrizzonte = formContainer.querySelector('select[name="tipoOrizzonte"]');
  const aggiornaVisibilitaOrizzonte = () => {
    const perMesi = selectOrizzonte.value === 'mesi';
    formContainer.querySelector('#label-numero-mesi').style.display = perMesi ? '' : 'none';
    formContainer.querySelector('#label-data-fine').style.display = perMesi ? 'none' : '';
  };
  selectOrizzonte.addEventListener('change', aggiornaVisibilitaOrizzonte);
  aggiornaVisibilitaOrizzonte();

  formContainer.querySelector('#btn-annulla-prospetto').addEventListener('click', () => {
    mostraFormNuovo = false;
    prospettoInModifica = null;
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('#form-prospetto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (prospettoEsistente) {
        await aggiornaProspetto(prospettoEsistente.id, dati);
      } else {
        await creaProspetto(dati);
      }
      mostraFormNuovo = false;
      prospettoInModifica = null;
      renderProspetti(container);
    } catch (err) {
      alert(err.message);
    }
  });
}
