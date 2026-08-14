// Ridistribuisci Liquidità: rivede come è già ripartito il denaro di un Conto tra i suoi Fondi,
// e da ciascun Fondo tra i suoi Obiettivi — in un'unica sessione, non aggiunge denaro nuovo,
// sposta earmarking già esistente. Ogni spostamento genera un Trasferimento tracciato.
// Include scorciatoie (Equamente / Proporzionale / Da Piano) ad entrambi i livelli, che
// riusano il motore di allocazione già costruito per "Registra Entrata".

import { elencoConti, ottieniConto } from '../domain/conti.js';
import { elencoFondiPerConto } from '../domain/fondi.js';
import { elencoObiettiviPerFondo } from '../domain/obiettivi.js';
import { creaTrasferimento } from '../domain/trasferimenti.js';
import { ottieniPianoAttivo, elencoVociPerPiano } from '../domain/piano.js';
import {
  calcolaPropostaEqua, calcolaPropostaProporzionale, calcolaRichiestaDaPiano, risolviInsufficienzaPerPriorita
} from '../engine/allocationEngine.js';
import { calcolaDatiFondo } from '../engine/obiettivoCalc.js';
import { formattaValuta } from '../utils/formatCurrency.js';

// Stato del wizard, azzerato ad ogni ingresso nella vista.
let stato = null;

function statoIniziale() {
  return {
    contoId: '',
    righeFondi: [], // { fondoId, nome, vecchio, nuovo, target }
    fondoEspansoId: null,
    obiettiviPerFondo: {}, // fondoId -> [{ obiettivoId, nome, vecchio, nuovo, target }]
    esito: null
  };
}

export async function renderRidistribuzione(container) {
  stato = stato || statoIniziale();
  const conti = await elencoConti();

  if (stato.esito) { renderEsito(container); return; }

  container.innerHTML = `
    <section class="pannello">
      <h2>Ridistribuisci Liquidità</h2>
      <p class="nota">
        Rivede come è già ripartito il denaro di un Conto tra i suoi Fondi — e, da ciascun Fondo,
        tra i suoi Obiettivi. Non aggiunge denaro nuovo: sposta earmarking già esistente. Ogni
        spostamento genera un Trasferimento tracciato, visibile nel Registro Movimenti. Per
        distribuire liquidità libera non ancora allocata, usa invece "Distribuisci Disponibile".
      </p>
      <label>Conto
        <select id="select-conto">
          <option value="">-- seleziona --</option>
          ${conti.map((c) => `<option value="${c.id}" ${stato.contoId === c.id ? 'selected' : ''}>${c.nome} (saldo ${formattaValuta(c.saldoReale)})</option>`).join('')}
        </select>
      </label>
      <div id="dettaglio-conto"></div>
    </section>
  `;

  container.querySelector('#select-conto').addEventListener('change', (e) => {
    stato.contoId = e.target.value;
    stato.righeFondi = [];
    stato.obiettiviPerFondo = {};
    stato.fondoEspansoId = null;
    renderRidistribuzione(container);
  });

  if (stato.contoId) {
    const conto = await ottieniConto(stato.contoId);
    await renderDettaglioConto(container, conto);
  }
}

async function renderDettaglioConto(container, conto) {
  const zona = container.querySelector('#dettaglio-conto');
  const fondi = await elencoFondiPerConto(conto.id);

  if (fondi.length === 0) {
    zona.innerHTML = '<p class="nota">Questo Conto non ha Fondi.</p>';
    return;
  }

  if (stato.righeFondi.length === 0) {
    stato.righeFondi = [];
    for (const f of fondi) {
      const obiettiviDelFondo = await elencoObiettiviPerFondo(f.id);
      const datiFondo = calcolaDatiFondo(f, obiettiviDelFondo);
      stato.righeFondi.push({ fondoId: f.id, nome: f.nome, vecchio: f.saldo, nuovo: f.saldo, target: datiFondo.obiettivoComplessivo });
    }
  }

  const totaleNuovo = stato.righeFondi.reduce((s, r) => s + (Number(r.nuovo) || 0), 0);
  const liquiditaResiduaNuova = Math.round((conto.saldoReale - totaleNuovo) * 100) / 100;
  const validoGlobale = liquiditaResiduaNuova >= -0.005;

  const blocchiFondo = [];
  for (const r of stato.righeFondi) {
    blocchiFondo.push(await renderRigaFondo(container, r, conto));
  }

  zona.innerHTML = `
    <div class="form-scheda" style="max-width:720px;">
      <h3>Saldo del Conto: ${formattaValuta(conto.saldoReale)}</h3>
      <p class="nota-inline">Scorciatoie per i Fondi:</p>
      <div class="form-azioni" style="margin-bottom:10px;">
        <button id="btn-equa-fondi" type="button">Equamente</button>
        <button id="btn-proporzionale-fondi" type="button">Proporzionale (per Obiettivo complessivo)</button>
        <button id="btn-piano-fondi" type="button">Da Piano</button>
      </div>
      <div class="lista-editabile">${blocchiFondo.join('')}</div>
      <p class="${validoGlobale ? '' : 'testo-errore'}">
        Assegnato ai Fondi: ${formattaValuta(totaleNuovo)} — Liquidità libera risultante: ${formattaValuta(liquiditaResiduaNuova)}
        ${validoGlobale ? '' : ' — stai assegnando più del saldo del Conto'}
      </p>
      <button id="btn-conferma-ridistribuzione" class="btn-primario" ${validoGlobale ? '' : 'disabled'}>Conferma Ridistribuzione</button>
    </div>
  `;

  collegaEventiRighe(container, conto);

  zona.querySelector('#btn-equa-fondi').addEventListener('click', () => {
    const totale = stato.righeFondi.reduce((s, r) => s + Number(r.vecchio), 0);
    const elementi = stato.righeFondi.map((r) => ({ tipoDestinazione: 'fondo', destinazioneId: r.fondoId }));
    try {
      const risultato = calcolaPropostaEqua(totale, elementi);
      risultato.forEach((ri, i) => { stato.righeFondi[i].nuovo = ri.importo; });
      renderDettaglioConto(container, conto);
    } catch (err) { alert(err.message); }
  });

  zona.querySelector('#btn-proporzionale-fondi').addEventListener('click', () => {
    const totale = stato.righeFondi.reduce((s, r) => s + Number(r.vecchio), 0);
    const pesi = stato.righeFondi.map((r) => Number(r.target) || 0);
    const totalePesi = pesi.reduce((s, p) => s + p, 0);
    if (totalePesi <= 0) {
      alert('Nessun Fondo di questo Conto ha un "Obiettivo complessivo" impostato: impossibile calcolare le proporzioni.');
      return;
    }
    let cumulato = 0;
    stato.righeFondi.forEach((r, i) => {
      const importo = i === stato.righeFondi.length - 1
        ? Math.round((totale - cumulato) * 100) / 100
        : Math.round(totale * (pesi[i] / totalePesi) * 100) / 100;
      r.nuovo = importo;
      cumulato = Math.round((cumulato + importo) * 100) / 100;
    });
    renderDettaglioConto(container, conto);
  });

  zona.querySelector('#btn-piano-fondi').addEventListener('click', async () => {
    const piano = await ottieniPianoAttivo();
    if (!piano) { alert('Nessun Piano attivo. Vai nella sezione Piano per crearne e attivarne uno.'); return; }
    const idFondi = new Set(stato.righeFondi.map((r) => r.fondoId));
    const voci = (await elencoVociPerPiano(piano.id)).filter((v) => v.tipoDestinazione === 'fondo' && idFondi.has(v.destinazioneId));
    if (voci.length === 0) { alert(`Il Piano "${piano.nome}" non ha Voci verso i Fondi di questo Conto.`); return; }
    const totale = stato.righeFondi.reduce((s, r) => s + Number(r.vecchio), 0);
    const calcolo = calcolaRichiestaDaPiano(totale, voci);
    const righeFinali = calcolo.sufficiente
      ? calcolo.vociCalcolate.map((v) => ({ destinazioneId: v.destinazioneId, importo: v.importoRichiesto }))
      : risolviInsufficienzaPerPriorita(totale, calcolo.vociCalcolate).map((v) => ({ destinazioneId: v.destinazioneId, importo: v.importo }));
    righeFinali.forEach((rf) => {
      const riga = stato.righeFondi.find((r) => r.fondoId === rf.destinazioneId);
      if (riga) riga.nuovo = rf.importo;
    });
    renderDettaglioConto(container, conto);
  });

  const btnConferma = zona.querySelector('#btn-conferma-ridistribuzione');
  if (btnConferma) {
    btnConferma.addEventListener('click', async () => {
      try {
        const risultati = [];

        // 1) Prima i Fondi che CEDONO denaro (delta negativo): libera liquidità nel Conto.
        for (const r of stato.righeFondi) {
          const delta = Math.round((Number(r.nuovo) - Number(r.vecchio)) * 100) / 100;
          if (delta < -0.005) {
            const t = await creaTrasferimento({ tipoOrigine: 'fondo', origineId: r.fondoId, tipoDestinazione: 'conto', destinazioneId: conto.id, importo: -delta, descrizione: 'Ridistribuzione tra Fondi' });
            risultati.push({ tipo: 'fondo', nome: r.nome, delta, trasferimento: t });
          }
        }
        // 2) Poi i Fondi che RICEVONO denaro (delta positivo): usa la liquidità appena liberata.
        for (const r of stato.righeFondi) {
          const delta = Math.round((Number(r.nuovo) - Number(r.vecchio)) * 100) / 100;
          if (delta > 0.005) {
            const t = await creaTrasferimento({ tipoOrigine: 'conto', origineId: conto.id, tipoDestinazione: 'fondo', destinazioneId: r.fondoId, importo: delta, descrizione: 'Ridistribuzione tra Fondi' });
            risultati.push({ tipo: 'fondo', nome: r.nome, delta, trasferimento: t });
          }
        }
        // 3) Infine, per ogni Fondo espanso con Obiettivi modificati, ridistribuisci al suo interno.
        for (const [fondoId, righeObiettivi] of Object.entries(stato.obiettiviPerFondo)) {
          for (const ro of righeObiettivi) {
            const delta = Math.round((Number(ro.nuovo) - Number(ro.vecchio)) * 100) / 100;
            if (Math.abs(delta) < 0.005) continue;
            const t = delta > 0
              ? await creaTrasferimento({ tipoOrigine: 'fondo', origineId: fondoId, tipoDestinazione: 'obiettivo', destinazioneId: ro.obiettivoId, importo: delta, descrizione: 'Ridistribuzione tra Obiettivi' })
              : await creaTrasferimento({ tipoOrigine: 'obiettivo', origineId: ro.obiettivoId, tipoDestinazione: 'fondo', destinazioneId: fondoId, importo: -delta, descrizione: 'Ridistribuzione tra Obiettivi' });
            risultati.push({ tipo: 'obiettivo', nome: ro.nome, delta, trasferimento: t });
          }
        }

        stato.esito = { risultati, contoNome: conto.nome };
        renderRidistribuzione(container);
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

async function renderRigaFondo(container, r, conto) {
  const espanso = stato.fondoEspansoId === r.fondoId;
  let blocchettoObiettivi = '';

  if (espanso) {
    if (!stato.obiettiviPerFondo[r.fondoId]) {
      const obiettivi = await elencoObiettiviPerFondo(r.fondoId);
      stato.obiettiviPerFondo[r.fondoId] = obiettivi.map((o) => ({ obiettivoId: o.id, nome: o.nome, vecchio: o.saldoAccumulato, nuovo: o.saldoAccumulato, target: o.importoTarget }));
    }
    const righeObiettivi = stato.obiettiviPerFondo[r.fondoId];
    const totaleObiettivi = righeObiettivi.reduce((s, ro) => s + (Number(ro.nuovo) || 0), 0);
    const nuovoSaldoFondo = Number(r.nuovo) || 0;
    const nonAssegnato = Math.round((nuovoSaldoFondo - totaleObiettivi) * 100) / 100;
    const validoFondo = nonAssegnato >= -0.005;

    blocchettoObiettivi = righeObiettivi.length === 0 ? '<p class="nota">Questo Fondo non ha Obiettivi.</p>' : `
      <p class="nota-inline">Scorciatoie per gli Obiettivi (sul nuovo saldo del Fondo, ${formattaValuta(nuovoSaldoFondo)}):</p>
      <div class="form-azioni" style="margin-bottom:8px;">
        <button type="button" data-azione="equa-obiettivi" data-fondo-id="${r.fondoId}">Equamente</button>
        <button type="button" data-azione="proporzionale-obiettivi" data-fondo-id="${r.fondoId}">Proporzionale (per Target)</button>
        <button type="button" data-azione="piano-obiettivi" data-fondo-id="${r.fondoId}">Da Piano</button>
      </div>
      <div class="lista-editabile">
        ${righeObiettivi.map((ro, i) => `
          <div class="riga-editabile">
            <span class="riga-editabile-nome">${ro.nome}<span class="nota-inline">attuale ${formattaValuta(ro.vecchio)}</span></span>
            <input type="number" step="any" data-fondo="${r.fondoId}" data-i="${i}" class="input-nuovo-obiettivo" value="${ro.nuovo}">
          </div>
        `).join('')}
      </div>
      <p class="nota-inline ${validoFondo ? '' : 'testo-errore'}">
        Assegnato agli Obiettivi: ${formattaValuta(totaleObiettivi)} / Nuovo saldo Fondo: ${formattaValuta(nuovoSaldoFondo)} —
        non assegnato: ${formattaValuta(nonAssegnato)}${validoFondo ? '' : ' (supera il nuovo saldo del Fondo)'}
      </p>
    `;
  }

  return `
    <div class="riga-editabile" style="flex-direction:column; align-items:stretch;">
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span class="riga-editabile-nome"><strong>${r.nome}</strong><span class="nota-inline">attuale ${formattaValuta(r.vecchio)}</span></span>
        <input type="number" step="any" data-fondo-id="${r.fondoId}" class="input-nuovo-fondo" value="${r.nuovo}">
        <button data-azione="espandi-fondo" data-fondo-id="${r.fondoId}" class="riga-editabile-espandi">${espanso ? 'Chiudi' : 'Obiettivi'}</button>
      </div>
      ${espanso ? `<div class="riga-editabile-dettaglio" data-blocco-obiettivi="${r.fondoId}">${blocchettoObiettivi}</div>` : ''}
    </div>
  `;
}

function collegaEventiRighe(container, conto) {
  const zona = container.querySelector('#dettaglio-conto');

  zona.querySelectorAll('.input-nuovo-fondo').forEach((input) => {
    input.addEventListener('change', () => {
      const riga = stato.righeFondi.find((r) => r.fondoId === input.dataset.fondoId);
      riga.nuovo = Number(input.value) || 0;
      renderDettaglioConto(container, conto);
    });
  });

  zona.querySelectorAll('button[data-azione="espandi-fondo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stato.fondoEspansoId = stato.fondoEspansoId === btn.dataset.fondoId ? null : btn.dataset.fondoId;
      renderDettaglioConto(container, conto);
    });
  });

  zona.querySelectorAll('.input-nuovo-obiettivo').forEach((input) => {
    input.addEventListener('change', () => {
      const righe = stato.obiettiviPerFondo[input.dataset.fondo];
      righe[Number(input.dataset.i)].nuovo = Number(input.value) || 0;
      renderDettaglioConto(container, conto);
    });
  });

  zona.querySelectorAll('button[data-azione="equa-obiettivi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fondoId = btn.dataset.fondoId;
      const righeFondo = stato.righeFondi.find((r) => r.fondoId === fondoId);
      const righeObiettivi = stato.obiettiviPerFondo[fondoId];
      const elementi = righeObiettivi.map((r) => ({ tipoDestinazione: 'obiettivo', destinazioneId: r.obiettivoId }));
      try {
        const risultato = calcolaPropostaEqua(Number(righeFondo.nuovo), elementi);
        risultato.forEach((ri, i) => { righeObiettivi[i].nuovo = ri.importo; });
        renderDettaglioConto(container, conto);
      } catch (err) { alert(err.message); }
    });
  });

  zona.querySelectorAll('button[data-azione="proporzionale-obiettivi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fondoId = btn.dataset.fondoId;
      const righeFondo = stato.righeFondi.find((r) => r.fondoId === fondoId);
      const righeObiettivi = stato.obiettiviPerFondo[fondoId];
      const obiettiviInput = righeObiettivi.map((r) => ({ id: r.obiettivoId, importoTarget: r.target }));
      try {
        const risultato = calcolaPropostaProporzionale(Number(righeFondo.nuovo), obiettiviInput);
        risultato.forEach((ri) => {
          const riga = righeObiettivi.find((r) => r.obiettivoId === ri.destinazioneId);
          if (riga) riga.nuovo = ri.importo;
        });
        renderDettaglioConto(container, conto);
      } catch (err) { alert(err.message); }
    });
  });

  zona.querySelectorAll('button[data-azione="piano-obiettivi"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fondoId = btn.dataset.fondoId;
      const righeFondo = stato.righeFondi.find((r) => r.fondoId === fondoId);
      const righeObiettivi = stato.obiettiviPerFondo[fondoId];
      const piano = await ottieniPianoAttivo();
      if (!piano) { alert('Nessun Piano attivo.'); return; }
      const idObiettivi = new Set(righeObiettivi.map((r) => r.obiettivoId));
      const voci = (await elencoVociPerPiano(piano.id)).filter((v) => v.tipoDestinazione === 'obiettivo' && idObiettivi.has(v.destinazioneId));
      if (voci.length === 0) { alert(`Il Piano "${piano.nome}" non ha Voci verso questi Obiettivi.`); return; }
      const totale = Number(righeFondo.nuovo);
      const calcolo = calcolaRichiestaDaPiano(totale, voci);
      const righeFinali = calcolo.sufficiente
        ? calcolo.vociCalcolate.map((v) => ({ destinazioneId: v.destinazioneId, importo: v.importoRichiesto }))
        : risolviInsufficienzaPerPriorita(totale, calcolo.vociCalcolate).map((v) => ({ destinazioneId: v.destinazioneId, importo: v.importo }));
      righeFinali.forEach((rf) => {
        const riga = righeObiettivi.find((r) => r.obiettivoId === rf.destinazioneId);
        if (riga) riga.nuovo = rf.importo;
      });
      renderDettaglioConto(container, conto);
    });
  });
}

function renderEsito(container) {
  const { risultati, contoNome } = stato.esito;
  container.innerHTML = `
    <section class="pannello">
      <h2>Ridistribuzione confermata ✓</h2>
      <p class="nota">Conto "${contoNome}" — ${risultati.length} spostamenti registrati come Trasferimenti.</p>
      <ul class="elenco-semplice">
        ${risultati.length === 0 ? '<li>Nessuna variazione.</li>' : risultati.map((r) => `
          <li>[${r.tipo}] ${r.nome}: ${r.delta > 0 ? '+' : ''}${formattaValuta(r.delta)}</li>
        `).join('')}
      </ul>
      <button id="btn-nuova-ridistribuzione" class="btn-primario">Nuova Ridistribuzione</button>
    </section>
  `;
  container.querySelector('#btn-nuova-ridistribuzione').addEventListener('click', () => {
    stato = statoIniziale();
    renderRidistribuzione(container);
  });
}
