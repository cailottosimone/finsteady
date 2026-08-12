// Vista Ciclo Budget (Fase 2): impostazioni globali del periodo (espandibile, per evitare
// modifiche accidentali), apertura/chiusura del ciclo con assistente per la gestione del
// residuo (mai un automatismo) — sia singolarmente sia per tutti i Budget insieme.

import { elencoBudget } from '../domain/budget.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { ottieniImpostazioniCiclo, impostaImpostazioniCiclo } from '../domain/impostazioniCiclo.js';
import {
  apriNuovoCiclo, chiudiCiclo, elencoCicliAperti, elencoTuttiICicli,
  elencoCicliRiapribili, riapriCiclo, riapriTuttiICicli, stornaAperturaCiclo
} from '../domain/budgetCicli.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { formattaData } from '../utils/dateUtils.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { elencoPeriodiSenzaConsuntivo, creaConsuntivo } from '../domain/consuntivi.js';
import { mostraConferma } from '../utils/dialogUtils.js';

let impostazioniEspanse = false;
let modalitaBulk = false;
let cicloInChiusuraId = null; // chiusura di una singola riga, alternativa al bulk
let statoChiusura = {}; // cicloId -> { utilizzato: string, scelta: string, tipoControparte: 'fondo'|'obiettivo', controparteId: string }
let periodiSenzaConsuntivoAttuali = []; // aggiornato ad ogni renderCicloBudget, letto da renderZonaCicloCorrente
const statoStorico = { ordineChiave: 'periodoInizio', ordineDecrescente: true, ricerca: '' };

export async function renderCicloBudget(container) {
  const [impostazioni, budget, fondi, obiettivi, cicliAperti, tuttiICicli, cicliRiapribili, periodiSenzaConsuntivo] = await Promise.all([
    ottieniImpostazioniCiclo(), elencoBudget(), elencoFondi(), elencoObiettivi(), elencoCicliAperti(), elencoTuttiICicli(),
    elencoCicliRiapribili(), elencoPeriodiSenzaConsuntivo()
  ]);
  const cicliChiusi = tuttiICicli.filter((c) => c.stato === 'chiuso');
  const mappaBudget = new Map(budget.map((b) => [b.id, b]));
  const idRiapribili = new Set(cicliRiapribili.map((c) => c.id));
  periodiSenzaConsuntivoAttuali = periodiSenzaConsuntivo;

  container.innerHTML = `
    <button id="btn-torna-budget" class="link-testuale"><i class="fa-solid fa-arrow-left"></i> Torna a Conti / Budget</button>

    <section class="pannello">
      <h2>Impostazioni Ciclo</h2>
      <p class="nota">
        Modalità attuale: <strong>${impostazioni.modalita === 'mese_solare' ? 'Mese solare' : `Custom (dal ${impostazioni.giornoInizioCustom})`}</strong>
        — un'unica impostazione globale, si applica a tutti i Budget insieme.
      </p>
      <button id="btn-espandi-impostazioni">${impostazioniEspanse ? 'Chiudi' : 'Modifica impostazioni'}</button>
      <div id="form-impostazioni-container"></div>
    </section>

    <section class="pannello">
      <h2>Ciclo Corrente</h2>
      <div id="zona-ciclo-corrente"></div>
    </section>

    <section class="pannello">
      <h2>Storico Cicli</h2>
      ${cicliRiapribili.length > 0 ? `
        <p class="nota">
          ${cicliRiapribili.length} Ciclo/i chiuso/i può/possono ancora essere riaperto/i (nessun periodo successivo aperto).
        </p>
        <div class="azioni-riga">
          <button id="btn-riapri-tutti"><i class="fa-solid fa-lock-open"></i> Riapri tutti i Cicli riapribili</button>
          <button id="btn-storna-apertura"><i class="fa-solid fa-trash-can"></i> Storna apertura di questo periodo</button>
        </div>
      ` : ''}
      <div class="barra-ricerca">
        <input type="text" id="ricerca-storico" placeholder="Cerca per Budget..." value="${statoStorico.ricerca}">
      </div>
      <div id="tabella-storico"></div>
    </section>
  `;

  container.querySelector('#btn-torna-budget').addEventListener('click', () => {
    window.mostraVista('conti');
  });

  container.querySelector('#btn-espandi-impostazioni').addEventListener('click', () => {
    impostazioniEspanse = !impostazioniEspanse;
    renderCicloBudget(container);
  });

  if (impostazioniEspanse) {
    renderFormImpostazioni(container, impostazioni);
  }

  renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);

  container.querySelector('#ricerca-storico').addEventListener('input', (e) => {
    statoStorico.ricerca = e.target.value;
    renderStorico(container, cicliChiusi, mappaBudget, idRiapribili);
  });
  renderStorico(container, cicliChiusi, mappaBudget, idRiapribili);

  const btnRiapriTutti = container.querySelector('#btn-riapri-tutti');
  if (btnRiapriTutti) {
    btnRiapriTutti.addEventListener('click', async () => {
      if (!confirm(
        `Riaprire tutti i ${cicliRiapribili.length} Cicli chiusi ancora riapribili? ` +
        'Ogni eventuale Trasferimento generato in chiusura (residuo trasferito a un Fondo/Obiettivo, o sforamento coperto da un Fondo/Obiettivo) verrà stornato.'
      )) return;
      try {
        const { riaperti, saltati } = await riapriTuttiICicli();
        const messaggioSaltati = saltati.length > 0
          ? `\n\nNon riaperti: ${saltati.map((s) => mappaBudget.get(s.budgetId)?.nome || s.budgetId).join(', ')}`
          : '';
        alert(`Riaperti ${riaperti.length} Cicli.${messaggioSaltati}`);
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const btnStornaApertura = container.querySelector('#btn-storna-apertura');
  if (btnStornaApertura) {
    btnStornaApertura.addEventListener('click', async () => {
      const periodo = cicliRiapribili[0];
      const ok = await mostraConferma({
        titolo: 'Stornare apertura di questo periodo?',
        messaggio:
          `Il periodo ${formattaData(periodo.periodoInizio)} — ${formattaData(periodo.periodoFine)} ` +
          `(${cicliRiapribili.length} Budget) verrà eliminato completamente, come se non fosse mai stato ` +
          'aperto. I Budget torneranno alla disponibilità del ciclo precedente. Un eventuale Trasferimento ' +
          'generato in chiusura verrà stornato (resta visibile nel Registro Movimenti). Operazione ' +
          'irreversibile.',
        testoConferma: 'Storna apertura',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await stornaAperturaCiclo(periodo.periodoInizio, periodo.periodoFine);
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

function renderFormImpostazioni(container, impostazioni) {
  const zona = container.querySelector('#form-impostazioni-container');
  zona.innerHTML = `
    <form id="form-impostazioni" class="form-scheda">
      <label>Modalità
        <select name="modalita">
          <option value="mese_solare" ${impostazioni.modalita === 'mese_solare' ? 'selected' : ''}>Mese solare (1° - ultimo giorno del mese)</option>
          <option value="custom" ${impostazioni.modalita === 'custom' ? 'selected' : ''}>Intervallo custom</option>
        </select>
      </label>
      <label id="label-giorno-custom" style="${impostazioni.modalita === 'custom' ? '' : 'display:none;'}">
        Giorno di inizio ciclo (1-28)
        <input type="number" name="giornoInizioCustom" min="1" max="28" value="${impostazioni.giornoInizioCustom}">
      </label>
      <p class="nota">Attenzione: cambiare modalità influenza solo i prossimi Cicli da aprire, non quelli già aperti o chiusi.</p>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva impostazioni</button>
      </div>
    </form>
  `;

  const selectModalita = zona.querySelector('select[name="modalita"]');
  selectModalita.addEventListener('change', () => {
    zona.querySelector('#label-giorno-custom').style.display = selectModalita.value === 'custom' ? '' : 'none';
  });

  zona.querySelector('#form-impostazioni').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    try {
      await impostaImpostazioniCiclo(dati);
      impostazioniEspanse = false;
      renderCicloBudget(container);
    } catch (err) {
      alert(err.message);
    }
  });
}

function renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi) {
  const zona = container.querySelector('#zona-ciclo-corrente');

  if (cicliAperti.length === 0) {
    const daFotografare = periodiSenzaConsuntivoAttuali[0] || null;
    zona.innerHTML = `
      <p class="nota">Nessun Ciclo aperto. Aprendo un nuovo Ciclo, verrà creato un Ciclo per ogni Budget attivo, tutti con lo stesso periodo.</p>
      ${daFotografare ? `
        <p class="nota">
          Il periodo ${formattaData(daFotografare.periodoInizio)} — ${formattaData(daFotografare.periodoFine)} è
          completamente chiuso e non ha ancora un Consuntivo.
        </p>
        <button id="btn-genera-consuntivo"><i class="fa-solid fa-camera"></i> Genera Consuntivo per questo periodo</button>
      ` : ''}
      <button id="btn-apri-ciclo" class="btn-primario">Apri Nuovo Ciclo</button>
    `;
    const btnConsuntivo = zona.querySelector('#btn-genera-consuntivo');
    if (btnConsuntivo) {
      btnConsuntivo.addEventListener('click', async () => {
        try {
          await creaConsuntivo({ periodoInizio: daFotografare.periodoInizio, periodoFine: daFotografare.periodoFine });
          alert('Consuntivo generato. Lo trovi nella vista "Consuntivi".');
          renderCicloBudget(container);
        } catch (err) {
          alert(err.message);
        }
      });
    }
    zona.querySelector('#btn-apri-ciclo').addEventListener('click', async () => {
      try {
        const { periodo, cicli } = await apriNuovoCiclo();
        alert(`Aperto nuovo Ciclo dal ${formattaData(periodo.inizio.toISOString())} al ${formattaData(periodo.fine.toISOString())} per ${cicli.length} Budget.`);
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
    return;
  }

  const periodo = cicliAperti[0];
  zona.innerHTML = `
    <p class="nota">Periodo: ${formattaData(periodo.periodoInizio)} — ${formattaData(periodo.periodoFine)}</p>
    ${!modalitaBulk ? `
      <div class="azioni-riga">
        <button id="btn-chiudi-tutti" class="btn-primario">Chiudi tutti i Cicli</button>
        <button id="btn-storna-apertura-corrente"><i class="fa-solid fa-trash-can"></i> Storna apertura (aperto per errore)</button>
      </div>
    ` : `<button id="btn-valorizza-tutti-default">Valorizza tutti a budget</button>`}
    <table class="tabella">
      <thead><tr><th>Budget</th><th>Assegnato</th><th>Riporto</th><th>Disponibilità</th><th></th></tr></thead>
      <tbody>
        ${cicliAperti.map((c) => {
          const budgetNome = mappaBudget.get(c.budgetId)?.nome || '—';
          const disponibilita = Math.round((c.importoAssegnato + c.riportoIniziale) * 100) / 100;
          const mostraForm = modalitaBulk || cicloInChiusuraId === c.id;
          return `
            <tr>
              <td>${budgetNome}</td>
              <td class="numero">${formattaValuta(c.importoAssegnato)}</td>
              <td class="numero ${c.riportoIniziale < 0 ? 'testo-errore' : ''}">${formattaValuta(c.riportoIniziale)}</td>
              <td class="numero">${formattaValuta(disponibilita)}</td>
              <td>${modalitaBulk ? '' : `<div class="azioni-riga"><button class="btn-icona" title="Chiudi Ciclo" data-azione="chiudi" data-id="${c.id}"><i class="fa-solid fa-lock"></i></button></div>`}</td>
            </tr>
            ${mostraForm ? `<tr><td colspan="5">${renderFormChiusura(c, budgetNome, fondi, obiettivi)}</td></tr>` : ''}
          `;
        }).join('')}
      </tbody>
    </table>
    ${modalitaBulk ? `
      <div class="form-azioni">
        <button id="btn-conferma-tutte" class="btn-primario">Conferma tutte le chiusure compilate</button>
        <button id="btn-annulla-bulk">Annulla</button>
      </div>
    ` : ''}
  `;

  const btnValorizzaTutti = zona.querySelector('#btn-valorizza-tutti-default');
  if (btnValorizzaTutti) {
    btnValorizzaTutti.addEventListener('click', () => {
      cicliAperti.forEach((c) => {
        const disponibilita = Math.round((c.importoAssegnato + c.riportoIniziale) * 100) / 100;
        if (!statoChiusura[c.id]) statoChiusura[c.id] = { utilizzato: '', scelta: '', tipoControparte: 'fondo', controparteId: '' };
        statoChiusura[c.id].utilizzato = String(disponibilita);
      });
      renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
    });
  }

  const btnChiudiTutti = zona.querySelector('#btn-chiudi-tutti');
  if (btnChiudiTutti) {
    btnChiudiTutti.addEventListener('click', () => {
      modalitaBulk = true;
      statoChiusura = {};
      renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
    });
  }

  const btnStornaAperturaCorrente = zona.querySelector('#btn-storna-apertura-corrente');
  if (btnStornaAperturaCorrente) {
    btnStornaAperturaCorrente.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Stornare apertura di questo periodo?',
        messaggio:
          `Il periodo ${formattaData(periodo.periodoInizio)} — ${formattaData(periodo.periodoFine)} ` +
          `(${cicliAperti.length} Budget) verrà eliminato completamente, come se non fosse mai stato ` +
          'aperto. I Budget torneranno alla disponibilità del ciclo precedente. Operazione irreversibile.',
        testoConferma: 'Storna apertura',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await stornaAperturaCiclo(periodo.periodoInizio, periodo.periodoFine);
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const btnAnnullaBulk = zona.querySelector('#btn-annulla-bulk');
  if (btnAnnullaBulk) {
    btnAnnullaBulk.addEventListener('click', () => {
      modalitaBulk = false;
      statoChiusura = {};
      renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
    });
  }

  const btnConfermaTutte = zona.querySelector('#btn-conferma-tutte');
  if (btnConfermaTutte) {
    btnConfermaTutte.addEventListener('click', async () => {
      const completati = [];
      const saltati = [];
      for (const c of cicliAperti) {
        const dati = statoChiusura[c.id];
        if (!dati || dati.utilizzato === undefined || dati.utilizzato === '') { saltati.push(mappaBudget.get(c.budgetId)?.nome || c.budgetId); continue; }
        const residuo = Math.round((c.importoAssegnato + c.riportoIniziale - Number(dati.utilizzato)) * 100) / 100;
        if (Math.abs(residuo) > 0.005 && !dati.scelta) { saltati.push(mappaBudget.get(c.budgetId)?.nome || c.budgetId); continue; }
        completati.push({ c, dati });
      }
      if (completati.length === 0) {
        alert('Nessun Ciclo pronto per la chiusura: inserisci almeno "quanto hai speso" per un Budget.');
        return;
      }
      try {
        for (const { c, dati } of completati) {
          await chiudiCiclo(c.id, dati.utilizzato, dati.scelta || null, dati.tipoControparte, dati.controparteId || undefined);
        }
        modalitaBulk = false;
        statoChiusura = {};
        const messaggioSaltati = saltati.length > 0 ? `\n\nNon chiusi (dati incompleti): ${saltati.join(', ')}` : '';
        alert(`Chiusi ${completati.length} Cicli.${messaggioSaltati}`);
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  zona.querySelectorAll('button[data-azione="chiudi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cicloInChiusuraId = cicloInChiusuraId === btn.dataset.id ? null : btn.dataset.id;
      if (!statoChiusura[btn.dataset.id]) statoChiusura[btn.dataset.id] = { utilizzato: '', scelta: '', tipoControparte: 'fondo', controparteId: '' };
      renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
    });
  });

  collegaEventiFormChiusura(container, cicliAperti, mappaBudget, fondi, obiettivi);
}

function renderFormChiusura(ciclo, budgetNome, fondi, obiettivi) {
  if (!statoChiusura[ciclo.id]) statoChiusura[ciclo.id] = { utilizzato: '', scelta: '', tipoControparte: 'fondo', controparteId: '' };
  const dati = statoChiusura[ciclo.id];
  const haInserito = dati.utilizzato !== '';
  const utilizzato = Number(dati.utilizzato) || 0;
  const residuo = Math.round((ciclo.importoAssegnato + ciclo.riportoIniziale - utilizzato) * 100) / 100;

  const opzioniControparte = (dati.tipoControparte === 'obiettivo' ? obiettivi : fondi).map((el) => {
    const etichetta = dati.tipoControparte === 'obiettivo'
      ? `${el.nome} (accumulato ${formattaValuta(el.saldoAccumulato)})`
      : `${el.nome} (saldo ${formattaValuta(el.saldo)})`;
    return `<option value="${el.id}" ${dati.controparteId === el.id ? 'selected' : ''}>${etichetta}</option>`;
  }).join('');

  const selettoreControparte = `
    <label class="riga-checkbox">
      <input type="radio" name="tipo-controparte-${ciclo.id}" value="fondo" ${dati.tipoControparte !== 'obiettivo' ? 'checked' : ''}> Fondo
    </label>
    <label class="riga-checkbox">
      <input type="radio" name="tipo-controparte-${ciclo.id}" value="obiettivo" ${dati.tipoControparte === 'obiettivo' ? 'checked' : ''}> Obiettivo
    </label>
    <select class="select-controparte-ciclo" data-ciclo-id="${ciclo.id}">
      <option value="">-- seleziona ${dati.tipoControparte === 'obiettivo' ? 'Obiettivo' : 'Fondo'} --</option>
      ${opzioniControparte}
    </select>
  `;

  const disponibilita = Math.round((ciclo.importoAssegnato + ciclo.riportoIniziale) * 100) / 100;

  return `
    <div class="form-scheda" style="max-width:480px;">
      <h4>Chiudi Ciclo — ${budgetNome}</h4>
      <label>Quanto hai realmente speso?
        <input type="number" step="any" class="input-utilizzato-ciclo" data-ciclo-id="${ciclo.id}" value="${dati.utilizzato}">
      </label>
      <button type="button" class="btn-valorizza-budget" data-ciclo-id="${ciclo.id}" data-valore="${disponibilita}">
        <i class="fa-solid fa-check"></i> Tutto speso (${formattaValuta(disponibilita)})
      </button>
      ${haInserito ? `
        <p class="nota">Residuo: <strong class="${residuo < 0 ? 'testo-errore' : ''}">${formattaValuta(residuo)}</strong></p>
        ${residuo > 0.005 ? `
          <p class="nota-inline">Come vuoi gestire il residuo?</p>
          <label class="riga-checkbox"><input type="radio" name="scelta-${ciclo.id}" value="mantieni" ${dati.scelta === 'mantieni' || !dati.scelta ? 'checked' : ''}> Mantieni nel Budget (si riporta al prossimo ciclo)</label>
          <label class="riga-checkbox"><input type="radio" name="scelta-${ciclo.id}" value="trasferisci_fondo" ${dati.scelta === 'trasferisci_fondo' ? 'checked' : ''}> Trasferisci a un Fondo o un Obiettivo</label>
          <label class="riga-checkbox"><input type="radio" name="scelta-${ciclo.id}" value="libera" ${dati.scelta === 'libera' ? 'checked' : ''}> Libera Liquidità (nessun riporto)</label>
          <div class="blocco-controparte-ciclo" style="${dati.scelta === 'trasferisci_fondo' ? '' : 'display:none;'}">${selettoreControparte}</div>
        ` : residuo < -0.005 ? `
          <p class="nota-inline">Come vuoi coprire lo sforamento?</p>
          <label class="riga-checkbox"><input type="radio" name="scelta-${ciclo.id}" value="riporta" ${dati.scelta === 'riporta' || !dati.scelta ? 'checked' : ''}> Riporta al prossimo ciclo</label>
          <label class="riga-checkbox"><input type="radio" name="scelta-${ciclo.id}" value="copri_fondo" ${dati.scelta === 'copri_fondo' ? 'checked' : ''}> Copri con un Fondo o un Obiettivo</label>
          <label class="riga-checkbox"><input type="radio" name="scelta-${ciclo.id}" value="usa_liquidita" ${dati.scelta === 'usa_liquidita' ? 'checked' : ''}> Usa liquidità libera del Conto</label>
          <div class="blocco-controparte-ciclo" style="${dati.scelta === 'copri_fondo' ? '' : 'display:none;'}">${selettoreControparte}</div>
        ` : '<p class="nota">Nessun residuo: il Budget è stato utilizzato esattamente.</p>'}
        ${!modalitaBulk ? `<div class="form-azioni"><button data-azione="conferma-chiusura" data-id="${ciclo.id}" class="btn-primario">Conferma chiusura</button></div>` : ''}
      ` : ''}
    </div>
  `;
}

function collegaEventiFormChiusura(container, cicliAperti, mappaBudget, fondi, obiettivi) {
  container.querySelectorAll('.input-utilizzato-ciclo').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.cicloId;
      if (!statoChiusura[id]) statoChiusura[id] = { utilizzato: '', scelta: '', tipoControparte: 'fondo', controparteId: '' };
      statoChiusura[id].utilizzato = input.value;
      renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
    });
  });

  container.querySelectorAll('.btn-valorizza-budget').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.cicloId;
      if (!statoChiusura[id]) statoChiusura[id] = { utilizzato: '', scelta: '', tipoControparte: 'fondo', controparteId: '' };
      statoChiusura[id].utilizzato = btn.dataset.valore;
      renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
    });
  });

  cicliAperti.forEach((c) => {
    container.querySelectorAll(`input[name="scelta-${c.id}"]`).forEach((radio) => {
      radio.addEventListener('change', () => {
        statoChiusura[c.id].scelta = radio.value;
        renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
      });
    });
    container.querySelectorAll(`input[name="tipo-controparte-${c.id}"]`).forEach((radio) => {
      radio.addEventListener('change', () => {
        statoChiusura[c.id].tipoControparte = radio.value;
        statoChiusura[c.id].controparteId = ''; // cambia tipo: la selezione precedente non è più valida
        renderZonaCicloCorrente(container, cicliAperti, mappaBudget, fondi, obiettivi);
      });
    });
  });

  container.querySelectorAll('.select-controparte-ciclo').forEach((select) => {
    select.addEventListener('change', () => {
      statoChiusura[select.dataset.cicloId].controparteId = select.value;
    });
  });

  const btnConferma = container.querySelector('button[data-azione="conferma-chiusura"]');
  if (btnConferma) {
    btnConferma.addEventListener('click', async () => {
      const id = btnConferma.dataset.id;
      const dati = statoChiusura[id];
      try {
        await chiudiCiclo(id, dati.utilizzato, dati.scelta || null, dati.tipoControparte, dati.controparteId || undefined);
        cicloInChiusuraId = null;
        statoChiusura = {};
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

const CHIAVI_ORDINAMENTO_STORICO = {
  periodoInizio: (c) => c.periodoInizio,
  budgetNome: (c) => c._budgetNome || '',
  residuo: (c) => c.residuo
};

function renderStorico(container, cicliChiusi, mappaBudget, idRiapribili) {
  const zona = container.querySelector('#tabella-storico');
  cicliChiusi.forEach((c) => { c._budgetNome = mappaBudget.get(c.budgetId)?.nome || ''; });

  let cicli = filtraTesto(cicliChiusi, statoStorico.ricerca, (c) => c._budgetNome);
  cicli = ordina(cicli, CHIAVI_ORDINAMENTO_STORICO[statoStorico.ordineChiave] || CHIAVI_ORDINAMENTO_STORICO.periodoInizio, statoStorico.ordineDecrescente);

  zona.innerHTML = cicli.length === 0 ? '<p class="nota">Nessun Ciclo chiuso ancora.</p>' : `
    <table class="tabella">
      <thead><tr>
        ${intestazioneOrdinabile('Budget', 'budgetNome', statoStorico)}
        ${intestazioneOrdinabile('Periodo', 'periodoInizio', statoStorico)}
        <th>Assegnato</th><th>Utilizzato</th>
        ${intestazioneOrdinabile('Residuo', 'residuo', statoStorico)}
        <th>Azione</th>
        <th>Controparte</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${cicli.map((c) => `
          <tr>
            <td>${c._budgetNome}</td>
            <td>${formattaData(c.periodoInizio)} — ${formattaData(c.periodoFine)}</td>
            <td class="numero">${formattaValuta(c.importoAssegnato + c.riportoIniziale)}</td>
            <td class="numero">${formattaValuta(c.importoUtilizzato)}</td>
            <td class="numero ${c.residuo < 0 ? 'testo-errore' : ''}">${formattaValuta(c.residuo)}</td>
            <td class="nota-inline">${c.residuoAzione || '—'}</td>
            <td class="nota-inline">${c.controparteNome ? `${c.controparteTipo === 'obiettivo' ? 'Obiettivo' : 'Fondo'}: ${c.controparteNome}` : '—'}</td>
            <td>${idRiapribili.has(c.id) ? `<button class="btn-icona" title="Riapri Ciclo" data-azione="riapri" data-id="${c.id}"><i class="fa-solid fa-lock-open"></i></button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  collegaOrdinamento(zona, statoStorico, () => renderStorico(container, cicliChiusi, mappaBudget, idRiapribili));

  zona.querySelectorAll('button[data-azione="riapri"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(
        'Riaprire questo Ciclo? Se in chiusura era stato generato un Trasferimento (residuo trasferito a un ' +
        'Fondo/Obiettivo, o sforamento coperto da un Fondo/Obiettivo), verrà stornato.'
      )) return;
      try {
        await riapriCiclo(btn.dataset.id);
        renderCicloBudget(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}
