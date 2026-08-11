import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { ottieniPianoAttivo, elencoPiani, elencoVociPerPiano } from '../domain/piano.js';
import { creaTrasferimento } from '../domain/trasferimenti.js';
import { verificaIntegritaConto } from '../engine/integrityCheck.js';
import {
  calcolaPropostaEqua, calcolaPropostaProporzionale, calcolaRichiestaDaPiano,
  risolviInsufficienzaPerPriorita, risolviInsufficienzaManuale, sommaRighe, importiCoincidono
} from '../engine/allocationEngine.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { oggiISO } from '../utils/dateUtils.js';

// Stato del wizard, azzerato ad ogni ingresso nella vista.
let stato = null;

function statoIniziale() {
  return {
    passo: 1,
    contoId: '',
    importo: '',
    strategia: null,
    righe: [], // { tipoDestinazione: 'fondo'|'obiettivo', destinazioneId, importo }
    esito: null
  };
}

export async function renderDistribuzione(container) {
  stato = stato || statoIniziale();
  const [conti, fondi, obiettivi] = await Promise.all([elencoConti(), elencoFondi(), elencoObiettivi()]);
  const contesto = { conti, fondi, obiettivi };

  if (stato.esito) { renderEsito(container); return; }

  container.innerHTML = `
    <section class="pannello">
      <h2>Distribuisci Disponibile</h2>
      <p class="nota">
        Distribuisce solo la liquidità <strong>non ancora allocata</strong> di un Conto (quella
        libera, non earmarked in nessun Fondo/Obiettivo) verso Fondi e Obiettivi, riusando le
        stesse 4 strategie di "Registra Entrata". Per rivedere come è già ripartito il saldo di
        un Fondo tra i suoi Obiettivi, usa invece "Ridistribuisci Liquidità".
        Ogni riga genera un Trasferimento tracciato (Conto → Fondo/Obiettivo), non un'Allocazione:
        qui non c'è una nuova entrata, solo denaro già esistente che cambia earmarking.
      </p>
      <div id="passo-1"></div>
      ${stato.passo >= 2 ? '<div id="passo-2"></div>' : ''}
      ${stato.passo >= 3 ? '<div id="passo-3"></div>' : ''}
    </section>
  `;

  renderPasso1(container, contesto);
  if (stato.passo >= 2) renderPasso2(container, contesto);
  if (stato.passo >= 3) renderPasso3(container, contesto);
}

function etichettaElemento(tipo, id, contesto) {
  if (tipo === 'fondo') return contesto.fondi.find((f) => f.id === id)?.nome || '—';
  if (tipo === 'obiettivo') return contesto.obiettivi.find((o) => o.id === id)?.nome || '—';
  return '—';
}

function renderPasso1(container, contesto) {
  const el = container.querySelector('#passo-1');
  const bloccato = stato.passo > 1;
  const conto = contesto.conti.find((c) => c.id === stato.contoId);
  const verifica = conto ? verificaIntegritaConto(conto, contesto.fondi) : null;

  el.innerHTML = `
    <form id="form-passo1" class="form-scheda">
      <h3>1. Conto e importo da distribuire</h3>
      <label>Conto *
        <select name="contoId" required ${bloccato ? 'disabled' : ''}>
          <option value="">-- seleziona --</option>
          ${contesto.conti.map((c) => `<option value="${c.id}" ${stato.contoId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      ${verifica ? `<p class="nota">Liquidità non allocata su questo Conto: <strong>${formattaValuta(verifica.liquiditaNonAllocata)}</strong></p>` : ''}
      <label>Importo da distribuire *<input name="importo" type="number" step="any" required value="${stato.importo}" ${bloccato ? 'disabled' : ''}></label>
      ${bloccato
        ? '<button type="button" id="btn-modifica-passo1">Modifica</button>'
        : '<button type="submit" class="btn-primario">Avanti</button>'}
    </form>
  `;

  const selectConto = el.querySelector('select[name="contoId"]');
  if (selectConto) selectConto.addEventListener('change', () => { stato.contoId = selectConto.value; renderDistribuzione(container); });

  if (bloccato) {
    el.querySelector('#btn-modifica-passo1').addEventListener('click', () => {
      stato = statoIniziale();
      renderDistribuzione(container);
    });
  } else {
    el.querySelector('#form-passo1').addEventListener('submit', (e) => {
      e.preventDefault();
      const dati = Object.fromEntries(new FormData(e.target).entries());
      const importo = Number(dati.importo);
      if (!dati.contoId) { alert('Seleziona un Conto.'); return; }
      if (!importo || importo <= 0) { alert('Inserisci un importo maggiore di zero.'); return; }
      if (verifica && importo > verifica.liquiditaNonAllocata + 0.005) {
        alert(`Il Conto ha solo ${formattaValuta(verifica.liquiditaNonAllocata)} di liquidità non allocata.`);
        return;
      }
      stato.contoId = dati.contoId;
      stato.importo = importo;
      stato.passo = 2;
      renderDistribuzione(container);
    });
  }
}

function etichettaStrategia(s) {
  return { manuale: 'Manuale', equa: 'Equa', proporzionale: 'Proporzionale', da_piano: 'Da Piano' }[s] || s;
}

function renderPasso2(container, contesto) {
  const el = container.querySelector('#passo-2');
  if (!el) return;
  const importo = Number(stato.importo);

  if (!stato.strategia) {
    el.innerHTML = `
      <div class="form-scheda">
        <h3>2. Strategia di distribuzione</h3>
        <div class="form-azioni">
          <button data-s="manuale">Manuale</button>
          <button data-s="equa">Equa</button>
          <button data-s="proporzionale">Proporzionale</button>
          <button data-s="da_piano">Da Piano</button>
        </div>
      </div>
    `;
    el.querySelectorAll('button[data-s]').forEach((btn) => {
      btn.addEventListener('click', () => {
        stato.strategia = btn.dataset.s;
        stato.righe = [];
        avviaStrategia(container, contesto, importo);
      });
    });
    return;
  }

  el.innerHTML = `<div class="form-scheda"><h3>2. Strategia scelta: ${etichettaStrategia(stato.strategia)}</h3>
    <button id="btn-cambia-strategia">Cambia strategia</button>
    <div id="config-strategia" style="margin-top:10px;"></div>
  </div>`;
  el.querySelector('#btn-cambia-strategia').addEventListener('click', () => {
    stato.strategia = null;
    stato.righe = [];
    stato.passo = 2;
    renderDistribuzione(container);
  });
  // Vedi nota in viewAllocazione.js: senza questo controllo, la strategia "manuale" innesca
  // un loop infinito di render (render → avviaStrategia → render → avviaStrategia → ...).
  if (stato.passo < 3) avviaStrategia(container, contesto, importo);
}

async function avviaStrategia(container, contesto, importo) {
  const el = container.querySelector('#config-strategia') || container.querySelector('#passo-2');

  if (stato.strategia === 'manuale') {
    stato.passo = 3;
    renderDistribuzione(container);
    return;
  }

  if (stato.strategia === 'equa') {
    const elementiSelezionabili = [
      ...contesto.fondi.map((f) => ({ tipoDestinazione: 'fondo', destinazioneId: f.id, nome: `Fondo: ${f.nome}` })),
      ...contesto.obiettivi.map((o) => ({ tipoDestinazione: 'obiettivo', destinazioneId: o.id, nome: `Obiettivo: ${o.nome}` }))
    ];
    el.innerHTML = `
      <p class="nota">Seleziona gli elementi tra cui dividere in parti uguali:</p>
      <div class="form-scheda">
        ${elementiSelezionabili.map((e2, i) => `<label class="riga-checkbox"><input type="checkbox" data-i="${i}"> ${e2.nome}</label>`).join('')}
        <button id="btn-calcola-equa" class="btn-primario">Calcola</button>
      </div>
    `;
    el.querySelector('#btn-calcola-equa').addEventListener('click', () => {
      const selezionati = [...el.querySelectorAll('input[type="checkbox"]:checked')].map((c) => elementiSelezionabili[Number(c.dataset.i)]);
      try {
        const righe = calcolaPropostaEqua(importo, selezionati);
        stato.righe = righe.map((r) => ({ tipoDestinazione: r.tipoDestinazione, destinazioneId: r.destinazioneId, importo: r.importo }));
        stato.passo = 3;
        renderDistribuzione(container);
      } catch (err) {
        alert(err.message);
      }
    });
    return;
  }

  if (stato.strategia === 'proporzionale') {
    el.innerHTML = `
      <p class="nota">Scegli il Fondo, poi seleziona gli Obiettivi tra cui distribuire mantenendo i rapporti dell'Importo Target:</p>
      <select id="select-fondo-proporzionale">
        <option value="">-- seleziona Fondo --</option>
        ${contesto.fondi.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('')}
      </select>
      <div id="obiettivi-proporzionale"></div>
    `;
    el.querySelector('#select-fondo-proporzionale').addEventListener('change', (e) => {
      const obiettiviDelFondo = contesto.obiettivi.filter((o) => o.fondoId === e.target.value);
      const zona = el.querySelector('#obiettivi-proporzionale');
      zona.innerHTML = `
        <div class="form-scheda">
          ${obiettiviDelFondo.map((o, i) => `<label class="riga-checkbox"><input type="checkbox" data-i="${i}"> ${o.nome} (target ${formattaValuta(o.importoTarget)})</label>`).join('')}
          <button id="btn-calcola-proporzionale" class="btn-primario">Calcola</button>
        </div>
      `;
      zona.querySelector('#btn-calcola-proporzionale').addEventListener('click', () => {
        const selezionati = [...zona.querySelectorAll('input[type="checkbox"]:checked')].map((c) => obiettiviDelFondo[Number(c.dataset.i)]);
        try {
          const righe = calcolaPropostaProporzionale(importo, selezionati);
          stato.righe = righe.map((r) => ({ tipoDestinazione: 'obiettivo', destinazioneId: r.destinazioneId, importo: r.importo }));
          stato.passo = 3;
          renderDistribuzione(container);
        } catch (err) {
          alert(err.message);
        }
      });
    });
    return;
  }

  if (stato.strategia === 'da_piano') {
    const piani = await elencoPiani();
    if (piani.length === 0) {
      el.innerHTML = '<p class="badge badge-errore">Nessun Piano creato. Vai nella sezione Piano per crearne uno.</p>';
      return;
    }
    const pianoAttivo = await ottieniPianoAttivo();
    el.innerHTML = `
      <label>Piano da usare
        <select id="select-piano-distribuzione">
          ${piani.map((p) => `<option value="${p.id}" ${pianoAttivo && p.id === pianoAttivo.id ? 'selected' : ''}>${p.nome}</option>`).join('')}
        </select>
      </label>
      <button id="btn-usa-piano" class="btn-primario">Usa questo Piano</button>
      <div id="esito-piano-distribuzione"></div>
    `;

    el.querySelector('#btn-usa-piano').addEventListener('click', async () => {
      const pianoId = el.querySelector('#select-piano-distribuzione').value;
      const piano = piani.find((p) => p.id === pianoId);
      const tutteLeVoci = await elencoVociPerPiano(pianoId);
      const voci = tutteLeVoci.filter((v) => v.tipoDestinazione !== 'budget');
      const vociEscluse = tutteLeVoci.length - voci.length;
      const esito = el.querySelector('#esito-piano-distribuzione');

      if (voci.length === 0) {
        esito.innerHTML = '<p class="badge badge-errore">Questo Piano non ha Voci verso Fondi/Obiettivi (solo Budget, non applicabili qui: si distribuiscono qui solo Fondi/Obiettivi).</p>';
        return;
      }
      const calcolo = calcolaRichiestaDaPiano(importo, voci);
      const notaEscluse = vociEscluse > 0
        ? `<p class="nota">${vociEscluse} voce/i verso Budget del Piano non incluse: qui si distribuisce solo verso Fondi/Obiettivi.</p>` : '';

      if (calcolo.sufficiente) {
        stato.righe = calcolo.vociCalcolate.map((v) => ({ tipoDestinazione: v.tipoDestinazione, destinazioneId: v.destinazioneId, importo: v.importoRichiesto }));
        const residuo = Math.round((calcolo.importoEntrata - calcolo.totaleRichiesto) * 100) / 100;
        if (residuo > 0.005) {
          // Il residuo semplicemente resta liquidità non allocata: qui possiamo distribuire meno
          // dell'importo scelto in partenza (a differenza di "Registra Entrata", non c'è un vincolo
          // a muovere per forza tutta la cifra). Riduciamo l'importo target di conseguenza.
          stato.importo = calcolo.totaleRichiesto;
        }
        stato.passo = 3;
        renderDistribuzione(container);
        return;
      }

      esito.innerHTML = `
        ${notaEscluse}
        <p class="badge badge-errore">
          ⚠️ Il Piano "${piano.nome}" richiederebbe ${formattaValuta(calcolo.totaleRichiesto)},
          ma stai distribuendo ${formattaValuta(calcolo.importoEntrata)} (mancano ${formattaValuta(calcolo.mancante)}).
        </p>
        <div class="form-azioni">
          <button id="btn-risolvi-manuale">Assegna manuale</button>
          <button id="btn-risolvi-priorita">Assegna per priorità</button>
        </div>
      `;
      esito.querySelector('#btn-risolvi-manuale').addEventListener('click', () => {
        const righe = risolviInsufficienzaManuale(calcolo.vociCalcolate);
        stato.righe = righe.map((v) => ({ tipoDestinazione: v.tipoDestinazione, destinazioneId: v.destinazioneId, importo: v.importo }));
        stato.passo = 3;
        renderDistribuzione(container);
      });
      esito.querySelector('#btn-risolvi-priorita').addEventListener('click', () => {
        const righe = risolviInsufficienzaPerPriorita(importo, calcolo.vociCalcolate);
        stato.righe = righe.map((v) => ({ tipoDestinazione: v.tipoDestinazione, destinazioneId: v.destinazioneId, importo: v.importo }));
        stato.passo = 3;
        renderDistribuzione(container);
      });
    });
  }
}

function renderPasso3(container, contesto) {
  const el = container.querySelector('#passo-3');
  if (!el) return;
  const importo = Number(stato.importo);
  const somma = sommaRighe(stato.righe);
  const coincide = importiCoincidono(importo, stato.righe);

  el.innerHTML = `
    <div class="form-scheda" style="max-width:640px;">
      <h3>3. Righe di distribuzione (modificabili)</h3>
      <table class="tabella">
        <thead><tr><th>Destinazione</th><th>Importo</th><th></th></tr></thead>
        <tbody>
          ${stato.righe.map((r, i) => `
            <tr>
              <td>${etichettaElemento(r.tipoDestinazione, r.destinazioneId, contesto)}</td>
              <td><input type="number" step="any" data-i="${i}" class="input-riga-importo" value="${r.importo}" style="width:100px;"></td>
              <td><button class="btn-icona" title="Rimuovi riga" data-azione="rimuovi-riga" data-i="${i}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button id="btn-aggiungi-riga"><i class="fa-solid fa-plus"></i> Aggiungi riga</button>
      <div id="form-aggiungi-riga"></div>
      <p class="${coincide ? '' : 'testo-errore'}">
        Totale distribuito: ${formattaValuta(somma)} / Da distribuire: ${formattaValuta(importo)}
        ${coincide ? ' ✓' : ' — la somma deve coincidere con l\'importo scelto'}
      </p>
      <button id="btn-conferma-distribuzione" class="btn-primario" ${coincide ? '' : 'disabled'}>Conferma Distribuzione</button>
    </div>
  `;

  el.querySelectorAll('.input-riga-importo').forEach((input) => {
    input.addEventListener('change', () => {
      stato.righe[Number(input.dataset.i)].importo = Number(input.value) || 0;
      renderDistribuzione(container);
    });
  });

  el.querySelectorAll('button[data-azione="rimuovi-riga"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stato.righe.splice(Number(btn.dataset.i), 1);
      renderDistribuzione(container);
    });
  });

  el.querySelector('#btn-aggiungi-riga').addEventListener('click', () => {
    mostraFormAggiungiRiga(el, container, contesto);
  });

  el.querySelector('#btn-conferma-distribuzione').addEventListener('click', async () => {
    try {
      const trasferimentiCreati = [];
      for (const r of stato.righe) {
        const t = await creaTrasferimento({
          data: oggiISO(),
          tipoOrigine: 'conto',
          origineId: stato.contoId,
          tipoDestinazione: r.tipoDestinazione,
          destinazioneId: r.destinazioneId,
          importo: r.importo,
          descrizione: 'Distribuzione liquidità'
        });
        trasferimentiCreati.push(t);
      }
      stato.esito = { trasferimentiCreati, contesto };
      renderDistribuzione(container);
    } catch (err) {
      alert(err.message);
    }
  });
}

function mostraFormAggiungiRiga(el, container, contesto) {
  const zona = el.querySelector('#form-aggiungi-riga');
  zona.innerHTML = `
    <form class="form-scheda">
      <label>Tipo
        <select name="tipoDestinazione">
          <option value="fondo">Fondo</option>
          <option value="obiettivo">Obiettivo</option>
        </select>
      </label>
      <label>Destinazione<select name="destinazioneId"></select></label>
      <label>Importo<input name="importo" type="number" step="any" required></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Aggiungi</button>
        <button type="button" id="btn-annulla-riga">Annulla</button>
      </div>
    </form>
  `;
  const selectTipo = zona.querySelector('select[name="tipoDestinazione"]');
  const selectDest = zona.querySelector('select[name="destinazioneId"]');
  const aggiornaDest = () => {
    const elenco = selectTipo.value === 'fondo' ? contesto.fondi : contesto.obiettivi;
    selectDest.innerHTML = elenco.map((e) => `<option value="${e.id}">${e.nome}</option>`).join('');
  };
  selectTipo.addEventListener('change', aggiornaDest);
  aggiornaDest();

  zona.querySelector('#btn-annulla-riga').addEventListener('click', () => { zona.innerHTML = ''; });

  zona.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    stato.righe.push({ tipoDestinazione: dati.tipoDestinazione, destinazioneId: dati.destinazioneId, importo: Number(dati.importo) || 0 });
    renderDistribuzione(container);
  });
}

function renderEsito(container) {
  const { trasferimentiCreati, contesto } = stato.esito;
  container.innerHTML = `
    <section class="pannello">
      <h2>Distribuzione confermata ✓</h2>
      <p class="nota">Generati ${trasferimentiCreati.length} Trasferimenti, visibili nel Registro Movimenti.</p>
      <ul class="elenco-semplice">
        ${trasferimentiCreati.map((t) => `<li>${formattaValuta(t.importo)} → ${etichettaElemento(t.tipoDestinazione, t.destinazioneId, contesto)}</li>`).join('')}
      </ul>
      <button id="btn-nuova-distribuzione" class="btn-primario">Nuova Distribuzione</button>
    </section>
  `;
  container.querySelector('#btn-nuova-distribuzione').addEventListener('click', () => {
    stato = statoIniziale();
    renderDistribuzione(container);
  });
}
