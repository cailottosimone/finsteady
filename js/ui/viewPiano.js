import {
  elencoPiani, creaPiano, aggiornaPiano, eliminaPiano, impostaPianoAttivo,
  elencoVociPerPiano, creaVocePiano, aggiornaVocePiano, eliminaVocePiano, collegaMovimenti,
  duplicaPiano, impostaBloccoPiano, impostaEntrataSimulataPiano
} from '../domain/piano.js';
import { elencoProspetti } from '../domain/prospetti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoBudget } from '../domain/budget.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { elencoConti } from '../domain/conti.js';
import { calcolaRichiestaDaPiano, calcolaPropostaEqua, calcolaPropostaProporzionale } from '../engine/allocationEngine.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { ordina, filtraTesto } from '../utils/listaUtils.js';
import { mostraConferma, mostraPrompt } from '../utils/dialogUtils.js';

let pianoEspansoId = null;
let mostraCollegaMovimenti = false;
let statoCollegaFondo = {}; // fondoId -> { obiettiviSelezionati: Set, importoTotale, strategia, valoriManuali: {}, valoreFondoIntero }
// "Entrata simulata e riepilogo" è una sezione espandibile, di default compressa (solo titolo +
// chevron) come le analoghe sezioni del Prospetto.
const sezioneSimulazioneEspansa = new Set(); // chiavi pianoId
const stato = { ordineChiave: 'nome', ordineDecrescente: false, ricerca: '' };

const CHIAVI_ORDINAMENTO = {
  nome: (p) => p.nome,
  attivo: (p) => (p.attivo ? 1 : 0)
};

export async function renderPiano(container) {
  const piani = await elencoPiani();

  container.innerHTML = `
    <section class="pannello">
      <h2>Piano</h2>
      <p class="nota">
        Un Piano è una strategia di distribuzione delle entrate future.
        Non contiene denaro, non modifica saldi e non sostituisce Budget, Fondi o Obiettivi —
        descrive solo come le entrate future dovranno essere allocate. Puoi creare più Piani
        (es. "Base", "Nuovo Lavoro", "Simulazione"): ognuno è sempre utilizzabile, sia per
        registrare Entrate reali sia solo per simulare.
      </p>
      <div class="barra-ricerca">
        <input type="text" id="ricerca-piani" placeholder="Cerca per nome..." value="${stato.ricerca}">
      </div>
      <div id="lista-piani"></div>
      <button id="btn-nuovo-piano" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuovo Piano</button>
      <div id="form-piano-container"></div>
    </section>
  `;

  container.querySelector('#ricerca-piani').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, piani);
  });

  await renderTabella(container, piani);

  container.querySelector('#btn-nuovo-piano').addEventListener('click', async () => {
    const nome = await mostraPrompt({ titolo: 'Nuovo Piano', messaggio: 'Nome del nuovo Piano:' });
    if (!nome) return;
    await creaPiano({ nome });
    renderPiano(container);
  });
}

async function renderTabella(container, pianiCompleti) {
  const lista = container.querySelector('#lista-piani');

  let piani = filtraTesto(pianiCompleti, stato.ricerca, (p) => p.nome);
  piani = ordina(piani, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.nome, stato.ordineDecrescente);

  if (piani.length === 0) {
    lista.innerHTML = '<p class="nota">Nessun Piano trovato.</p>';
    return;
  }

  lista.innerHTML = `
    <div class="barra-strumenti-movimenti">
      <label class="nota-inline">Ordina per
        <select id="select-ordina-piani">
          <option value="nome" ${stato.ordineChiave === 'nome' ? 'selected' : ''}>Nome</option>
          <option value="attivo" ${stato.ordineChiave === 'attivo' ? 'selected' : ''}>Predefinito</option>
        </select>
      </label>
      <button type="button" id="btn-direzione-ordina-piani" class="btn-icona" title="${stato.ordineDecrescente ? 'Decrescente' : 'Crescente'}">
        <i class="fa-solid ${stato.ordineDecrescente ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-wide-short'}"></i>
      </button>
    </div>
    <div class="lista-azioni-elenco">
      ${piani.map((p) => renderRigaPiano(p)).join('')}
    </div>
  `;

  const selectOrdina = lista.querySelector('#select-ordina-piani');
  if (selectOrdina) selectOrdina.addEventListener('change', (e) => { stato.ordineChiave = e.target.value; renderTabella(container, pianiCompleti); });
  const btnDirezione = lista.querySelector('#btn-direzione-ordina-piani');
  if (btnDirezione) btnDirezione.addEventListener('click', () => { stato.ordineDecrescente = !stato.ordineDecrescente; renderTabella(container, pianiCompleti); });

  lista.querySelectorAll('button[data-azione="attiva"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(
        'Attivare questo Piano attiverà i Budget collegati alle sue Voci e disattiverà tutti gli altri Budget (compresi quelli non collegati a nessun Piano). Procedere?'
      )) return;
      await impostaPianoAttivo(btn.dataset.id);
      renderPiano(container);
    });
  });

  lista.querySelectorAll('button[data-azione="espandi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pianoEspansoId = pianoEspansoId === btn.dataset.id ? null : btn.dataset.id;
      mostraCollegaMovimenti = false;
      renderPiano(container);
    });
  });

  lista.querySelectorAll('button[data-azione="modifica-piano"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const piano = pianiCompleti.find((p) => p.id === btn.dataset.id);
      const nuovoNome = await mostraPrompt({
        titolo: 'Rinomina Piano',
        messaggio: 'Nuovo nome del Piano:',
        valoreIniziale: piano?.nome || ''
      });
      if (!nuovoNome) return;
      try {
        await aggiornaPiano(btn.dataset.id, { nome: nuovoNome });
        renderPiano(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  lista.querySelectorAll('button[data-azione="elimina-piano"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const piano = pianiCompleti.find((p) => p.id === btn.dataset.id);
      if (piano?.bloccato) {
        alert('Questo Piano è bloccato: sbloccalo prima di eliminarlo.');
        return;
      }
      const prospettiCollegati = (await elencoProspetti()).filter((pr) => pr.pianoId === btn.dataset.id);
      const motiviUso = [];
      if (piano?.attivo) motiviUso.push('è il <strong>Piano predefinito (attivo)</strong>');
      if (prospettiCollegati.length > 0) {
        motiviUso.push(`è collegato a <strong>${prospettiCollegati.length} Prospetto/i</strong> ("${prospettiCollegati.map((pr) => pr.nome).join('", "')}")`);
      }
      const avviso = motiviUso.length > 0
        ? `<p class="badge badge-errore" style="display:block;">⚠️ Attenzione: questo Piano ${motiviUso.join(' e ')}. Eliminandolo, i Prospetti collegati resteranno ma perderanno il riferimento al Piano; nessun Budget resterà attivato da questo Piano.</p>`
        : '';
      const ok = await mostraConferma({
        titolo: 'Eliminare il Piano?',
        messaggio: `${avviso}Eliminare questo Piano e tutte le sue Voci? L'azione è irreversibile.`,
        testoConferma: 'Elimina Piano e Voci',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await eliminaPiano(btn.dataset.id);
        renderPiano(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  lista.querySelectorAll('button[data-azione="duplica-piano"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { copia } = await duplicaPiano(btn.dataset.id);
      alert(`Creato "${copia.nome}" con le stesse Voci, completamente indipendente dall'originale.`);
      renderPiano(container);
    });
  });

  lista.querySelectorAll('button[data-azione="blocca-piano"], button[data-azione="sblocca-piano"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await impostaBloccoPiano(btn.dataset.id, btn.dataset.azione === 'blocca-piano');
      renderPiano(container);
    });
  });

  if (pianoEspansoId) {
    const pianoCorrente = pianiCompleti.find((p) => p.id === pianoEspansoId);
    if (pianoCorrente) await collegaBlocccoVoci(container, pianoCorrente);
  }
}

function renderRigaPiano(p) {
  const espanso = pianoEspansoId === p.id;
  return `
    <div class="riga-elenco-azioni">
      <div class="riga-elenco-azioni-testata">
        <span class="riga-elenco-azioni-titolo">${p.nome}</span>
        ${p.attivo ? '<span class="badge badge-ok">Piano attivo</span>' : ''}
        ${p.bloccato ? '<span class="badge" title="Bloccato: sblocca per modificarne nome o Voci"><i class="fa-solid fa-lock"></i> Bloccato</span>' : ''}
      </div>
      <div class="riga-elenco-azioni-azioni azioni-riga">
        ${p.attivo ? '' : `<button class="btn-icona" title="Attiva questo Piano (attiva i suoi Budget, disattiva gli altri)" data-azione="attiva" data-id="${p.id}"><i class="fa-regular fa-star"></i></button>`}
        <button class="btn-icona" title="${espanso ? 'Chiudi' : 'Voci e simulazione'}" data-azione="espandi" data-id="${p.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button>
        <button class="btn-icona" title="${p.bloccato ? 'Bloccato: sblocca per rinominare' : 'Rinomina'}" data-azione="modifica-piano" data-id="${p.id}" ${p.bloccato ? 'disabled' : ''}><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icona" title="Duplica (nuova copia indipendente, con le stesse Voci)" data-azione="duplica-piano" data-id="${p.id}"><i class="fa-solid fa-clone"></i></button>
        ${p.bloccato
          ? `<button class="btn-icona" title="Sblocca (rendi di nuovo modificabile)" data-azione="sblocca-piano" data-id="${p.id}"><i class="fa-solid fa-lock-open"></i></button>`
          : `<button class="btn-icona" title="Blocca (impedisce modifiche involontarie a nome e Voci)" data-azione="blocca-piano" data-id="${p.id}"><i class="fa-solid fa-lock"></i></button>`}
        <button class="btn-icona" title="${p.bloccato ? 'Bloccato: sblocca per eliminare' : 'Elimina'}" data-azione="elimina-piano" data-id="${p.id}" ${p.bloccato ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
      </div>
      ${espanso ? `
        <div class="riga-elenco-azioni-dettaglio">
          <div id="blocco-voci-${p.id}" class="blocco-obiettivi" style="border-top:none; margin-top:0; padding-top:0;"></div>
        </div>
      ` : ''}
    </div>
  `;
}

async function collegaBlocccoVoci(container, piano) {
  const pianoId = piano.id;
  const blocco = container.querySelector(`#blocco-voci-${pianoId}`);
  if (!blocco) return;

  const [voci, fondi, budget, obiettivi, conti] = await Promise.all([
    elencoVociPerPiano(pianoId), elencoFondi(), elencoBudget(), elencoObiettivi(), elencoConti()
  ]);

  const nomeDestinazione = (v) => {
    if (v.tipoDestinazione === 'fondo') return fondi.find((f) => f.id === v.destinazioneId)?.nome || '—';
    if (v.tipoDestinazione === 'budget') return budget.find((b) => b.id === v.destinazioneId)?.nome || '—';
    if (v.tipoDestinazione === 'conto') return conti.find((c) => c.id === v.destinazioneId)?.nome || '—';
    return obiettivi.find((o) => o.id === v.destinazioneId)?.nome || '—';
  };

  blocco.innerHTML = `
    ${piano.bloccato ? '<p class="badge badge-errore" style="display:block;"><i class="fa-solid fa-lock"></i> Piano bloccato: sblocca (pulsante lucchetto nella riga) per modificare nome o Voci.</p>' : ''}
    ${voci.length === 0 ? '<p class="nota">Nessuna Voce configurata.</p>' : `
      <div class="lista-azioni-elenco">
        ${voci.map((v) => `
          <div class="riga-elenco-azioni">
            <div class="riga-elenco-azioni-testata">
              <span class="riga-elenco-azioni-titolo">${nomeDestinazione(v)}</span>
              <span class="badge">${v.tipoDestinazione}</span>
            </div>
            <div class="riga-elenco-azioni-meta">
              <span>${v.modalitaImporto === 'percentuale' ? v.valore + '%' : formattaValuta(v.valore)} (${v.modalitaImporto})</span>
              <span>· Priorità ${v.priorita}</span>
              <span>· ${v.collegamentoTipo ? `da ${v.collegamentoTipo}` : 'indipendente'}</span>
              ${v.note ? `<span>· ${v.note}</span>` : ''}
            </div>
            <div class="riga-elenco-azioni-azioni azioni-riga">
              <button class="btn-icona" title="Elimina" data-azione="elimina-voce" data-id="${v.id}" ${piano.bloccato ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
    <div class="azioni-riga" style="margin-top:8px;">
      <button id="btn-nuova-voce-${pianoId}" ${piano.bloccato ? 'disabled title="Piano bloccato: sblocca per aggiungere Voci"' : ''}><i class="fa-solid fa-plus"></i> Nuova Voce manuale</button>
      <button id="btn-collega-movimenti-${pianoId}" ${piano.bloccato ? 'disabled title="Piano bloccato: sblocca per collegare movimenti"' : ''}><i class="fa-solid fa-link"></i> Collega Movimenti</button>
    </div>
    <div id="form-voce-${pianoId}"></div>
    <div id="form-collega-${pianoId}"></div>

    <div class="pannello" style="margin-top:16px;">
      <h3 style="cursor:pointer; display:flex; align-items:center; gap:8px; margin:0;" data-azione="toggle-simulazione-piano" data-piano-id="${pianoId}">
        <i class="fa-solid ${sezioneSimulazioneEspansa.has(pianoId) ? 'fa-chevron-up' : 'fa-chevron-down'}"></i> Entrata simulata e riepilogo
      </h3>
      ${sezioneSimulazioneEspansa.has(pianoId) ? `
        <p class="nota">Ogni modifica al Piano aggiorna subito il risultato (§4.7 FDD). Nessun dato viene toccato.</p>
        <label>Entrata simulata
          <input id="input-simulazione-${pianoId}" type="number" step="any" value="${piano.importoEntrataSimulata ?? 2000}">
        </label>
        <div id="risultato-simulazione-${pianoId}" style="margin-top:10px;"></div>
      ` : ''}
    </div>
  `;

  const headerSimulazione = blocco.querySelector('[data-azione="toggle-simulazione-piano"]');
  if (headerSimulazione) {
    headerSimulazione.addEventListener('click', () => {
      if (sezioneSimulazioneEspansa.has(pianoId)) sezioneSimulazioneEspansa.delete(pianoId);
      else sezioneSimulazioneEspansa.add(pianoId);
      renderPiano(container);
    });
  }

  blocco.querySelectorAll('button[data-azione="elimina-voce"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await eliminaVocePiano(btn.dataset.id);
        renderPiano(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  const btnNuovaVoce = blocco.querySelector(`#btn-nuova-voce-${pianoId}`);
  if (!piano.bloccato) {
    btnNuovaVoce.addEventListener('click', () => {
      mostraFormVoce(blocco, pianoId, fondi, budget, obiettivi, conti, container);
    });
  }

  const btnCollegaMovimenti = blocco.querySelector(`#btn-collega-movimenti-${pianoId}`);
  if (!piano.bloccato) {
    btnCollegaMovimenti.addEventListener('click', () => {
      mostraCollegaMovimenti = !mostraCollegaMovimenti;
      if (mostraCollegaMovimenti) mostraFormCollegaMovimenti(blocco, pianoId, budget, obiettivi, fondi, container);
      else blocco.querySelector(`#form-collega-${pianoId}`).innerHTML = '';
    });
    if (mostraCollegaMovimenti) mostraFormCollegaMovimenti(blocco, pianoId, budget, obiettivi, fondi, container);
  }

  const inputSim = blocco.querySelector(`#input-simulazione-${pianoId}`);
  if (inputSim) {
    const eseguiSimulazione = () => {
    const importoSimulazione = Number(inputSim.value) || 0;
    const risultato = blocco.querySelector(`#risultato-simulazione-${pianoId}`);
    if (voci.length === 0) {
      risultato.innerHTML = '<p class="nota">Nessuna Voce configurata: non è possibile simulare.</p>';
      return;
    }
    const calcolo = calcolaRichiestaDaPiano(importoSimulazione, voci);
    const residuo = calcolo.sufficiente ? arrotondaLocale(calcolo.importoEntrata - calcolo.totaleRichiesto) : 0;
    const gruppiPerConto = raggruppaVociPerConto(calcolo.vociCalcolate, { fondi, budget, obiettivi, conti });
    risultato.innerHTML = `
      <p class="nota-inline">Totale allocato: <strong>${formattaValuta(calcolo.totaleRichiesto)}</strong></p>
      ${calcolo.sufficiente
        ? `<p class="badge badge-ok">Copertura completa. Residuo non allocato: ${formattaValuta(residuo)}</p>`
        : `<p class="badge badge-errore">⚠️ Entrata insufficiente: mancano ${formattaValuta(calcolo.mancante)} per coprire tutte le voci.</p>`}
      ${gruppiPerConto.length === 0 ? '<p class="nota">Nessuna destinazione da riepilogare.</p>' : `
        <div class="albero-riepilogo" style="margin-top:8px;">
          ${gruppiPerConto.map((g) => {
            const totaleConto = arrotondaLocale(g.righe.reduce((s, r) => s + r.importo, 0));
            return `
              <div class="albero-riga livello-0">
                <span class="albero-riga-nome">${g.conto.nome}</span>
                <span class="albero-riga-valore">${formattaValuta(totaleConto)}</span>
              </div>
              ${g.righe.map((r) => `
                <div class="albero-riga livello-1">
                  <span class="albero-riga-nome">${r.tipo === 'budget' ? 'Budget: ' : r.tipo === 'liquidita' ? '' : 'Fondo: '}${r.nome}</span>
                  <span class="albero-riga-valore">${formattaValuta(r.importo)}</span>
                </div>
                ${r.sotto.map((s) => `
                  <div class="albero-riga livello-2">
                    <span class="albero-riga-nome">Obiettivo: ${s.nome}</span>
                    <span class="albero-riga-valore">${formattaValuta(s.importo)}</span>
                  </div>
                `).join('')}
              `).join('')}
            `;
          }).join('')}
          ${residuo > 0.005 ? `
            <div class="albero-riga livello-0">
              <span class="albero-riga-nome">Residuo non allocato</span>
              <span class="albero-riga-valore">${formattaValuta(residuo)}</span>
            </div>
          ` : ''}
        </div>
      `}
    `;
    };
    inputSim.addEventListener('change', async () => {
      eseguiSimulazione();
      // Persistito indipendentemente dal blocco del Piano: è un valore di lavoro per simulare,
      // non parte della strategia (Voci) — vedi commento su impostaEntrataSimulataPiano. Serve
      // anche come default proposto quando si crea un Prospetto basato su questo Piano.
      try {
        await impostaEntrataSimulataPiano(pianoId, inputSim.value);
      } catch { /* valore comunque già mostrato: nessun blocco dell'interfaccia se il salvataggio fallisce */ }
    });
    eseguiSimulazione();
  }
}

function arrotondaLocale(v) {
  const a = Math.round(v * 100) / 100;
  return a === 0 ? 0 : a;
}

// Raggruppa le Voci calcolate per Conto coinvolto, per un riepilogo sintetico e gerarchico:
// Conto → Budget (riga propria) / Fondo (riga aggregata: voce diretta al Fondo + voci verso i
// suoi Obiettivi, questi ultimi mostrati come dettaglio) / Conto → liquidità diretta (Voce con
// tipoDestinazione 'conto'). Un Obiettivo appartiene sempre al Conto del proprio Fondo, mai
// elencato separatamente. Solo i Conti realmente coinvolti da almeno una Voce compaiono.
function raggruppaVociPerConto(vociCalcolate, { fondi, budget, obiettivi, conti }) {
  const mappaConto = new Map();
  const ottieniGruppo = (contoId) => {
    if (!mappaConto.has(contoId)) {
      mappaConto.set(contoId, { conto: conti.find((c) => c.id === contoId) || { id: contoId, nome: '(Conto eliminato)' }, righe: [] });
    }
    return mappaConto.get(contoId);
  };

  vociCalcolate.filter((v) => v.tipoDestinazione === 'budget').forEach((v) => {
    const b = budget.find((x) => x.id === v.destinazioneId);
    if (!b) return;
    ottieniGruppo(b.contoId).righe.push({ tipo: 'budget', nome: b.nome, importo: v.importoRichiesto, sotto: [] });
  });

  vociCalcolate.filter((v) => v.tipoDestinazione === 'conto').forEach((v) => {
    ottieniGruppo(v.destinazioneId).righe.push({ tipo: 'liquidita', nome: 'Liquidità diretta', importo: v.importoRichiesto, sotto: [] });
  });

  const mappaFondoRiga = new Map(); // fondoId -> { riga, contoId }
  const ottieniRigaFondo = (fondo) => {
    if (!mappaFondoRiga.has(fondo.id)) {
      mappaFondoRiga.set(fondo.id, { riga: { tipo: 'fondo', nome: fondo.nome, importo: 0, sotto: [] }, contoId: fondo.contoId });
    }
    return mappaFondoRiga.get(fondo.id);
  };
  vociCalcolate.filter((v) => v.tipoDestinazione === 'fondo').forEach((v) => {
    const f = fondi.find((x) => x.id === v.destinazioneId);
    if (!f) return;
    const voceFondo = ottieniRigaFondo(f);
    voceFondo.riga.importo = arrotondaLocale(voceFondo.riga.importo + v.importoRichiesto);
  });
  vociCalcolate.filter((v) => v.tipoDestinazione === 'obiettivo').forEach((v) => {
    const o = obiettivi.find((x) => x.id === v.destinazioneId);
    const f = o && fondi.find((x) => x.id === o.fondoId);
    if (!f) return;
    const voceFondo = ottieniRigaFondo(f);
    voceFondo.riga.importo = arrotondaLocale(voceFondo.riga.importo + v.importoRichiesto);
    voceFondo.riga.sotto.push({ nome: o.nome, importo: v.importoRichiesto });
  });
  mappaFondoRiga.forEach(({ riga, contoId }) => ottieniGruppo(contoId).righe.push(riga));

  return [...mappaConto.values()]
    .filter((g) => g.righe.length > 0)
    .sort((a, b) => a.conto.nome.localeCompare(b.conto.nome));
}

function mostraFormCollegaMovimenti(blocco, pianoId, budget, obiettivi, fondi, container) {
  const zona = blocco.querySelector(`#form-collega-${pianoId}`);
  const obiettiviPerFondo = (fondoId) => obiettivi.filter((o) => o.fondoId === fondoId);

  zona.innerHTML = `
    <div class="form-scheda">
      <h4>Collega Movimenti</h4>
      <p class="nota">
        Seleziona i Budget, i Fondi e gli Obiettivi da cui creare automaticamente una Voce di
        Piano (copia iniziale di nome e importo previsto, poi completamente modificabile e
        indipendente: non resta sincronizzata con l'originale). Selezionando un Fondo che ha
        Obiettivi, puoi scegliere quali interessano e come dividere l'importo tra loro.
      </p>
      <p class="nota-inline"><strong>Budget</strong></p>
      ${budget.map((b, i) => `<label class="riga-checkbox"><input type="checkbox" data-tipo="budget" data-i="${i}"> ${b.nome} (${formattaValuta(b.importoAssegnatoDefault)})</label>`).join('') || '<p class="nota">Nessun Budget.</p>'}

      <p class="nota-inline" style="margin-top:8px;"><strong>Fondi</strong></p>
      ${fondi.map((f) => `
        <label class="riga-checkbox"><input type="checkbox" class="checkbox-fondo-collega" data-fondo-id="${f.id}"> ${f.nome} (saldo ${formattaValuta(f.saldo)})</label>
        <div class="dettaglio-fondo-collega" data-fondo-id="${f.id}" style="display:none; margin-left:24px; margin-bottom:8px;"></div>
      `).join('') || '<p class="nota">Nessun Fondo.</p>'}

      <p class="nota-inline" style="margin-top:8px;"><strong>Obiettivi (singoli, indipendenti da un Fondo)</strong></p>
      ${obiettivi.map((o, i) => `<label class="riga-checkbox"><input type="checkbox" data-tipo="obiettivo" data-i="${i}"> ${o.nome}</label>`).join('') || '<p class="nota">Nessun Obiettivo.</p>'}

      <div class="form-azioni">
        <button id="btn-conferma-collega-${pianoId}" class="btn-primario">Collega selezionati</button>
      </div>
    </div>
  `;

  fondi.forEach((f) => {
    const obiettiviFondo = obiettiviPerFondo(f.id);
    const checkboxFondo = zona.querySelector(`.checkbox-fondo-collega[data-fondo-id="${f.id}"]`);
    const dettaglio = zona.querySelector(`.dettaglio-fondo-collega[data-fondo-id="${f.id}"]`);

    checkboxFondo.addEventListener('change', () => {
      if (!checkboxFondo.checked) {
        dettaglio.style.display = 'none';
        dettaglio.innerHTML = '';
        delete statoCollegaFondo[f.id];
        return;
      }
      if (!statoCollegaFondo[f.id]) {
        statoCollegaFondo[f.id] = {
          obiettiviSelezionati: new Set(obiettiviFondo.map((o) => o.id)),
          importoTotale: 0,
          strategia: 'equa',
          valoriManuali: {},
          valoreFondoIntero: 0
        };
      }
      dettaglio.style.display = '';
      renderDettaglioFondoCollega(dettaglio, f, obiettiviFondo);
    });
  });

  zona.querySelector(`#btn-conferma-collega-${pianoId}`).addEventListener('click', async () => {
    const selezionati = [];

    zona.querySelectorAll('input[type="checkbox"][data-tipo]:checked').forEach((cb) => {
      const elenco = cb.dataset.tipo === 'budget' ? budget : obiettivi;
      selezionati.push({ tipo: cb.dataset.tipo, id: elenco[Number(cb.dataset.i)].id });
    });

    for (const f of fondi) {
      const s = statoCollegaFondo[f.id];
      if (!s) continue;
      const obiettiviFondo = obiettiviPerFondo(f.id);
      if (obiettiviFondo.length === 0) {
        selezionati.push({ tipo: 'fondo', id: f.id, valore: s.valoreFondoIntero || 0 });
      } else {
        calcolaRigheFondoCollega(f, obiettiviFondo, s).forEach((r) => {
          if (s.obiettiviSelezionati.has(r.id)) selezionati.push({ tipo: 'obiettivo', id: r.id, valore: r.importo });
        });
      }
    }

    if (selezionati.length === 0) { alert('Seleziona almeno un elemento.'); return; }
    await collegaMovimenti(pianoId, selezionati);
    statoCollegaFondo = {};
    mostraCollegaMovimenti = false;
    renderPiano(container);
  });
}

function renderDettaglioFondoCollega(dettaglio, fondo, obiettiviFondo) {
  const s = statoCollegaFondo[fondo.id];
  if (!s) return;

  if (obiettiviFondo.length === 0) {
    dettaglio.innerHTML = `
      <label>Importo per questo Fondo (nessun Obiettivo tra cui dividere)
        <input type="number" step="any" class="input-valore-fondo-intero" value="${s.valoreFondoIntero || ''}">
      </label>
    `;
    dettaglio.querySelector('.input-valore-fondo-intero').addEventListener('input', (e) => {
      s.valoreFondoIntero = Number(e.target.value) || 0;
    });
    return;
  }

  dettaglio.innerHTML = `
    <label>Importo totale da dividere tra gli Obiettivi selezionati
      <input type="number" step="any" class="input-importo-totale-fondo" value="${s.importoTotale || ''}">
    </label>
    <label>Strategia
      <select class="select-strategia-fondo">
        <option value="equa" ${s.strategia === 'equa' ? 'selected' : ''}>Equa</option>
        <option value="proporzionale" ${s.strategia === 'proporzionale' ? 'selected' : ''}>Proporzionale (per Importo Target)</option>
        <option value="manuale" ${s.strategia === 'manuale' ? 'selected' : ''}>Manuale</option>
      </select>
    </label>
    <div class="lista-editabile" style="margin-top:8px;">
      ${obiettiviFondo.map((o) => `
        <div class="riga-editabile">
          <span class="riga-editabile-checkbox"><input type="checkbox" class="checkbox-obiettivo-fondo checkbox-quadrata" data-obiettivo-id="${o.id}" ${s.obiettiviSelezionati.has(o.id) ? 'checked' : ''}></span>
          <span class="riga-editabile-nome">${o.nome}</span>
          <input type="number" step="any" class="input-importo-obiettivo-fondo" data-obiettivo-id="${o.id}" value="0">
        </div>
      `).join('')}
    </div>
  `;

  aggiornaValoriRigheFondoCollega(dettaglio, fondo, obiettiviFondo);

  // IMPORTANTE: qui NON si ricostruisce l'HTML (niente dettaglio.innerHTML) — altrimenti
  // l'input attivo perderebbe il focus a ogni carattere digitato (stesso bug già corretto altrove
  // nell'app, es. barre di ricerca: l'input che genera l'evento resta sempre fuori dalla zona che
  // viene rigenerata). Si aggiornano solo i valori calcolati nelle celle della tabella.
  dettaglio.querySelector('.input-importo-totale-fondo').addEventListener('input', (e) => {
    s.importoTotale = Number(e.target.value) || 0;
    aggiornaValoriRigheFondoCollega(dettaglio, fondo, obiettiviFondo);
  });
  // Il cambio di Strategia o della selezione degli Obiettivi non avviene mentre si digita:
  // qui ricostruire l'intero blocco è sicuro (serve comunque per abilitare/disabilitare gli
  // input manuali) e non causa perdita di focus percepibile.
  dettaglio.querySelector('.select-strategia-fondo').addEventListener('change', (e) => {
    s.strategia = e.target.value;
    renderDettaglioFondoCollega(dettaglio, fondo, obiettiviFondo);
  });
  dettaglio.querySelectorAll('.checkbox-obiettivo-fondo').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) s.obiettiviSelezionati.add(cb.dataset.obiettivoId);
      else s.obiettiviSelezionati.delete(cb.dataset.obiettivoId);
      renderDettaglioFondoCollega(dettaglio, fondo, obiettiviFondo);
    });
  });
  dettaglio.querySelectorAll('.input-importo-obiettivo-fondo').forEach((input) => {
    input.addEventListener('input', () => {
      s.valoriManuali[input.dataset.obiettivoId] = Number(input.value) || 0;
    });
  });
}

// Aggiorna solo i .value/.disabled delle celle Importo, senza toccare il DOM circostante —
// chiamata sia dopo la costruzione iniziale sia a ogni digitazione nell'Importo totale.
function aggiornaValoriRigheFondoCollega(dettaglio, fondo, obiettiviFondo) {
  const s = statoCollegaFondo[fondo.id];
  if (!s) return;
  const righe = calcolaRigheFondoCollega(fondo, obiettiviFondo, s);

  obiettiviFondo.forEach((o) => {
    const input = dettaglio.querySelector(`.input-importo-obiettivo-fondo[data-obiettivo-id="${o.id}"]`);
    if (!input) return;
    const selezionato = s.obiettiviSelezionati.has(o.id);
    input.disabled = s.strategia !== 'manuale' || !selezionato;
    if (s.strategia !== 'manuale') {
      const riga = righe.find((r) => r.id === o.id);
      input.value = riga ? riga.importo : 0;
    }
    // In modalità Manuale non si sovrascrive il valore: è l'utente a scriverlo direttamente.
  });
}

// Calcola l'importo proposto per ciascun Obiettivo selezionato di un Fondo, secondo la
// strategia scelta — stesso linguaggio (Equa/Proporzionale/Manuale) già usato altrove
// nell'app per dividere un importo tra più destinazioni (Registra Entrata, Ridistribuisci).
function calcolaRigheFondoCollega(fondo, obiettiviFondo, s) {
  const selezionati = obiettiviFondo.filter((o) => s.obiettiviSelezionati.has(o.id));
  if (selezionati.length === 0) return [];

  if (s.strategia === 'manuale') {
    return selezionati.map((o) => ({ id: o.id, importo: s.valoriManuali[o.id] != null ? s.valoriManuali[o.id] : 0 }));
  }
  if (s.strategia === 'proporzionale') {
    try {
      return calcolaPropostaProporzionale(s.importoTotale || 0, selezionati).map((r) => ({ id: r.destinazioneId, importo: r.importo }));
    } catch {
      return selezionati.map((o) => ({ id: o.id, importo: 0 }));
    }
  }
  try {
    return calcolaPropostaEqua(s.importoTotale || 0, selezionati.map((o) => ({ id: o.id }))).map((r) => ({ id: r.id, importo: r.importo }));
  } catch {
    return selezionati.map((o) => ({ id: o.id, importo: 0 }));
  }
}

function mostraFormVoce(blocco, pianoId, fondi, budget, obiettivi, conti, container) {
  const formEl = blocco.querySelector(`#form-voce-${pianoId}`);
  formEl.innerHTML = `
    <form class="form-scheda">
      <h4>Nuova Voce</h4>
      <label>Tipo destinazione *
        <select name="tipoDestinazione" required>
          <option value="fondo">Fondo</option>
          <option value="budget">Budget</option>
          <option value="obiettivo">Obiettivo</option>
          <option value="conto">Conto</option>
        </select>
      </label>
      <label>Destinazione *
        <select name="destinazioneId" required></select>
      </label>
      <label>Modalità importo *
        <select name="modalitaImporto" required>
          <option value="fisso">Importo fisso (€)</option>
          <option value="percentuale">Percentuale dell'entrata (%)</option>
        </select>
      </label>
      <label>Valore *<input name="valore" type="number" step="any" required></label>
      <label>Priorità<input name="priorita" type="number" value="0"></label>
      <label>Note (facoltative)<input name="note" placeholder="es. motivo, promemoria..."></label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva</button>
        <button type="button" class="btn-annulla-voce">Annulla</button>
      </div>
    </form>
  `;

  const selectTipo = formEl.querySelector('select[name="tipoDestinazione"]');
  const selectDest = formEl.querySelector('select[name="destinazioneId"]');
  const aggiornaOpzioniDestinazione = () => {
    const elenco = selectTipo.value === 'fondo' ? fondi
      : selectTipo.value === 'budget' ? budget
      : selectTipo.value === 'conto' ? conti : obiettivi;
    selectDest.innerHTML = elenco.map((el) => `<option value="${el.id}">${el.nome}</option>`).join('');
  };
  selectTipo.addEventListener('change', aggiornaOpzioniDestinazione);
  aggiornaOpzioniDestinazione();

  formEl.querySelector('.btn-annulla-voce').addEventListener('click', () => { formEl.innerHTML = ''; });

  formEl.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    dati.pianoId = pianoId;
    try {
      await creaVocePiano(dati);
      renderPiano(container);
    } catch (err) {
      alert(err.message);
    }
  });
}
