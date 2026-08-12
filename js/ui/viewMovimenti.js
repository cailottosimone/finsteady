// Registro Movimenti — tabella unica, ordinabile e filtrabile.
//
// Ogni Entrata (Allocazione) è ora un'unica riga di gruppo, espandibile: mostra il totale
// dell'entrata e, aprendola, le singole righe di destinazione (Fondo/Obiettivo/Budget/
// Disponibilità residua), ciascuna stornabile individualmente come prima. È stato aggiunto
// un pulsante "Storna tutto" sulla riga di gruppo, per non dover ripetere lo Storno voce per
// voce quando un'entrata è stata distribuita su molte destinazioni (richiesta esplicita
// dell'utente: "se ne voglio stornare una ok, ma se le voglio stornare tutte tasto dedicato").
// Uscite, Trasferimenti e Rettifiche restano righe singole come in precedenza.
//
// Include selezione multipla ed eliminazione diretta (senza storno): decisione esplicita
// dell'utente per poter ripulire movimenti ormai rotti (es. orfani di Fondi/Conti eliminati)
// generati prima delle correzioni ai bug di integrità. Va usata con cautela: a differenza
// dello Storno, non annulla alcun effetto sul saldo e non lascia traccia storica. Questa
// selezione/eliminazione diretta opera solo sulle righe figlie di un'Entrata (non esiste
// un'eliminazione diretta dell'intera Allocazione), e su Uscite/Trasferimenti/Rettifiche.

import {
  elencoAllocazioni, elencoRighePerAllocazione, stornaRigaAllocazione, eliminaRigaAllocazione,
  stornaAllocazioneCompleta
} from '../domain/allocazioni.js';
import { elencoUscite, stornaUscita, eliminaUscita } from '../domain/uscite.js';
import { elencoTrasferimenti, stornaTrasferimento, eliminaTrasferimento } from '../domain/trasferimenti.js';
import { elencoRettifiche, stornaRettifica, eliminaRettifica } from '../domain/rettifiche.js';
import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoBudget } from '../domain/budget.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { elencoTuttiGliAllegati, eliminaAllegato } from '../domain/allegati.js';
import { formattaValuta } from '../utils/formatCurrency.js';
import { formattaDataOra } from '../utils/dateUtils.js';
import { ordina, filtraTesto, intestazioneOrdinabile, collegaOrdinamento } from '../utils/listaUtils.js';
import { mostraConferma } from '../utils/dialogUtils.js';

// Stato di ordinamento/ricerca/selezione/espansione, persiste per la sessione.
const stato = { ordineChiave: 'data', ordineDecrescente: true, ricerca: '', selezionati: new Set(), espansi: new Set(), periodo: 'ultimi30' };

const ETICHETTE_PERIODO = {
  ultimi30: 'Ultimi 30 giorni',
  ultimi90: 'Ultimi 90 giorni',
  questoMese: 'Questo mese',
  tutto: 'Tutto lo storico'
};

// Filtro temporale di default: all'apertura della vista mostra solo un periodo ristretto
// (decisione esplicita, per non caricare a schermo anni di storico ogni volta) — l'utente può
// sempre passare a "Tutto lo storico" con un click. Il filtro testuale esistente resta
// invariato e opera SUL SET GIA' RIDOTTO per data (prima data, poi testo).
function nelPeriodo(dataIso, periodo) {
  if (periodo === 'tutto' || !dataIso) return true;
  const data = new Date(dataIso);
  const ora = new Date();
  if (periodo === 'questoMese') {
    return data.getFullYear() === ora.getFullYear() && data.getMonth() === ora.getMonth();
  }
  const giorni = periodo === 'ultimi90' ? 90 : 30;
  const soglia = new Date(ora);
  soglia.setDate(soglia.getDate() - giorni);
  return data >= soglia;
}

const ELIMINA_PER_TIPO = {
  riga: eliminaRigaAllocazione,
  uscita: eliminaUscita,
  trasferimento: eliminaTrasferimento,
  rettifica: eliminaRettifica
};
const STORNA_PER_TIPO = {
  riga: stornaRigaAllocazione,
  uscita: stornaUscita,
  trasferimento: stornaTrasferimento,
  rettifica: stornaRettifica
};

export async function renderMovimenti(container) {
  const [allocazioni, uscite, trasferimenti, rettifiche, conti, fondi, budget, obiettivi, allegati] = await Promise.all([
    elencoAllocazioni(), elencoUscite(), elencoTrasferimenti(), elencoRettifiche(),
    elencoConti(), elencoFondi(), elencoBudget(), elencoObiettivi(), elencoTuttiGliAllegati()
  ]);
  const contesto = { conti, fondi, budget, obiettivi };
  const mappaAllegati = new Map();
  allegati.forEach((al) => {
    if (!mappaAllegati.has(al.movimentoId)) mappaAllegati.set(al.movimentoId, []);
    mappaAllegati.get(al.movimentoId).push(al);
  });

  // Righe di gruppo (una per Entrata) con le rispettive righe figlie annidate.
  const gruppiEntrata = [];
  // Elenco piatto di TUTTI i movimenti singoli (righe di Entrata comprese): serve per CSV,
  // "Pulisci tutto il Registro" e la logica di selezione/eliminazione, che restano invariate.
  const righePiatte = [];

  for (const a of allocazioni) {
    const righeAllocazione = await elencoRighePerAllocazione(a.id);
    const righeFiglie = righeAllocazione.map((r) => costruisciRigaEntrataFiglia(a, r, contesto));
    righeFiglie.forEach((r) => righePiatte.push(r));
    gruppiEntrata.push(costruisciRigaEntrataGruppo(a, righeFiglie, conti, mappaAllegati.get(a.id)));
  }
  uscite.forEach((u) => righePiatte.push(costruisciRigaUscita(u, contesto, mappaAllegati.get(u.id))));
  trasferimenti.forEach((t) => righePiatte.push(costruisciRigaTrasferimento(t, contesto)));
  rettifiche.forEach((r) => righePiatte.push(costruisciRigaRettifica(r, contesto)));

  // Righe mostrate a schermo: i gruppi Entrata (espandibili) + tutti i movimenti non-Entrata.
  const righeVisualizzate = [...gruppiEntrata, ...righePiatte.filter((r) => r.tipo !== 'Entrata')];

  const totaleMovimenti = righePiatte.length;

  container.innerHTML = `
    <section class="pannello">
      <h2>Registro Movimenti</h2>
      <p class="nota">
        Ogni movimento è un evento storico immutabile: non si modifica né si elimina normalmente.
        Per correggere un errore, usa "Storna" — genera un movimento inverso e preserva lo storico.
        Un'Entrata distribuita su più destinazioni può essere stornata voce per voce (espandila)
        oppure tutta insieme col pulsante "Storna tutto" sulla riga dell'Entrata.
        L'eliminazione diretta (icona cestino) va usata solo per pulire movimenti ormai rotti: non
        annulla alcun effetto sul saldo e non lascia traccia.
      </p>
      <div class="barra-ricerca" style="align-items:center; gap:12px; flex-wrap:wrap;">
        <input type="text" id="ricerca-movimenti" placeholder="Cerca per descrizione..." value="${stato.ricerca}">
        <label class="nota-inline" style="display:flex; align-items:center; gap:6px;">Periodo
          <select id="select-periodo-movimenti">
            ${Object.entries(ETICHETTE_PERIODO).map(([valore, etichetta]) => `
              <option value="${valore}" ${stato.periodo === valore ? 'selected' : ''}>${etichetta}</option>
            `).join('')}
          </select>
        </label>
        ${stato.periodo !== 'tutto' ? '<button id="btn-vedi-tutto-storico" class="link-testuale">Vedi tutto lo storico</button>' : ''}
      </div>
      <div class="azioni-riga" style="margin-bottom:8px;">
        <button id="btn-elimina-selezionati" ${stato.selezionati.size === 0 ? 'disabled' : ''}>Elimina selezionati (${stato.selezionati.size})</button>
        ${totaleMovimenti > 0 ? `<button id="btn-pulisci-tutto">Pulisci tutto il Registro</button>` : ''}
        ${totaleMovimenti > 0 ? `<button id="btn-esporta-movimenti">Esporta CSV (tutto lo storico, non risente del filtro periodo qui sopra)</button>` : ''}
      </div>
      <div id="tabella-movimenti"></div>
    </section>
  `;

  container.querySelector('#ricerca-movimenti').addEventListener('input', (e) => {
    stato.ricerca = e.target.value;
    renderTabella(container, righeVisualizzate, righePiatte);
  });

  container.querySelector('#select-periodo-movimenti').addEventListener('change', (e) => {
    stato.periodo = e.target.value;
    renderMovimenti(container);
  });

  const btnVediTutto = container.querySelector('#btn-vedi-tutto-storico');
  if (btnVediTutto) {
    btnVediTutto.addEventListener('click', () => {
      stato.periodo = 'tutto';
      renderMovimenti(container);
    });
  }

  const btnEsporta = container.querySelector('#btn-esporta-movimenti');
  if (btnEsporta) {
    btnEsporta.addEventListener('click', () => {
      esportaRegistroCsv(righePiatte);
    });
  }

  container.querySelector('#btn-elimina-selezionati').addEventListener('click', async () => {
    if (stato.selezionati.size === 0) return;
    const ok = await mostraConferma({
      titolo: 'Eliminare i movimenti selezionati?',
      messaggio: `Eliminare definitivamente ${stato.selezionati.size} movimento/i selezionato/i? Non è uno Storno: non annulla alcun effetto sul saldo e non si può annullare.`,
      testoConferma: `Elimina ${stato.selezionati.size} movimento/i`,
      pericoloso: true
    });
    if (!ok) return;
    for (const chiave of stato.selezionati) {
      const [tipo, id] = chiave.split('::');
      await ELIMINA_PER_TIPO[tipo](id);
    }
    stato.selezionati.clear();
    renderMovimenti(container);
  });

  const btnPulisci = container.querySelector('#btn-pulisci-tutto');
  if (btnPulisci) {
    btnPulisci.addEventListener('click', async () => {
      const primaConferma = await mostraConferma({
        titolo: 'Pulire tutto il Registro?',
        messaggio: `Eliminare DEFINITIVAMENTE tutti i ${totaleMovimenti} movimenti del Registro? I saldi attuali di Conti/Fondi/Obiettivi restano invariati: si cancella solo lo storico. Azione irreversibile.`,
        testoConferma: `Elimina tutti i ${totaleMovimenti} movimenti`,
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
      for (const r of righePiatte) {
        const [tipo, id] = r.id.split('::');
        await ELIMINA_PER_TIPO[tipo](id);
      }
      stato.selezionati.clear();
      renderMovimenti(container);
    });
  }

  renderTabella(container, righeVisualizzate, righePiatte);
}

function unisciParti(parti, separatore = ': ') {
  return parti.filter((p) => p != null && p !== '').join(separatore);
}

// Riga FIGLIA di un'Entrata: stessa forma di prima (una per riga di Allocazione), usata sia
// nella vista annidata sia nell'elenco piatto per CSV/eliminazione/selezione.
function costruisciRigaEntrataFiglia(allocazione, riga, { conti, fondi, obiettivi, budget }) {
  const conto = conti.find((c) => c.id === riga.contoMovimentoId);
  const destLabel = riga.tipoDestinazione === 'fondo' ? fondi.find((f) => f.id === riga.destinazioneId)?.nome
    : riga.tipoDestinazione === 'obiettivo' ? obiettivi.find((o) => o.id === riga.destinazioneId)?.nome
    : riga.tipoDestinazione === 'budget' ? budget.find((b) => b.id === riga.destinazioneId)?.nome
    : 'Disponibilità residua';
  return {
    id: `riga::${riga.id}`,
    tipo: 'Entrata',
    data: allocazione.data,
    descrizione: unisciParti([destLabel, allocazione.descrizione]),
    contoNome: conto ? conto.nome : '',
    importo: Number(riga.importo),
    stornato: !!riga.stornata,
    stornabile: !riga.stornata && (riga.tipoDestinazione === 'fondo' || riga.tipoDestinazione === 'obiettivo'),
    tipoAzione: 'riga',
    idAzione: riga.id
  };
}

// Riga di GRUPPO per un'intera Entrata: aggrega le righe figlie, espone il pulsante "Storna
// tutto" e il totale dell'entrata. Il testo di ricerca include anche le descrizioni delle righe
// figlie, così un gruppo resta trovabile cercando per Fondo/Obiettivo anche se non è espanso.
function costruisciRigaEntrataGruppo(allocazione, righeFiglie, conti, allegati) {
  const contoArrivo = conti.find((c) => c.id === allocazione.contoOrigineId);
  const numStornabili = righeFiglie.filter((r) => r.stornabile).length;
  const tutteStornate = righeFiglie.length > 0 && righeFiglie.every((r) => r.stornato);
  return {
    id: `allocazione::${allocazione.id}`,
    tipo: 'Entrata',
    gruppo: true,
    data: allocazione.data,
    descrizione: allocazione.descrizione || `Entrata distribuita su ${righeFiglie.length} voci`,
    testoRicerca: unisciParti([allocazione.descrizione, ...righeFiglie.map((r) => r.descrizione)], ' '),
    contoNome: contoArrivo ? contoArrivo.nome : '',
    importo: Number(allocazione.importoEntrata),
    stornato: tutteStornate,
    numStornabili,
    numRighe: righeFiglie.length,
    tipoAzione: 'allocazione',
    idAzione: allocazione.id,
    righeFiglie,
    allegati: allegati || []
  };
}

function costruisciRigaUscita(u, { fondi, obiettivi, conti }, allegati) {
  const fondo = fondi.find((f) => f.id === u.fondoId);
  const conto = conti.find((c) => c.id === fondo?.contoId);
  const obiettivo = u.obiettivoId ? obiettivi.find((o) => o.id === u.obiettivoId) : null;
  return {
    id: `uscita::${u.id}`,
    tipo: 'Uscita',
    data: u.data,
    descrizione: unisciParti([fondo?.nome, obiettivo?.nome, u.descrizione]),
    contoNome: conto ? conto.nome : '',
    importo: -Number(u.importo),
    stornato: !!u.stornata,
    stornabile: !u.stornata,
    tipoAzione: 'uscita',
    idAzione: u.id,
    allegati: allegati || []
  };
}

function contoIdDiEntita(tipo, id, fondi, obiettivi, budget) {
  if (tipo === 'conto') return id;
  if (tipo === 'fondo') return fondi.find((f) => f.id === id)?.contoId;
  if (tipo === 'obiettivo') {
    const ob = obiettivi.find((o) => o.id === id);
    return fondi.find((f) => f.id === ob?.fondoId)?.contoId;
  }
  if (tipo === 'budget') return budget?.find((b) => b.id === id)?.contoId;
  return null;
}

function etichettaEntita(tipo, id, { conti, fondi, obiettivi, budget }) {
  if (tipo === 'conto') return conti.find((c) => c.id === id)?.nome || null;
  if (tipo === 'fondo') return fondi.find((f) => f.id === id)?.nome || null;
  if (tipo === 'obiettivo') return obiettivi.find((o) => o.id === id)?.nome || null;
  if (tipo === 'budget') return budget?.find((b) => b.id === id)?.nome || null;
  return null;
}

function costruisciRigaTrasferimento(t, contesto) {
  // Per un movimento di chiusura Ciclo (avanzo/sforamento) l'unico Conto realmente
  // movimentato è quello del Fondo coinvolto — mai quello del Budget, che non detiene mai
  // patrimonio reale (§ chiarimento esplicito dell'utente). La colonna "Conto" mostra quindi
  // sempre il Conto del Fondo per queste righe, indipendentemente da chi sia origine/destinazione.
  let contoDestId;
  if (t.causaleCiclo) {
    const fondoId = t.tipoOrigine === 'fondo' ? t.origineId : t.destinazioneId;
    contoDestId = contesto.fondi.find((f) => f.id === fondoId)?.contoId;
  } else {
    contoDestId = contoIdDiEntita(t.tipoDestinazione, t.destinazioneId, contesto.fondi, contesto.obiettivi, contesto.budget);
  }
  const conto = contesto.conti.find((c) => c.id === contoDestId);
  const origineLabel = etichettaEntita(t.tipoOrigine, t.origineId, contesto);
  const destinazioneLabel = etichettaEntita(t.tipoDestinazione, t.destinazioneId, contesto);

  let movimento = null;
  if (origineLabel && destinazioneLabel) movimento = `Da ${origineLabel} a ${destinazioneLabel}`;
  else if (origineLabel) movimento = `Da ${origineLabel}`;
  else if (destinazioneLabel) movimento = `A ${destinazioneLabel}`;
  // Se nessuna delle due parti si risolve (entità eliminate), non si mostra alcun testo
  // segnaposto: resta solo la descrizione, come richiesto ("solo testo", niente frecce o trattini).

  return {
    id: `trasferimento::${t.id}`,
    tipo: 'Trasferimento',
    causaleCiclo: t.causaleCiclo || null,
    data: t.data,
    descrizione: unisciParti([movimento, t.descrizione]),
    contoNome: conto ? conto.nome : '',
    importo: Number(t.importo),
    stornato: !!t.stornata,
    // I movimenti di chiusura Ciclo non si stornano manualmente da qui: l'unico modo corretto
    // di annullarli è "Riapri Ciclo" (in Mese/Ciclo Budget), che tiene sincronizzato anche lo
    // stato del Ciclo. Uno Storno diretto qui lascerebbe il Ciclo "chiuso" ma con gli effetti
    // reali annullati: uno stato incoerente.
    stornabile: !t.stornata && !t.causaleCiclo,
    tipoAzione: 'trasferimento',
    idAzione: t.id
  };
}

function costruisciRigaRettifica(r, contesto) {
  const contoId = contoIdDiEntita(r.tipoEntita, r.entitaId, contesto.fondi, contesto.obiettivi);
  const conto = contesto.conti.find((c) => c.id === contoId);
  const entitaLabel = etichettaEntita(r.tipoEntita, r.entitaId, contesto);
  return {
    id: `rettifica::${r.id}`,
    tipo: 'Rettifica',
    data: r.data,
    descrizione: unisciParti([entitaLabel, r.descrizione]),
    contoNome: conto ? conto.nome : '',
    importo: Number(r.importo),
    stornato: !!r.stornata,
    stornabile: !r.stornata,
    tipoAzione: 'rettifica',
    idAzione: r.id
  };
}

const CHIAVI_ORDINAMENTO = {
  data: (r) => r.data,
  contoNome: (r) => r.contoNome,
  importo: (r) => r.importo
};

function rigaAzioniHtml(r) {
  return `
    <div class="azioni-riga">
      ${r.stornabile ? `<button class="btn-icona" title="Storna" data-tipo-azione="storna" data-tipo="${r.tipoAzione}" data-id="${r.idAzione}" data-riga-id="${r.id}"><i class="fa-solid fa-redo"></i></button>` : ''}
      <button class="btn-icona" title="Elimina definitivamente (senza storno)" data-tipo-azione="elimina" data-tipo="${r.tipoAzione}" data-id="${r.idAzione}" data-riga-id="${r.id}"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
}

function rigaGruppoHtml(r) {
  const espanso = stato.espansi.has(r.idAzione);
  const badgeStornato = r.stornato ? ' <span class="badge" style="background:#eee;">Stornato</span>' : '';
  const rigaPrincipale = `
    <tr class="riga-gruppo-entrata">
      <td></td>
      <td>${formattaDataOra(r.data)}</td>
      <td>${r.tipo}${badgeStornato}</td>
      <td class="colonna-descrizione">
        <button class="btn-icona" title="${espanso ? 'Comprimi' : 'Espandi'}" data-tipo-azione="espandi" data-id="${r.idAzione}">
          <i class="fa-solid ${espanso ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
        </button>
        ${r.descrizione || '<i class="fa-solid fa-question-circle"></i>'} <span class="nota">(${r.numRighe} voci)</span>
        ${(r.allegati && r.allegati.length > 0) ? r.allegati.map((a) => `<button class="btn-icona" title="Vedi allegato${a.nomeFile ? ': ' + a.nomeFile : ''}" data-azione="vedi-allegato" data-id="${a.id}"><i class="fa-solid fa-paperclip"></i></button>`).join('') : ''}
      </td>
      <td>${r.contoNome || 'Conto eliminato'}</td>
      <td class="numero">${formattaValuta(r.importo)}</td>
      <td>
        <div class="azioni-riga">
          ${r.numStornabili > 0 ? `<button class="btn-icona" title="Storna tutta l'Entrata (${r.numStornabili} voci)" data-tipo-azione="storna-tutto" data-id="${r.idAzione}"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `;
  if (!espanso) return rigaPrincipale;

  const righeFiglieHtml = r.righeFiglie.map((f) => `
    <tr class="riga-figlia-entrata">
      <td><input type="checkbox" class="checkbox-riga" data-id="${f.id}" ${stato.selezionati.has(f.id) ? 'checked' : ''}></td>
      <td></td>
      <td></td>
      <td style="padding-left:28px;" class="colonna-descrizione">↳ ${f.descrizione || '<i class="fa-solid fa-question-circle"></i>'}${f.stornato ? ' <span class="badge" style="background:#eee;">Stornato</span>' : ''}</td>
      <td>${f.contoNome || 'Conto eliminato'}</td>
      <td class="numero">${formattaValuta(f.importo)}</td>
      <td>${rigaAzioniHtml(f)}</td>
    </tr>
  `).join('');

  return rigaPrincipale + righeFiglieHtml;
}

function rigaSempliceHtml(r) {
  return `
    <tr>
      <td><input type="checkbox" class="checkbox-riga" data-id="${r.id}" ${stato.selezionati.has(r.id) ? 'checked' : ''}></td>
      <td>${formattaDataOra(r.data)}</td>
      <td>${r.tipo}${r.stornato ? ' <span class="badge" style="background:#eee;">Stornato</span>' : ''}${
        r.causaleCiclo === 'avanzo' ? ` <span class="badge" style="background:var(--colore-patrimonio-soft);color:var(--colore-patrimonio);">AVANZO</span>`
        : r.causaleCiclo === 'sforamento' ? ` <span class="badge" style="background:var(--colore-avviso-soft);color:var(--colore-avviso);">SFORAMENTO</span>`
        : ''
      }</td>
      <td class="colonna-descrizione">${r.descrizione || '<i class="fa-solid fa-question-circle"></i>'}${(r.allegati && r.allegati.length > 0) ? r.allegati.map((a) => `<button class="btn-icona" title="Vedi allegato${a.nomeFile ? ': ' + a.nomeFile : ''}" data-azione="vedi-allegato" data-id="${a.id}"><i class="fa-solid fa-paperclip"></i></button>`).join('') : ''}</td>
      <td>${r.contoNome || 'Conto eliminato'}</td>
      <td class="numero ${r.importo < 0 ? 'testo-errore' : ''}">${formattaValuta(r.importo)}</td>
      <td>${rigaAzioniHtml(r)}</td>
    </tr>
  `;
}

function renderTabella(container, righeVisualizzate, righePiatte) {
  const zona = container.querySelector('#tabella-movimenti');

  let righe = righeVisualizzate.filter((r) => nelPeriodo(r.data, stato.periodo));
  righe = filtraTesto(righe, stato.ricerca, (r) => `${r.descrizione} ${r.tipo} ${r.contoNome} ${r.testoRicerca || ''}`);
  righe = ordina(righe, CHIAVI_ORDINAMENTO[stato.ordineChiave] || CHIAVI_ORDINAMENTO.data, stato.ordineDecrescente);

  // Le checkbox "seleziona tutti" e il conteggio di selezione operano sulle sole righe
  // effettivamente selezionabili (i movimenti singoli, incluse le righe figlie di un'Entrata
  // espansa) — le righe di gruppo non hanno una checkbox propria.
  const righeSelezionabili = righe.flatMap((r) => (r.gruppo ? (stato.espansi.has(r.idAzione) ? r.righeFiglie : []) : [r]));
  const tutteSelezionate = righeSelezionabili.length > 0 && righeSelezionabili.every((r) => stato.selezionati.has(r.id));

  zona.innerHTML = righe.length === 0 ? '<p class="nota">Nessun movimento trovato.</p>' : `
    <table class="tabella">
      <thead>
        <tr>
          <th><input type="checkbox" id="checkbox-tutti" ${tutteSelezionate ? 'checked' : ''}></th>
          ${intestazioneOrdinabile('Data', 'data', stato)}
          <th>Tipo</th>
          <th>Descrizione</th>
          ${intestazioneOrdinabile('Conto di destinazione', 'contoNome', stato)}
          ${intestazioneOrdinabile('Importo', 'importo', stato)}
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${righe.map((r) => (r.gruppo ? rigaGruppoHtml(r) : rigaSempliceHtml(r))).join('')}
      </tbody>
    </table>
  `;

  collegaOrdinamento(zona, stato, () => renderTabella(container, righeVisualizzate, righePiatte));

  const checkboxTutti = zona.querySelector('#checkbox-tutti');
  if (checkboxTutti) {
    checkboxTutti.addEventListener('change', () => {
      if (checkboxTutti.checked) righeSelezionabili.forEach((r) => stato.selezionati.add(r.id));
      else righeSelezionabili.forEach((r) => stato.selezionati.delete(r.id));
      renderMovimenti(container);
    });
  }

  zona.querySelectorAll('button[data-tipo-azione="espandi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stato.espansi.has(btn.dataset.id)) stato.espansi.delete(btn.dataset.id);
      else stato.espansi.add(btn.dataset.id);
      renderTabella(container, righeVisualizzate, righePiatte);
    });
  });

  zona.querySelectorAll('button[data-azione="vedi-allegato"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tutti = [...righePiatte, ...righeVisualizzate.filter((r) => r.gruppo)];
      let trovato = null;
      for (const r of tutti) {
        trovato = (r.allegati || []).find((a) => a.id === btn.dataset.id);
        if (trovato) break;
      }
      if (!trovato) return;
      if (trovato.contenuto) {
        const finestra = window.open();
        if (finestra) {
          if (trovato.tipoMime && trovato.tipoMime.startsWith('image/')) {
            finestra.document.write(`<img src="${trovato.contenuto}" style="max-width:100%;">`);
          } else {
            finestra.location.href = trovato.contenuto;
          }
        }
      }
      const info = [
        trovato.percorsoRiferimento ? `Percorso: ${trovato.percorsoRiferimento}` : '',
        trovato.note ? `Note: ${trovato.note}` : '',
        !trovato.contenuto ? '' : null
      ].filter((x) => x).join('\n');
      if (info) alert(info + '\n\n(Per eliminare questo allegato, tieni premuto Alt e clicca di nuovo sulla graffetta.)');
    });
    btn.addEventListener('click', (e) => {
      if (!e.altKey) return;
      const tutti = [...righePiatte, ...righeVisualizzate.filter((r) => r.gruppo)];
      const trovatoTutti = tutti.flatMap((r) => r.allegati || []);
      const allegato = trovatoTutti.find((a) => a.id === btn.dataset.id);
      if (allegato && confirm('Eliminare questo allegato?')) {
        eliminaAllegato(allegato.id).then(() => renderMovimenti(container));
      }
    });
  });

  zona.querySelectorAll('.checkbox-riga').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) stato.selezionati.add(cb.dataset.id);
      else stato.selezionati.delete(cb.dataset.id);
      renderMovimenti(container);
    });
  });

  zona.querySelectorAll('button[data-tipo-azione="storna"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Stornare questo movimento? Verrà generato un movimento inverso; l\'originale resterà visibile come stornato.')) return;
      try {
        await STORNA_PER_TIPO[btn.dataset.tipo](btn.dataset.id);
        renderMovimenti(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  zona.querySelectorAll('button[data-tipo-azione="storna-tutto"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const gruppo = righeVisualizzate.find((r) => r.gruppo && r.idAzione === btn.dataset.id);
      const numVoci = gruppo ? gruppo.numStornabili : '';
      if (!confirm(`Stornare TUTTE le ${numVoci} voci ancora stornabili di questa Entrata? Verrà generato un movimento inverso per ciascuna riga; ognuna resterà visibile come stornata, singolarmente.`)) return;
      try {
        await stornaAllocazioneCompleta(btn.dataset.id, 'Storno completo Entrata');
        renderMovimenti(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  zona.querySelectorAll('button[data-tipo-azione="elimina"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await mostraConferma({
        titolo: 'Eliminare il movimento?',
        messaggio: 'Eliminare definitivamente questo movimento? Non è uno Storno: non annulla alcun effetto sul saldo e non lascia traccia.',
        testoConferma: 'Elimina movimento',
        pericoloso: true
      });
      if (!ok) return;
      try {
        await ELIMINA_PER_TIPO[btn.dataset.tipo](btn.dataset.id);
        renderMovimenti(container);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// Esporta il Registro Movimenti in formato CSV, scaricabile come file. Esporta tutte le righe
// (non solo quelle attualmente filtrate/visibili), ordinate per data. Resta un elenco piatto
// (una riga per movimento singolo, comprese le righe di ogni Entrata), invariato rispetto a
// prima: l'introduzione dei gruppi riguarda solo la visualizzazione a schermo.
function esportaRegistroCsv(righe) {
  const intestazione = ['Data e ora', 'Tipo', 'Descrizione', 'Conto di destinazione', 'Importo', 'Stornato'];
  const righeOrdinate = ordina(righe, (r) => r.data, true);
  const escapeCsv = (valore) => `"${String(valore ?? '').replace(/"/g, '""')}"`;

  const corpo = righeOrdinate.map((r) => [
    formattaDataOra(r.data), r.tipo, r.descrizione, r.contoNome, r.importo.toFixed(2), r.stornato ? 'Sì' : 'No'
  ].map(escapeCsv).join(';'));

  const csv = [intestazione.map(escapeCsv).join(';'), ...corpo].join('\n');
  // BOM iniziale: garantisce che Excel su Mac/Windows riconosca correttamente gli accenti.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registro-movimenti-${new Date().toISOString().substring(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
