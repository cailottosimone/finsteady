import { elencoConti } from '../domain/conti.js';
import { elencoFondi } from '../domain/fondi.js';
import { elencoBudget } from '../domain/budget.js';
import { elencoTuttiICicli } from '../domain/budgetCicli.js';
import { elencoObiettivi } from '../domain/obiettivi.js';
import { elencoAllocazioni, elencoTutteLeRighe } from '../domain/allocazioni.js';
import { elencoUscite } from '../domain/uscite.js';
import { elencoTrasferimenti } from '../domain/trasferimenti.js';
import { elencoRettifiche } from '../domain/rettifiche.js';
import { elencoStorni } from '../domain/storni.js';
import { ottieniAzioniInEvidenza } from '../domain/impostazioniDashboard.js';
import { elencoBudgetIdsCollegati } from '../domain/piano.js';
import { verificaIntegritaGlobale, eseguiVerificaIntegritaCompleta } from '../engine/integrityCheck.js';
import { impostaTabAttivaImpostazioni } from './viewImpostazioni.js';
import { formattaValuta } from '../utils/formatCurrency.js';

let contoBudgetEspansoId = null;

// Calcolo condiviso dello stato di integrità patrimoniale: usato sia dalla Dashboard (solo per
// il conteggio nel badge) sia dalla vista Diagnostica in Impostazioni (per il dettaglio
// completo) — evita di interrogare due volte IndexedDB e di duplicare la logica di calcolo.
export async function calcolaStatoIntegrita() {
  const [conti, fondi, obiettivi, budget, allocazioni, righeAllocazione, uscite, trasferimenti, rettifiche, storni, budgetCicli] = await Promise.all([
    elencoConti(), elencoFondi(), elencoObiettivi(), elencoBudget(),
    elencoAllocazioni(), elencoTutteLeRighe(), elencoUscite(), elencoTrasferimenti(), elencoRettifiche(), elencoStorni(),
    elencoTuttiICicli()
  ]);

  const verifiche = verificaIntegritaGlobale(conti, fondi);
  const problemi = eseguiVerificaIntegritaCompleta({
    conti, fondi, obiettivi, budget, budgetCicli, allocazioni, righeAllocazione, uscite, trasferimenti, rettifiche, storni
  });

  // Conti con saldo e Fondi entrambi a zero: mostrali in tabella, ma non generare una barra
  // dell'equazione vuota (0 = 0 + 0 non comunica nulla di utile).
  const verificheConMovimento = verifiche.filter((v) => Math.abs(v.conto.saldoReale) > 0.005 || Math.abs(v.totaleFondi) > 0.005);

  return { conti, fondi, verifiche, verificheConMovimento, problemi };
}

export const AZIONI = [
  { id: 'entrata', icona: '<i class="fa-solid fa-plus"></i>', label: 'Registra Entrata', primaria: true },
  { id: 'uscita', icona: '<i class="fa-solid fa-minus"></i>', label: 'Registra Uscita' },
  { id: 'trasferimento', icona: '<i class="fa-solid fa-exchange-alt"></i>', label: 'Registra Trasferimento' },
  { id: 'rettifica', icona: '<i class="fa-solid fa-edit"></i>', label: 'Registra Rettifica' },
  { id: 'distribuzione', icona: '<i class="fa-solid fa-arrow-right"></i>', label: 'Distribuisci Disponibile' },
  { id: 'ridistribuzione', icona: '<i class="fa-solid fa-redo"></i>', label: 'Ridistribuisci Liquidità' },
  { id: 'cicloBudget', icona: '<i class="fa-solid fa-calendar-days"></i>', label: 'Ciclo Budget (Mese)' }
];

export async function renderDashboard(container) {
  const [conti, fondi, budget, azioniInEvidenza, budgetIdsCollegati, statoIntegrita] = await Promise.all([
    elencoConti(), elencoFondi(), elencoBudget(),
    ottieniAzioniInEvidenza(), elencoBudgetIdsCollegati(),
    calcolaStatoIntegrita()
  ]);

  const patrimonioFondi = fondi.reduce((s, f) => s + (Number(f.saldo) || 0), 0);
  const saldoContiTotale = conti.reduce((s, c) => s + (Number(c.saldoReale) || 0), 0);
  const { problemi } = statoIntegrita;

  // Budget assegnato per Conto: raggruppa le definizioni di Budget per il Conto di appartenenza.
  const budgetPerConto = new Map();
  budget.forEach((b) => {
    const lista = budgetPerConto.get(b.contoId) || [];
    lista.push(b);
    budgetPerConto.set(b.contoId, lista);
  });

  const azioniPrimarie = AZIONI.filter((a) => a.primaria);
  const azioniEvidenza = AZIONI.filter((a) => !a.primaria && azioniInEvidenza.includes(a.id));
  const azioniAltre = AZIONI.filter((a) => !a.primaria && !azioniInEvidenza.includes(a.id));

  container.innerHTML = `
    <section class="pannello">
      <h2>Azioni</h2>
      <div class="azioni-riga-principale">
        ${azioniPrimarie.map((a) => `
          <button id="btn-azione-${a.id}" class="azione-btn azione-primaria">
            <span class="azione-icona">${a.icona}</span>${a.label}
          </button>
        `).join('')}
        ${azioniEvidenza.map((a) => `
          <button id="btn-azione-${a.id}" class="azione-btn azione-neutra">
            <span class="azione-icona">${a.icona}</span>${a.label}
          </button>
        `).join('')}
        ${azioniAltre.length > 0 ? `
          <div class="menu-altre-azioni">
            <button id="btn-altre-azioni" class="azione-btn azione-neutra" aria-haspopup="true" aria-expanded="false">
              <span class="azione-icona"><i class="fa-solid fa-ellipsis"></i></span>Altre azioni
            </button>
            <div id="dropdown-altre-azioni" class="dropdown-azioni" hidden>
              ${azioniAltre.map((a) => `
                <button id="btn-azione-${a.id}" class="dropdown-azioni-voce">${a.icona}${a.label}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </section>

    <section class="pannello">
      <h2>Patrimonio</h2>
      <div class="kpi-riga">
        <div class="kpi">
          <span class="kpi-label">Saldo Conti (totale)</span>
          <span class="kpi-valore">${formattaValuta(saldoContiTotale)}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Totale Fondi (patrimonio)</span>
          <span class="kpi-valore">${formattaValuta(patrimonioFondi)}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Budget attivi (definizioni)</span>
          <span class="kpi-valore">${budget.length}</span>
        </div>
      </div>
    </section>

    <section class="pannello">
      ${problemi.length === 0
        ? '<p class="badge badge-ok">✓ Tutto regolare</p>'
        : `<button id="btn-badge-integrita" class="badge badge-errore" style="cursor:pointer; border:none; font: inherit;">⚠ ${problemi.length} problem${problemi.length === 1 ? 'a rilevato' : 'i rilevati'}</button>`}
    </section>

    <section class="pannello" style="border-top: 3px solid var(--colore-operativita);">
      <h2>Budget assegnato per Conto</h2>
      <p class="nota">
        Somma degli importi "modello" dei Budget **attivi** definiti su ciascun Conto (i Budget
        disattivati non entrano nei totali, ma restano visibili nel dettaglio) — una vista
        informativa, separata dal patrimonio: il Budget non entra mai nella Verifica di
        Integrità Patrimoniale qui sopra.
      </p>
      ${budgetPerConto.size === 0 ? '<p class="nota">Nessun Budget definito.</p>' : `
        <table class="tabella">
          <thead><tr><th>Conto</th><th>Totale Budget attivo</th><th></th></tr></thead>
          <tbody>
            ${conti.filter((c) => budgetPerConto.has(c.id)).map((c) => {
              const lista = budgetPerConto.get(c.id);
              const totale = lista.filter((b) => !b.stato || b.stato === 'attivo').reduce((s, b) => s + (Number(b.importoAssegnatoDefault) || 0), 0);
              const espanso = contoBudgetEspansoId === c.id;
              return `
                <tr>
                  <td>${c.nome}</td>
                  <td class="numero">${formattaValuta(totale)}</td>
                  <td><button class="btn-icona" title="${espanso ? 'Chiudi' : 'Dettaglio'}" data-azione="espandi-budget-conto" data-id="${c.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button></td>
                </tr>
                ${espanso ? `
                  <tr>
                    <td colspan="3" style="background:var(--colore-sfondo-soft);">
                      <table class="tabella">
                        <thead><tr><th>Budget</th><th>Importo</th></tr></thead>
                        <tbody>
                          ${lista.map((b) => `
                            <tr>
                              <td>${b.nome} ${!budgetIdsCollegati.has(b.id) ? '<span class="badge" style="background:#fff; border:1px dashed var(--colore-bordo-forte); ">Scollegato</span>' : (b.stato === 'inattivo' ? '<span class="badge" style="background:#eee;">Inattivo</span>' : '')}</td>
                              <td class="numero">${formattaValuta(b.importoAssegnatoDefault)}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
            <tr style="font-weight:600; border-top: 2px solid var(--colore-bordo-forte);">
              <td>Totale generale</td>
              <td class="numero">${formattaValuta(
                budget.filter((b) => !b.stato || b.stato === 'attivo').reduce((s, b) => s + (Number(b.importoAssegnatoDefault) || 0), 0)
              )}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      `}
    </section>
  `;

  AZIONI.forEach((a) => {
    const btn = container.querySelector(`#btn-azione-${a.id}`);
    if (btn) btn.addEventListener('click', () => window.mostraVista(a.id));
  });

  const btnAltreAzioni = container.querySelector('#btn-altre-azioni');
  const dropdownAltreAzioni = container.querySelector('#dropdown-altre-azioni');
  if (btnAltreAzioni && dropdownAltreAzioni) {
    function chiudiDropdownAltreAzioni() {
      dropdownAltreAzioni.hidden = true;
      btnAltreAzioni.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', chiudiSuClickEsterno);
    }
    function chiudiSuClickEsterno(e) {
      if (!dropdownAltreAzioni.contains(e.target)) chiudiDropdownAltreAzioni();
    }
    btnAltreAzioni.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdownAltreAzioni.hidden) {
        dropdownAltreAzioni.hidden = false;
        btnAltreAzioni.setAttribute('aria-expanded', 'true');
        document.addEventListener('click', chiudiSuClickEsterno);
      } else {
        chiudiDropdownAltreAzioni();
      }
    });
    dropdownAltreAzioni.querySelectorAll('.dropdown-azioni-voce').forEach((btn) => {
      btn.addEventListener('click', () => chiudiDropdownAltreAzioni());
    });
  }

  const btnBadgeIntegrita = container.querySelector('#btn-badge-integrita');
  if (btnBadgeIntegrita) {
    btnBadgeIntegrita.addEventListener('click', () => {
      impostaTabAttivaImpostazioni('diagnostica');
      window.mostraVista('impostazioni');
    });
  }

  container.querySelectorAll('button[data-azione="espandi-budget-conto"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      contoBudgetEspansoId = contoBudgetEspansoId === btn.dataset.id ? null : btn.dataset.id;
      renderDashboard(container);
    });
  });
}
