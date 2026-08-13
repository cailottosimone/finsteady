import { AZIONI } from './dashboard.js';
import { ottieniAzioniInEvidenza, impostaAzioniInEvidenza } from '../domain/impostazioniDashboard.js';

export async function renderImpostazioniDashboard(container) {
  const azioniInEvidenza = new Set(await ottieniAzioniInEvidenza());
  const azioniScelta = AZIONI.filter((a) => !a.primaria);

  container.innerHTML = `
    <section class="pannello">
      <h3>Azioni in evidenza nella Dashboard</h3>
      <p class="nota">
        "Registra Entrata" è sempre in evidenza. Spunta la stellina delle altre Azioni che vuoi
        vedere subito in Dashboard, accanto ad essa — quelle non spuntate restano dentro il
        menu "Altre azioni".
      </p>
      <ul class="elenco-scelta-azioni">
        ${azioniScelta.map((a) => `
          <li>
            <button class="btn-stella-azione" data-id="${a.id}" title="${azioniInEvidenza.has(a.id) ? 'Rimuovi dalle azioni in evidenza' : 'Mostra in evidenza in Dashboard'}">
              <i class="fa-${azioniInEvidenza.has(a.id) ? 'solid' : 'regular'} fa-star"></i>
            </button>
            <span>${a.icona} ${a.label}</span>
          </li>
        `).join('')}
      </ul>
    </section>
  `;

  container.querySelectorAll('.btn-stella-azione').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (azioniInEvidenza.has(id)) azioniInEvidenza.delete(id);
      else azioniInEvidenza.add(id);
      await impostaAzioniInEvidenza([...azioniInEvidenza]);
      renderImpostazioniDashboard(container);
    });
  });
}
