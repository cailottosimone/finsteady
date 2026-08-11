import {
  elencoFondi, creaFondo, aggiornaFondo, eliminaFondo,
  creaFondoAnnualeSuccessivo, archiviaFondo, riattivaFondo
} from '../domain/fondi.js';
import { elencoConti } from '../domain/conti.js';
import { elencoCategorie } from '../domain/categorie.js';
import {
  elencoObiettiviPerFondo, elencoObiettivi, creaObiettivo, aggiornaObiettivo, eliminaObiettivo,
  aggiornaScadenzaTuttiGliObiettivi
} from '../domain/obiettivi.js';
import { calcolaDatiObiettivo, calcolaDatiFondo } from '../engine/obiettivoCalc.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { formattaData } from '../utils/dateUtils.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';

let fondoInModifica = null;
let fondoEspansoId = null;
let obiettivoInModifica = null;
let mostraArchiviati = false;
let fondoInChiusuraId = null;
let fondoInDuplicaId = null;
let fondoInScadenzaId = null; // Fondo con il form "Aggiorna scadenza di tutti gli Obiettivi" aperto
const stato = { ordineChiave: 'nome', ordineDecrescente: false, ricerca: '' };

const CHIAVI_ORDINAMENTO = {
  nome: (f) => f.nome,
  contoNome: (f) => f._contoNome || '',
  saldo: (f) => f.saldo
};

export async function renderFondi(container) {
  const [fondi, conti, categorie, tuttiGliObiettivi] = await Promise.all([
    elencoFondi(), elencoConti(), elencoCategorie('obiettivo'), elencoObiettivi()
  ]);
  fondi.forEach((f) => { f._contoNome = conti.find((c) => c.id === f.contoId)?.nome || ''; });

  const fondiAttivi = fondi.filter((f) => f.stato !== 'archiviato');
  const fondiArchiviati = fondi.filter((f) => f.stato === 'archiviato');

  container.innerHTML = `
    <section class="pannello" style="border-top: 3px solid var(--colore-patrimonio);">
      <h2>Fondi</h2>
      <p class="nota">
        Il Fondo rappresenta patrimonio: cresce nel tempo e appartiene ad un Conto. Ogni Fondo
        rappresenta un esercizio finanziario autonomo (es. "Spese 2026", "Spese 2027"): a fine
        anno puoi creare il Fondo successivo copiando gli Obiettivi, e poi archiviare quello concluso.
      </p>
      <div class="barra-ricerca">
        <input type="text" id="ricerca-fondi" placeholder="Cerca per nome o Conto..." value="${stato.ricerca}">
      </div>
      <div id="lista-fondi"></div>
      <button id="btn-nuovo-fondo" class="btn-primario"><i class="fa-solid fa-plus"></i> Nuovo Fondo</button>
      ${fondiArchiviati.length > 0
        ? `<button id="btn-toggle-archiviati" style="margin-left:8px;">${mostraArchiviati ? 'Nascondi' : 'Mostra'} archiviati (${fondiArchiviati.length})</button>`
        : ''}
      <div id="form-fondo-container"></div>
    </section>
  `;

  const fondiDaMostrare = mostraArchiviati ? fondi : fondiAttivi;

  container.querySelector('#ricerca-fondi').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, fondiDaMostrare, conti, categorie, tuttiGliObiettivi);
  });

  await renderTabella(container, fondiDaMostrare, conti, categorie, tuttiGliObiettivi);

  if (fondoInChiusuraId) {
    mostraFormChiusuraAnno(container, fondiDaMostrare, conti);
  }
  if (fondoInDuplicaId) {
    mostraFormDuplicaFondo(container, fondiDaMostrare, conti);
  }

  container.querySelector('#btn-nuovo-fondo').addEventListener('click', () => {
    fondoInModifica = null;
    mostraFormFondo(container, conti);
  });

  const btnToggle = container.querySelector('#btn-toggle-archiviati');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      mostraArchiviati = !mostraArchiviati;
      renderFondi(container);
    });
  }
}

async function renderTabella(container, fondiCompleti, conti, categorie, tuttiGliObiettivi) {
  const lista = container.querySelector('#lista-fondi');

  let fondi = filtraTesto(fondiCompleti, stato.ricerca, (f) => `${f.nome} ${f._contoNome}`);
  fondi = ordina(fondi, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.nome, stato.ordineDecrescente);

  if (fondi.length === 0) {
    lista.innerHTML = '<p class="nota">Nessun Fondo trovato.</p>';
    return;
  }

  const righeHtml = [];
  for (const f of fondi) {
    const obiettiviDelFondo = tuttiGliObiettivi.filter((o) => o.fondoId === f.id);
    righeHtml.push(await renderRigaFondo(f, obiettiviDelFondo));
  }

  lista.innerHTML = `
    <table class="tabella">
      <thead><tr>
        ${intestazioneOrdinabile('Nome', 'nome', stato)}
        ${intestazioneOrdinabile('Conto', 'contoNome', stato)}
        ${intestazioneOrdinabile('Saldo', 'saldo', stato)}
        <th>Avanzamento Obiettivi</th>
        <th>Stato</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${righeHtml.join('')}
      </tbody>
    </table>
  `;

  collegaOrdinamento(lista, stato, () => renderTabella(container, fondiCompleti, conti, categorie, tuttiGliObiettivi));
  collegaEventiLista(container, lista, fondi, conti, categorie);
}

async function renderRigaFondo(f, obiettiviDelFondo) {
  const espanso = fondoEspansoId === f.id;
  const archiviato = f.stato === 'archiviato';
  const obiettivi = espanso ? await elencoObiettiviPerFondo(f.id) : [];
  const datiFondo = calcolaDatiFondo(f, obiettiviDelFondo);

  return `
    <tr style="${archiviato ? 'opacity:0.6;' : ''}">
      <td>${f.nome}</td>
      <td>${f._contoNome || '—'}</td>
      <td class="numero">${formattaValuta(f.saldo)}</td>
      <td>
        ${datiFondo.percentuale == null ? '<span class="nota-inline">—</span>' : `
          <div class="barra-avanzamento" style="width:100px;">
            <div class="barra-avanzamento-riempimento" style="width:${datiFondo.percentuale}%"></div>
          </div>
          <span class="nota-inline">${formattaValuta(datiFondo.saldoAccumulatoTotale)} / ${formattaValuta(datiFondo.obiettivoComplessivo)} (${datiFondo.percentuale}%)</span>
        `}
      </td>
      <td>${archiviato ? '<span class="badge" style="background:#eee;">Archiviato</span>' : 'Attivo'}</td>
      <td>
        <div class="azioni-riga">
          <button class="btn-icona" title="${espanso ? 'Chiudi' : 'Obiettivi'}" data-azione="espandi" data-id="${f.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button>
          <button class="btn-icona" title="Modifica" data-azione="modifica" data-id="${f.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icona" title="Duplica (nuovo Fondo con gli stessi Obiettivi, saldo a zero, nessun collegamento)" data-azione="duplica" data-id="${f.id}"><i class="fa-solid fa-clone"></i></button>
          ${archiviato
            ? `<button class="btn-icona" title="Riattiva" data-azione="riattiva" data-id="${f.id}"><i class="fa-solid fa-undo"></i></button>`
            : `<button class="btn-icona" title="Chiudi anno" data-azione="chiudi-anno" data-id="${f.id}"><i class="fa-solid fa-lock"></i></button>
               <button class="btn-icona" title="Archivia" data-azione="archivia" data-id="${f.id}"><i class="fa-solid fa-archive"></i></button>`}
          <button class="btn-icona" title="Elimina" data-azione="elimina" data-id="${f.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
    ${espanso ? `
      <tr>
        <td colspan="6" style="background:var(--colore-sfondo-soft);">
          ${renderObiettivi(f, obiettivi)}
        </td>
      </tr>
    ` : ''}
  `;
}

function collegaEventiLista(container, lista, fondi, conti, categorie) {
  lista.querySelectorAll('button[data-azione="espandi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fondoEspansoId = fondoEspansoId === btn.dataset.id ? null : btn.dataset.id;
      renderFondi(container);
    });
  });

  lista.querySelectorAll('button[data-azione="modifica"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fondoInModifica = fondi.find((f) => f.id === btn.dataset.id);
      mostraFormFondo(container, conti);
    });
  });

  lista.querySelectorAll('button[data-azione="archivia"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Archiviare il Fondo?',
        messaggio: 'Archiviare questo Fondo? Resterà consultabile ma non selezionabile per nuove allocazioni.',
        testoConferma: 'Archivia Fondo'
      });
      if (!ok) return;
      await archiviaFondo(btn.dataset.id);
      renderFondi(container);
    });
  });

  lista.querySelectorAll('button[data-azione="riattiva"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await riattivaFondo(btn.dataset.id);
      renderFondi(container);
    });
  });

  lista.querySelectorAll('button[data-azione="chiudi-anno"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fondoInChiusuraId = btn.dataset.id;
      renderFondi(container);
    });
  });

  lista.querySelectorAll('button[data-azione="duplica"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fondoInDuplicaId = btn.dataset.id;
      renderFondi(container);
    });
  });

  lista.querySelectorAll('button[data-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Eliminare il Fondo?',
        messaggio: 'Eliminare definitivamente questo Fondo? Verranno eliminati anche eventuali movimenti (Entrate, Uscite, Trasferimenti, Rettifiche) che lo referenziano.',
        testoConferma: 'Elimina Fondo',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await eliminaFondo(btn.dataset.id);
        renderFondi(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelectorAll('button[data-azione="modifica-obiettivo"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const obiettivi = await elencoObiettiviPerFondo(btn.dataset.fondoId);
      obiettivoInModifica = obiettivi.find((o) => o.id === btn.dataset.id);
      mostraFormObiettivo(container, btn.dataset.fondoId, categorie);
    });
  });

  container.querySelectorAll('button[data-azione="elimina-obiettivo"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Eliminare l\'Obiettivo?',
        messaggio: 'Eliminare questo Obiettivo? Verranno eliminati anche eventuali movimenti (Entrate, Uscite, Trasferimenti, Rettifiche) che lo referenziano.',
        testoConferma: 'Elimina Obiettivo',
        pericoloso: true
      });
      if (!ok) return;
      await eliminaObiettivo(btn.dataset.id);
      renderFondi(container);
    });
  });

  container.querySelectorAll('button[data-azione="nuovo-obiettivo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      obiettivoInModifica = null;
      mostraFormObiettivo(container, btn.dataset.fondoId, categorie);
    });
  });

  container.querySelectorAll('button[data-azione="apri-scadenza-blocco"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fondoInScadenzaId = fondoInScadenzaId === btn.dataset.fondoId ? null : btn.dataset.fondoId;
      renderFondi(container);
    });
  });

  container.querySelectorAll('button[data-azione="annulla-scadenza-blocco"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fondoInScadenzaId = null;
      renderFondi(container);
    });
  });

  container.querySelectorAll('form[id^="form-scadenza-blocco-"]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fondoId = form.id.replace('form-scadenza-blocco-', '');
      const dati = Object.fromEntries(new FormData(e.target).entries());
      const ok = await mostraConferma({
        titolo: 'Aggiornare la scadenza di tutti gli Obiettivi?',
        messaggio: 'Applicare la nuova data di scadenza a TUTTI gli Obiettivi di questo Fondo? Solo la scadenza cambia: importi e saldi restano invariati.',
        testoConferma: 'Aggiorna tutte le scadenze'
      });
      if (!ok) return;
      try {
        await aggiornaScadenzaTuttiGliObiettivi(fondoId, new Date(dati.nuovaScadenza).toISOString());
        fondoInScadenzaId = null;
        renderFondi(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderObiettivi(fondo, obiettivi) {
  return `
    <div class="blocco-obiettivi" style="border-top:none; margin-top:0; padding-top:0;">
      ${obiettivi.length === 0 ? '<p class="nota">Nessun Obiettivo in questo Fondo.</p>' : `
        <table class="tabella">
          <thead><tr>
            <th>Obiettivo</th><th>Scadenza</th><th>Accumulato / Target</th><th>Mancante</th><th>Consigliato/mese</th><th>Mesi rimanenti</th><th></th>
          </tr></thead>
          <tbody>
            ${obiettivi.map((o) => {
              const calc = calcolaDatiObiettivo(o);
              return `
                <tr>
                  <td>${o.nome}</td>
                  <td>${formattaData(o.dataPrevista)}</td>
                  <td>
                    <div class="barra-avanzamento" style="margin-bottom:4px;">
                      <div class="barra-avanzamento-riempimento" style="width:${calc.percentuale}%"></div>
                    </div>
                    <span class="nota-inline">${formattaValuta(o.saldoAccumulato)} / ${formattaValuta(o.importoTarget)} (${calc.percentuale}%)</span>
                  </td>
                  <td class="numero">${formattaValuta(calc.importoMancante)}</td>
                  <td class="numero">${formattaValuta(calc.importoMensileConsigliato)}</td>
                  <td>${calc.mesiRimanenti}</td>
                  <td style="white-space:nowrap;">
                    <div class="azioni-riga" style="flex-wrap: nowrap;">
                      <button class="btn-icona" title="Modifica" data-azione="modifica-obiettivo" data-id="${o.id}" data-fondo-id="${fondo.id}"><i class="fa-solid fa-pen"></i></button>
                      <button class="btn-icona" title="Elimina" data-azione="elimina-obiettivo" data-id="${o.id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
      <div class="azioni-riga" style="margin-top:8px;">
        <button data-azione="nuovo-obiettivo" data-fondo-id="${fondo.id}"><i class="fa-solid fa-plus"></i> Nuovo Obiettivo</button>
        ${obiettivi.length > 0 ? `<button data-azione="apri-scadenza-blocco" data-fondo-id="${fondo.id}"><i class="fa-solid fa-calendar-check"></i> Aggiorna scadenza di tutti gli Obiettivi</button>` : ''}
      </div>
      <div id="form-obiettivo-container-${fondo.id}"></div>
      ${fondoInScadenzaId === fondo.id ? `
        <form id="form-scadenza-blocco-${fondo.id}" class="form-scheda" style="margin-top:8px;">
          <label>Nuova data di scadenza per tutti gli Obiettivi di questo Fondo (${obiettivi.length}) *
            <input type="date" name="nuovaScadenza" required>
          </label>
          <div class="form-azioni">
            <button type="submit" class="btn-primario">Applica a tutti</button>
            <button type="button" data-azione="annulla-scadenza-blocco" data-fondo-id="${fondo.id}">Annulla</button>
          </div>
        </form>
      ` : ''}
    </div>
  `;
}

function mostraFormFondo(container, conti) {
  const formContainer = container.querySelector('#form-fondo-container');
  const f = fondoInModifica || {};

  mostraFormFondoAsync(container, conti, formContainer, f);
}

async function mostraFormFondoAsync(container, conti, formContainer, f) {
  const obiettiviDelFondo = f.id ? await elencoObiettiviPerFondo(f.id) : [];
  const datiFondo = calcolaDatiFondo(f, obiettiviDelFondo);
  const haObiettivi = obiettiviDelFondo.length > 0;

  formContainer.innerHTML = `
    <form id="form-fondo" class="form-scheda">
      <h3>${fondoInModifica ? 'Modifica Fondo' : 'Nuovo Fondo'}</h3>
      <label>Nome *<input name="nome" required value="${f.nome || ''}"></label>
      <label>Descrizione<input name="descrizione" value="${f.descrizione || ''}"></label>
      <label>Conto di appartenenza *
        <select name="contoId" required>
          <option value="">-- seleziona --</option>
          ${conti.map((c) => `<option value="${c.id}" ${f.contoId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <label>Saldo *
        <input name="saldo" type="number" step="any" required value="${f.saldo ?? 0}" ${fondoInModifica ? 'disabled' : ''}>
      </label>
      ${fondoInModifica ? '<p class="nota">Il saldo non è più modificabile qui: per correggerlo usa una Rettifica dal Registro Movimenti.</p>' : ''}
      <label>Obiettivo complessivo ${haObiettivi ? '(automatico)' : '(facoltativo)'}
        <input name="obiettivoComplessivoImporto" type="number" step="any"
          value="${haObiettivi ? datiFondo.obiettivoComplessivo : (f.obiettivoComplessivoImporto ?? '')}"
          ${haObiettivi ? 'disabled' : ''}>
      </label>
      ${haObiettivi
        ? '<p class="nota">Calcolato automaticamente come somma degli Importi Target degli Obiettivi di questo Fondo: non è più modificabile qui.</p>'
        : ''}
      <label class="riga-checkbox">
        <input type="checkbox" name="inclusoProspettiDefault" ${f.inclusoProspettiDefault !== false ? 'checked' : ''}>
        Incluso di default nei Prospetti
      </label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva</button>
        <button type="button" id="btn-annulla-fondo">Annulla</button>
      </div>
    </form>
  `;

  container.querySelector('#btn-annulla-fondo').addEventListener('click', () => {
    fondoInModifica = null;
    formContainer.innerHTML = '';
  });

  container.querySelector('#form-fondo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    dati.inclusoProspettiDefault = e.target.inclusoProspettiDefault.checked;
    // Se il campo è automatico (disabilitato), non viene incluso in FormData: non sovrascrive
    // mai il valore calcolato. Se è manuale (nessun Obiettivo), va normalizzato come sempre.
    if (!haObiettivi) dati.obiettivoComplessivoImporto = dati.obiettivoComplessivoImporto || null;
    try {
      if (fondoInModifica) {
        await aggiornaFondo(fondoInModifica.id, dati);
      } else {
        await creaFondo(dati);
      }
      fondoInModifica = null;
      renderFondi(container);
    } catch (err) {
      alert(err.message);
    }
  });
}

function mostraFormObiettivo(container, fondoId, categorie) {
  const formContainer = container.querySelector(`#form-obiettivo-container-${fondoId}`);
  if (!formContainer) return;
  const o = obiettivoInModifica || {};

  formContainer.innerHTML = `
    <form class="form-scheda">
      <h4>${obiettivoInModifica ? 'Modifica Obiettivo' : 'Nuovo Obiettivo'}</h4>
      <label>Nome *<input name="nome" required value="${o.nome || ''}"></label>
      <label>Categoria (opzionale)
        <select name="categoriaId">
          <option value="">-- nessuna --</option>
          ${categorie.map((c) => `<option value="${c.id}" ${o.categoriaId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <label>Importo Target *<input name="importoTarget" type="number" step="any" required value="${o.importoTarget ?? 0}"></label>
      <label>Data prevista *<input name="dataPrevista" type="date" required value="${o.dataPrevista ? o.dataPrevista.substring(0, 10) : ''}"></label>
      <label>Saldo accumulato *
        <input name="saldoAccumulato" type="number" step="any" required value="${o.saldoAccumulato ?? 0}" ${obiettivoInModifica ? 'disabled' : ''}>
      </label>
      ${obiettivoInModifica ? '<p class="nota">Il saldo non è più modificabile qui: per correggerlo usa una Rettifica dal Registro Movimenti.</p>' : ''}
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Salva</button>
        <button type="button" class="btn-annulla-obiettivo">Annulla</button>
      </div>
    </form>
  `;

  formContainer.querySelector('.btn-annulla-obiettivo').addEventListener('click', () => {
    obiettivoInModifica = null;
    formContainer.innerHTML = '';
  });

  formContainer.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    dati.fondoId = fondoId;
    dati.categoriaId = dati.categoriaId || null;
    dati.dataPrevista = new Date(dati.dataPrevista).toISOString();
    try {
      if (obiettivoInModifica) {
        await aggiornaObiettivo(obiettivoInModifica.id, dati);
      } else {
        await creaObiettivo(dati);
      }
      obiettivoInModifica = null;
      renderFondi(container);
    } catch (err) {
      alert(err.message);
    }
  });
}

function mostraFormChiusuraAnno(container, fondi, conti) {
  const fondoOrigine = fondi.find((f) => f.id === fondoInChiusuraId);
  if (!fondoOrigine) { fondoInChiusuraId = null; return; }
  const formContainer = container.querySelector('#form-fondo-container');

  formContainer.innerHTML = `
    <form id="form-chiusura-anno" class="form-scheda">
      <h3>Chiudi anno: crea il Fondo successivo a partire da "${fondoOrigine.nome}"</h3>
      <p class="nota">
        Verrà creato un nuovo Fondo con gli stessi Obiettivi (nome, target, scadenza, categoria),
        ma con saldo e saldo accumulato a zero. Il Fondo "${fondoOrigine.nome}" NON viene
        modificato né archiviato automaticamente: potrai trasferire manualmente l'eventuale
        residuo e archiviarlo quando vorrai, dai pulsanti dedicati.
      </p>
      <label>Nome del nuovo Fondo *<input name="nome" required value="${suggerisciNomeSuccessivo(fondoOrigine.nome)}"></label>
      <label>Conto di appartenenza *
        <select name="contoId" required>
          ${conti.map((c) => `<option value="${c.id}" ${fondoOrigine.contoId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Crea e copia Obiettivi</button>
        <button type="button" id="btn-annulla-chiusura">Annulla</button>
      </div>
    </form>
  `;

  container.querySelector('#btn-annulla-chiusura').addEventListener('click', () => {
    fondoInChiusuraId = null;
    formContainer.innerHTML = '';
  });

  container.querySelector('#form-chiusura-anno').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    try {
      const { nuovoFondo, obiettiviCopiati } = await creaFondoAnnualeSuccessivo(fondoOrigine.id, dati);
      fondoInChiusuraId = null;
      alert(`Creato "${nuovoFondo.nome}" con ${obiettiviCopiati.length} Obiettivi copiati (saldo a zero).`);
      renderFondi(container);
    } catch (err) {
      alert(err.message);
    }
  });
}

// Duplica un Fondo: stessa logica di "Chiudi anno" (creaFondoAnnualeSuccessivo), qui però senza
// alcuna assunzione di anno/esercizio — utile per ripartire da un Fondo esistente in qualunque
// momento (es. "Spese 2027" → duplica → "Spese 2028", poi modifica gli Obiettivi copiati se
// serve). Nuovo Fondo scollegato al 100%: nessuna correlazione con l'originale, saldo e saldi
// accumulati degli Obiettivi copiati a zero.
function mostraFormDuplicaFondo(container, fondi, conti) {
  const fondoOrigine = fondi.find((f) => f.id === fondoInDuplicaId);
  if (!fondoOrigine) { fondoInDuplicaId = null; return; }
  const formContainer = container.querySelector('#form-fondo-container');

  formContainer.innerHTML = `
    <form id="form-duplica-fondo" class="form-scheda">
      <h3>Duplica Fondo: nuova copia di "${fondoOrigine.nome}"</h3>
      <p class="nota">
        Verrà creato un nuovo Fondo con gli stessi Obiettivi (nome, target, scadenza, categoria),
        ma con saldo e saldo accumulato a zero. 100% nuove entità: nessun collegamento con
        "${fondoOrigine.nome}", che resta invariato. Potrai poi modificare liberamente gli
        Obiettivi copiati (anche in blocco, con "Aggiorna scadenza di tutti gli Obiettivi").
      </p>
      <label>Nome del nuovo Fondo *<input name="nome" required value="Copia di ${fondoOrigine.nome}"></label>
      <label>Conto di appartenenza *
        <select name="contoId" required>
          ${conti.map((c) => `<option value="${c.id}" ${fondoOrigine.contoId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
      </label>
      <div class="form-azioni">
        <button type="submit" class="btn-primario">Duplica e copia Obiettivi</button>
        <button type="button" id="btn-annulla-duplica">Annulla</button>
      </div>
    </form>
  `;

  container.querySelector('#btn-annulla-duplica').addEventListener('click', () => {
    fondoInDuplicaId = null;
    formContainer.innerHTML = '';
  });

  container.querySelector('#form-duplica-fondo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = Object.fromEntries(new FormData(e.target).entries());
    try {
      const { nuovoFondo, obiettiviCopiati } = await creaFondoAnnualeSuccessivo(fondoOrigine.id, dati);
      fondoInDuplicaId = null;
      alert(`Creato "${nuovoFondo.nome}" con ${obiettiviCopiati.length} Obiettivi copiati (saldo a zero).`);
      renderFondi(container);
    } catch (err) {
      alert(err.message);
    }
  });
}

function suggerisciNomeSuccessivo(nome) {
  const match = nome.match(/(\d{4})/);
  if (!match) return '';
  const annoSuccessivo = Number(match[1]) + 1;
  return nome.replace(match[1], String(annoSuccessivo));
}
