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

// Calcolo condiviso dello stato di integrità patrimoniale: usato sia dalla Dashboard (badge +
// equazione aggregata) sia dalla vista Diagnostica in Impostazioni (dettaglio completo per
// Conto) — evita di interrogare due volte IndexedDB e di duplicare la logica di calcolo.
// Firma invariata rispetto alla versione precedente: js/ui/viewImpostazioniDiagnostica.js la
// importa da qui.
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

// Elenco delle Azioni (invariato nella sostanza: stessi id/icone/etichette di prima — altre
// viste vi fanno riferimento, in particolare viewImpostazioniDashboard.js per la
// personalizzazione "in evidenza" e js/components/menuAzioniRapide.js per il menu globale).
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
  const budgetAssegnatoTotale = budget.filter((b) => !b.stato || b.stato === 'attivo')
    .reduce((s, b) => s + (Number(b.importoAssegnatoDefault) || 0), 0);
  const { problemi, verificheConMovimento } = statoIntegrita;

  // Equazione patrimoniale aggregata (Conto = Fondi + Liquidità libera), sull'intero
  // portafoglio invece che Conto per Conto: il dettaglio per singolo Conto resta in
  // Impostazioni → Diagnostica (js/ui/viewImpostazioniDiagnostica.js, invariata), qui è la
  // sintesi d'insieme — stesso calcolo, solo aggregato invece che per riga.
  const totaleFondiConMovimento = verificheConMovimento.reduce((s, v) => s + v.totaleFondi, 0);
  const totaleSaldoConMovimento = verificheConMovimento.reduce((s, v) => s + (Number(v.conto.saldoReale) || 0), 0);
  const baseEquazione = Math.max(totaleSaldoConMovimento, totaleFondiConMovimento, 0.01);
  const pctFondi = Math.max(0, Math.min(100, (totaleFondiConMovimento / baseEquazione) * 100));
  const pctLibera = Math.max(0, 100 - pctFondi);
  const liquiditaLibera = totaleSaldoConMovimento - totaleFondiConMovimento;

  // Budget assegnato per Conto: raggruppa le definizioni di Budget per il Conto di appartenenza.
  const budgetPerConto = new Map();
  budget.forEach((b) => {
    const lista = budgetPerConto.get(b.contoId) || [];
    lista.push(b);
    budgetPerConto.set(b.contoId, lista);
  });

  const azioniStriscia = AZIONI.filter((a) => a.primaria || azioniInEvidenza.includes(a.id));
  const azioniAltre = AZIONI.filter((a) => !a.primaria && !azioniInEvidenza.includes(a.id));

  container.innerHTML = `
    <section class="pannello">
      <h2>Patrimonio</h2>
      <span class="kpi-label">Totale Fondi</span>
      <div style="font-family:var(--font-numeri); font-variant-numeric:tabular-nums; font-size:2.4rem; font-weight:700; line-height:1.1; margin:4px 0 var(--spazio-sm);">
        ${formattaValuta(patrimonioFondi)}
      </div>
      ${verificheConMovimento.length > 0 ? `
        <div class="equazione-patrimoniale">
          <div class="equazione-barra">
            <div class="equazione-segmento fondi" style="width:${pctFondi}%"></div>
            <div class="equazione-segmento libera" style="width:${pctLibera}%"></div>
          </div>
          <div class="equazione-legenda">
            <span class="equazione-voce"><span class="equazione-pallino fondi"></span>Fondi ${formattaValuta(totaleFondiConMovimento)}</span>
            <span class="equazione-voce"><span class="equazione-pallino libera"></span>Liquidità non allocata ${formattaValuta(liquiditaLibera)}</span>
          </div>
        </div>
      ` : ''}
      <div class="kpi-riga" style="margin-top:var(--spazio-sm);">
        <div class="kpi">
          <span class="kpi-label">Saldo Conti (totale)</span>
          <span class="kpi-valore">${formattaValuta(saldoContiTotale)}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Budget assegnato (attivo)</span>
          <span class="kpi-valore">${formattaValuta(budgetAssegnatoTotale)}</span>
        </div>
      </div>
      ${problemi.length === 0
        ? '<p class="badge badge-ok" style="margin-top:var(--spazio-sm);">✓ Tutto regolare</p>'
        : `<button id="btn-badge-integrita" class="badge badge-errore" style="cursor:pointer; border:none; font:inherit; margin-top:var(--spazio-sm);">⚠ ${problemi.length} problem${problemi.length === 1 ? 'a rilevato' : 'i rilevati'}</button>`}
    </section>

    <section class="pannello">
      <h2>Azioni rapide</h2>
      <p class="nota">Sempre raggiungibili anche dal pulsante "+" (sidebar/tabbar), ovunque tu sia nell'app.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${azioniStriscia.map((a) => `
          <button type="button" id="btn-azione-${a.id}" class="chip-selezione" style="${a.primaria ? 'background:var(--colore-operativita); border-color:var(--colore-operativita); color:#fff; font-weight:600;' : ''}">
            ${a.icona}${a.label}
          </button>
        `).join('')}
        ${azioniAltre.length > 0 ? `<button type="button" id="btn-altre-azioni" class="chip-selezione"><i class="fa-solid fa-ellipsis"></i>Altre azioni</button>` : ''}
      </div>
    </section>

    <section class="pannello" style="border-top: 2px solid var(--colore-bordo-forte);">
      <h2>Budget assegnato per Conto</h2>
      <p class="nota">
        Somma degli importi "modello" dei Budget <strong>attivi</strong> definiti su ciascun Conto
        (i Budget disattivati non entrano nei totali, ma restano visibili nel dettaglio) — una
        vista informativa, separata dal patrimonio: il Budget non entra mai nella Verifica di
        Integrità Patrimoniale qui sopra.
      </p>
      ${budgetPerConto.size === 0 ? '<p class="nota">Nessun Budget definito.</p>' : `
        <div class="lista-metriche">
          ${conti.filter((c) => budgetPerConto.has(c.id)).map((c) => {
            const lista = budgetPerConto.get(c.id);
            const totale = lista.filter((b) => !b.stato || b.stato === 'attivo').reduce((s, b) => s + (Number(b.importoAssegnatoDefault) || 0), 0);
            const espanso = contoBudgetEspansoId === c.id;
            return `
              <div class="riga-metrica">
                <span class="riga-metrica-nome">${c.nome}</span>
                <div class="riga-metrica-valori">
                  <span class="riga-metrica-valore"><span class="etichetta">Budget attivo</span><span class="numero">${formattaValuta(totale)}</span></span>
                </div>
                <div class="riga-metrica-azioni">
                  <button class="btn-icona" title="${espanso ? 'Chiudi' : 'Dettaglio'}" data-azione="espandi-budget-conto" data-id="${c.id}">${espanso ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>'}</button>
                </div>
                ${espanso ? `
                  <div class="riga-elenco-azioni-dettaglio" style="flex:1 1 100%;">
                    <div class="elenco-dettaglio-annidato">
                      ${lista.map((b) => `
                        <div class="elenco-dettaglio-annidato-riga">
                          <span>${b.nome} ${!budgetIdsCollegati.has(b.id) ? '<span class="badge">Scollegato</span>' : (b.stato === 'inattivo' ? '<span class="badge">Inattivo</span>' : '')}</span>
                          <span class="numero">${formattaValuta(b.importoAssegnatoDefault)}</span>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
          <div class="riga-metrica totale">
            <span class="riga-metrica-nome">Totale generale</span>
            <div class="riga-metrica-valori">
              <span class="riga-metrica-valore"><span class="numero">${formattaValuta(budgetAssegnatoTotale)}</span></span>
            </div>
          </div>
        </div>
      `}
    </section>
  `;

  AZIONI.forEach((a) => {
    const btn = container.querySelector(`#btn-azione-${a.id}`);
    if (btn) btn.addEventListener('click', () => window.apriAzione(a.id));
  });

  const btnAltreAzioni = container.querySelector('#btn-altre-azioni');
  if (btnAltreAzioni) {
    btnAltreAzioni.addEventListener('click', () => {
      import('../components/menuAzioniRapide.js').then(({ apriMenuAzioniRapide }) => apriMenuAzioniRapide());
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
