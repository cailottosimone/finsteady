import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoBudget } from '../domain/budget.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { ottieniPianoAttivo, elencoPiani, elencoVociPerPiano } from '../domain/piano.js';
import { confermaAllocazione } from '../domain/allocazioni.js';
import { ottieniImpostazioniAllocazione } from '../domain/impostazioniAllocazione.js';
import { aggiungiAllegato } from '../domain/allegati.js';
import {
  calcolaPropostaEqua, calcolaPropostaProporzionale, calcolaRichiestaDaPiano,
  risolviInsufficienzaPerPriorita, risolviInsufficienzaManuale, sommaRighe, importiCoincidono
} from '../engine/allocationEngine.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { oggiISO, oraLocaleInput } from '../utils/dateUtils.js';

// Stato del wizard, azzerato ad ogni ingresso nella vista.
let stato = null;

// Condivisa dal Passo 1 (allegato facoltativo): se l'utente non ha compilato nulla, non crea
// alcun record — l'allegato è facoltativo per definizione.
async function salvaAllegatoSePresente(tipoMovimento, movimentoId) {
  const a = stato.allegato;
  if (!a || (!a.file && !a.percorso && !a.note)) return;
  let contenuto = null;
  let nomeFile = null;
  let tipoMime = null;
  if (a.file) {
    contenuto = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(a.file);
    });
    nomeFile = a.file.name;
    tipoMime = a.file.type;
  }
  await aggiungiAllegato({
    tipoMovimento, movimentoId, nomeFile, tipoMime, contenuto,
    percorsoRiferimento: a.percorso, note: a.note
  });
}

function statoIniziale() {
  return {
    passo: 1,
    testata: { importoEntrata: '', data: oraLocaleInput(), contoOrigineId: '', descrizione: '' },
    strategia: null,
    righe: [], // { tipoDestinazione, destinazioneId, importo, etichetta }
    risultatoConferma: null
  };
}

export async function renderAllocazione(container) {
  stato = stato || statoIniziale();
  const [conti, fondi, budget, obiettivi] = await Promise.all([
    elencoConti(), elencoFondi(), elencoBudget(), elencoObiettivi()
  ]);
  const contesto = { conti, fondi, budget, obiettivi };

  if (stato.risultatoConferma) {
    renderEsito(container);
    return;
  }

  container.innerHTML = `
    <section class="pannello">
      <h2>Registra Entrata</h2>
      <p class="nota">Ogni entrata deve ricevere una destinazione prima di essere considerata "gestita" (§1.3 FDD).</p>
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
  if (tipo === 'budget') return contesto.budget.find((b) => b.id === id)?.nome || '—';
  if (tipo === 'obiettivo') return contesto.obiettivi.find((o) => o.id === id)?.nome || '—';
  if (tipo === 'conto') return contesto.conti.find((c) => c.id === id)?.nome || '—';
  if (tipo === 'residuo_conto') return 'Disponibilità residua sul Conto';
  return '—';
}

// --- Passo 1: dati dell'entrata ---
function renderPasso1(container, contesto) {
  const el = container.querySelector('#passo-1');
  const t = stato.testata;
  const bloccato = stato.passo > 1;

  el.innerHTML = `
    <form id="form-passo1" class="form-scheda">
      <h3>1. Dati dell'entrata</h3>
      <label>Importo *<input name="importoEntrata" type="number" step="any" required value="${t.importoEntrata}" ${bloccato ? 'disabled' : ''}></label>
      <label>Data e ora *<input name="data" type="datetime-local" required value="${t.data}" ${bloccato ? 'disabled' : ''}></label>
      <label>Conto di arrivo *
        <select name="contoOrigineId" required ${bloccato ? 'disabled' : ''}>
          <option value="">-- seleziona --</option>
          ${contesto.conti.map((c) => `<option value="${c.id}" ${t.contoOrigineId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <label>Descrizione<input name="descrizione" value="${t.descrizione}" ${bloccato ? 'disabled' : ''}></label>
      ${!bloccato ? `
        <details class="dettagli-allegato">
          <summary>Allegato (facoltativo — ricevuta, documento...)</summary>
          <label>File<input type="file" name="allegatoFile" accept="image/*,.pdf,.doc,.docx"></label>
          <label>Percorso sul PC (se non carichi un file)<input type="text" name="allegatoPercorso" value="${stato.allegato?.percorso || ''}" placeholder="es. /Users/nome/Documenti/ricevuta.pdf"></label>
          <label>Note<input type="text" name="allegatoNote" value="${stato.allegato?.note || ''}"></label>
        </details>
      ` : ''}
      ${bloccato
        ? `<button type="button" id="btn-modifica-passo1">Modifica dati entrata</button>`
        : `<button type="submit" class="btn-primario">Avanti</button>`}
    </form>
  `;

  if (bloccato) {
    el.querySelector('#btn-modifica-passo1').addEventListener('click', () => {
      stato = statoIniziale();
      renderAllocazione(container);
    });
  } else {
    el.querySelector('#form-passo1').addEventListener('submit', (e) => {
      e.preventDefault();
      const dati = Object.fromEntries(new FormData(e.target).entries());
      if (!dati.importoEntrata || Number(dati.importoEntrata) <= 0) {
        alert('Inserisci un importo maggiore di zero.');
        return;
      }
      if (!dati.contoOrigineId) {
        alert('Seleziona il Conto di arrivo.');
        return;
      }
      stato.allegato = {
        file: dati.allegatoFile && dati.allegatoFile.size > 0 ? dati.allegatoFile : null,
        percorso: dati.allegatoPercorso || '',
        note: dati.allegatoNote || ''
      };
      delete dati.allegatoFile;
      delete dati.allegatoPercorso;
      delete dati.allegatoNote;
      stato.testata = dati;
      stato.passo = 2;
      renderAllocazione(container);
    });
  }
}

// --- Passo 2: scelta strategia e generazione proposta ---
function renderPasso2(container, contesto) {
  const el = container.querySelector('#passo-2');
  if (!el) return;
  const importo = Number(stato.testata.importoEntrata);

  if (!stato.strategia) {
    el.innerHTML = `
      <div class="form-scheda">
        <h3>2. Strategia di Allocazione</h3>
        <div class="form-azioni">
          <button data-s="manuale">Manuale</button>
          <button data-s="equa">Equa</button>
          <button data-s="proporzionale">Proporzionale</button>
          <button data-s="da_piano">Da Piano (consigliata)</button>
        </div>
      </div>
    `;
    el.querySelectorAll('button[data-s]').forEach((btn) => {
      btn.addEventListener('click', () => {
        stato.strategia = btn.dataset.s;
        stato.righe = [];
        stato.passo = 2; // resta al passo 2 finché non genera righe, poi passa a 3
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
    renderAllocazione(container);
  });
  // Una volta generate le righe (passo 3), non richiamare più avviaStrategia: altrimenti,
  // per la strategia "manuale" (che porta subito al passo 3), si innesca un loop infinito
  // di render (render → avviaStrategia → render → avviaStrategia → ...).
  if (stato.passo < 3) avviaStrategia(container, contesto, importo);
}

function etichettaStrategia(s) {
  return { manuale: 'Manuale', equa: 'Equa', proporzionale: 'Proporzionale', da_piano: 'Da Piano' }[s] || s;
}

async function avviaStrategia(container, contesto, importo) {
  const el = container.querySelector('#config-strategia') || container.querySelector('#passo-2');

  if (stato.strategia === 'manuale') {
    stato.passo = 3;
    renderAllocazione(container);
    return;
  }

  if (stato.strategia === 'equa') {
    const elementiSelezionabili = [
      ...contesto.fondi.map((f) => ({ tipoDestinazione: 'fondo', destinazioneId: f.id, nome: `Fondo: ${f.nome}` })),
      ...contesto.budget.map((b) => ({ tipoDestinazione: 'budget', destinazioneId: b.id, nome: `Budget: ${b.nome}` }))
    ];
    el.innerHTML = `
      <p class="nota">Seleziona gli elementi tra cui dividere in parti uguali:</p>
      <div class="form-scheda">
        ${elementiSelezionabili.map((el2, i) => `
          <label class="riga-checkbox"><input type="checkbox" data-i="${i}"> ${el2.nome}</label>
        `).join('')}
        <button id="btn-calcola-equa" class="btn-primario">Calcola</button>
      </div>
    `;
    el.querySelector('#btn-calcola-equa').addEventListener('click', () => {
      const selezionati = [...el.querySelectorAll('input[type="checkbox"]:checked')]
        .map((c) => elementiSelezionabili[Number(c.dataset.i)]);
      try {
        const righe = calcolaPropostaEqua(importo, selezionati);
        stato.righe = righe.map((r) => ({
          tipoDestinazione: r.tipoDestinazione, destinazioneId: r.destinazioneId, importo: r.importo
        }));
        stato.passo = 3;
        renderAllocazione(container);
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
          ${obiettiviDelFondo.map((o, i) => `
            <label class="riga-checkbox"><input type="checkbox" data-i="${i}"> ${o.nome} (target ${formattaValuta(o.importoTarget)})</label>
          `).join('')}
          <button id="btn-calcola-proporzionale" class="btn-primario">Calcola</button>
        </div>
      `;
      zona.querySelector('#btn-calcola-proporzionale').addEventListener('click', () => {
        const selezionati = [...zona.querySelectorAll('input[type="checkbox"]:checked')]
          .map((c) => obiettiviDelFondo[Number(c.dataset.i)]);
        try {
          const righe = calcolaPropostaProporzionale(importo, selezionati);
          stato.righe = righe.map((r) => ({
            tipoDestinazione: 'obiettivo', destinazioneId: r.destinazioneId, importo: r.importo
          }));
          stato.passo = 3;
          renderAllocazione(container);
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
        <select id="select-piano-entrata">
          ${piani.map((p) => `<option value="${p.id}" ${pianoAttivo && p.id === pianoAttivo.id ? 'selected' : ''}>${p.nome}</option>`).join('')}
        </select>
      </label>
      <button id="btn-usa-piano" class="btn-primario">Usa questo Piano</button>
      <div id="esito-piano-entrata"></div>
    `;

    el.querySelector('#btn-usa-piano').addEventListener('click', async () => {
      const pianoId = el.querySelector('#select-piano-entrata').value;
      const piano = piani.find((p) => p.id === pianoId);
      const voci = await elencoVociPerPiano(pianoId);
      const esito = el.querySelector('#esito-piano-entrata');

      if (voci.length === 0) {
        esito.innerHTML = '<p class="badge badge-errore">Questo Piano non ha ancora Voci configurate.</p>';
        return;
      }
      const calcolo = calcolaRichiestaDaPiano(importo, voci);

      if (calcolo.sufficiente) {
        stato.righe = calcolo.vociCalcolate.map((v) => ({
          tipoDestinazione: v.tipoDestinazione, destinazioneId: v.destinazioneId, importo: v.importoRichiesto
        }));
        // Se il Piano non esaurisce l'intera entrata, di default il residuo resta
        // esplicitamente "disponibilità residua" sul Conto di arrivo (§3.4 FDD, esempio "Conto
        // Principale 400€") — a meno che l'utente non abbia designato un Fondo dove farlo
        // confluire automaticamente (Impostazioni → Registra Entrata), allocato direttamente
        // come riga di questa stessa Entrata.
        const residuo = Math.round((calcolo.importoEntrata - calcolo.totaleRichiesto) * 100) / 100;
        if (residuo > 0.005) {
          const impostazioniEccesso = await ottieniImpostazioniAllocazione();
          if (impostazioniEccesso.destinazioneEccessoTipo === 'fondo') {
            stato.righe.push({ tipoDestinazione: 'fondo', destinazioneId: impostazioniEccesso.destinazioneEccessoId, importo: residuo });
          } else {
            stato.righe.push({ tipoDestinazione: 'residuo_conto', destinazioneId: null, importo: residuo });
          }
        }
        stato.passo = 3;
        renderAllocazione(container);
        return;
      }

      esito.innerHTML = `
        <p class="badge badge-errore">
          ⚠️ Il Piano "${piano.nome}" richiederebbe ${formattaValuta(calcolo.totaleRichiesto)},
          ma l'entrata è di ${formattaValuta(calcolo.importoEntrata)} (mancano ${formattaValuta(calcolo.mancante)}).
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
        renderAllocazione(container);
      });
      esito.querySelector('#btn-risolvi-priorita').addEventListener('click', () => {
        const righe = risolviInsufficienzaPerPriorita(importo, calcolo.vociCalcolate);
        stato.righe = righe.map((v) => ({ tipoDestinazione: v.tipoDestinazione, destinazioneId: v.destinazioneId, importo: v.importo }));
        stato.passo = 3;
        renderAllocazione(container);
      });
    });
  }
}

// --- Passo 3: righe modificabili, controllo somma, conferma ---
function renderPasso3(container, contesto) {
  const el = container.querySelector('#passo-3');
  if (!el) return;
  const importo = Number(stato.testata.importoEntrata);
  const somma = sommaRighe(stato.righe);
  const coincide = importiCoincidono(importo, stato.righe);

  el.innerHTML = `
    <div class="form-scheda" style="max-width:640px;">
      <h3>3. Righe di allocazione (modificabili)</h3>
      <div class="lista-editabile">
        ${stato.righe.map((r, i) => `
          <div class="riga-editabile">
            <span class="riga-editabile-nome">${etichettaElemento(r.tipoDestinazione, r.destinazioneId, contesto)}</span>
            <input type="number" step="any" data-i="${i}" class="input-riga-importo" value="${r.importo}">
            <div class="riga-editabile-azioni">
              <button class="btn-icona" title="Rimuovi riga" data-azione="rimuovi-riga" data-i="${i}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
      <button id="btn-aggiungi-riga"><i class="fa-solid fa-plus"></i> Aggiungi riga</button>
      <div id="form-aggiungi-riga"></div>
      <p class="${coincide ? '' : 'testo-errore'}">
        Totale allocato: ${formattaValuta(somma)} / Entrata: ${formattaValuta(importo)}
        ${coincide ? ' ✓' : ' — la somma deve coincidere con l\'entrata'}
      </p>
      <button id="btn-conferma-allocazione" class="btn-primario" ${coincide ? '' : 'disabled'}>Conferma Allocazione</button>
    </div>
  `;

  el.querySelectorAll('.input-riga-importo').forEach((input) => {
    input.addEventListener('change', () => {
      stato.righe[Number(input.dataset.i)].importo = Number(input.value) || 0;
      renderAllocazione(container);
    });
  });

  el.querySelectorAll('button[data-azione="rimuovi-riga"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stato.righe.splice(Number(btn.dataset.i), 1);
      renderAllocazione(container);
    });
  });

  el.querySelector('#btn-aggiungi-riga').addEventListener('click', () => {
    mostraFormAggiungiRiga(el, container, contesto);
  });

  el.querySelector('#btn-conferma-allocazione').addEventListener('click', async () => {
    try {
      const risultato = await confermaAllocazione({
        data: new Date(stato.testata.data).toISOString(),
        importoEntrata: importo,
        contoOrigineId: stato.testata.contoOrigineId,
        descrizione: stato.testata.descrizione,
        strategia: stato.strategia,
        righe: stato.righe
      });
      await salvaAllegatoSePresente('allocazione', risultato.allocazione.id);
      stato.risultatoConferma = risultato;
      renderAllocazione(container);
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
          <option value="budget">Budget</option>
          <option value="obiettivo">Obiettivo</option>
          <option value="conto">Un altro Conto</option>
          <option value="residuo_conto">Lascia come disponibilità residua</option>
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
    const tipo = selectTipo.value;
    if (tipo === 'residuo_conto') { selectDest.innerHTML = ''; selectDest.disabled = true; return; }
    selectDest.disabled = false;
    const elenco = tipo === 'fondo' ? contesto.fondi : tipo === 'budget' ? contesto.budget : tipo === 'conto' ? contesto.conti : contesto.obiettivi;
    selectDest.innerHTML = elenco.map((e) => `<option value="${e.id}">${e.nome}</option>`).join('');
  };
  selectTipo.addEventListener('change', aggiornaDest);
  aggiornaDest();

  zona.querySelector('#btn-annulla-riga').addEventListener('click', () => { zona.innerHTML = ''; });

  zona.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    stato.righe.push({
      tipoDestinazione: dati.tipoDestinazione,
      destinazioneId: dati.tipoDestinazione === 'residuo_conto' ? null : dati.destinazioneId,
      importo: Number(dati.importo) || 0
    });
    renderAllocazione(container);
  });
}

// --- Esito finale: istruzioni operative ---
function renderEsito(container) {
  const { allocazione, istruzioniOperative } = stato.risultatoConferma;
  container.innerHTML = `
    <section class="pannello">
      <h2>Allocazione confermata ✓</h2>
      <p class="nota">Entrata di ${formattaValuta(allocazione.importoEntrata)} allocata il ${allocazione.data.substring(0, 10)}.</p>
      <h3>Operazioni da effettuare</h3>
      <ul class="elenco-semplice">
        ${istruzioniOperative.map((i) => `
          <li>
            <span class="riga-istruzione-testo">☐ ${i.testo}</span>
            ${i.dettaglio && i.dettaglio.length > 0 ? `
              <div class="elenco-dettaglio-istruzione">
                ${i.dettaglio.map((d) => `<span>${d.tipo ? `${d.tipo}: ` : ''}${d.nome} — ${formattaValuta(d.importo)}</span>`).join('')}
              </div>
            ` : ''}
          </li>
        `).join('')}
      </ul>
      <button id="btn-nuova-entrata" class="btn-primario">Registra un'altra Entrata</button>
    </section>
  `;
  container.querySelector('#btn-nuova-entrata').addEventListener('click', () => {
    stato = statoIniziale();
    renderAllocazione(container);
  });
}
