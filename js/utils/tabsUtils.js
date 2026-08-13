// Utility condivisa per barre di tab accessibili (pattern ARIA "tabs"), usata per raggruppare
// più viste dentro una stessa sezione (es. Conti → Fondi/Budget; Strategia & Report → Piano/
// Consuntivi/...). Un solo punto di implementazione, per garantire lo stesso comportamento
// (mouse e tastiera) ovunque nell'app.
//
// Comportamento da tastiera, secondo le linee guida ARIA per i tab:
// - Frecce ←/→ spostano il focus tra le tab (roving tabindex: solo la tab attiva è nel tab
//   order, le altre hanno tabindex="-1");
// - Home/End vanno rispettivamente alla prima/ultima tab;
// - Invio/Spazio (click nativo del bottone) attivano la tab.

// tabs: [{ chiave, etichetta, classeAccento? }]
// onCambio(chiave, elementoPannello): chiamato ogni volta che la tab attiva cambia (anche alla
// prima renderizzazione), con l'elemento del pannello da riempire.
export function renderBarraTab(container, { idBase, tabs, chiaveAttiva, onCambio }) {
  container.innerHTML = `
    <div class="barra-tab" role="tablist" aria-label="${idBase}">
      ${tabs.map((t) => `
        <button
          class="tab-btn ${t.chiave === chiaveAttiva ? 'tab-btn-attiva' : ''}"
          role="tab"
          type="button"
          id="tab-${idBase}-${t.chiave}"
          aria-selected="${t.chiave === chiaveAttiva}"
          aria-controls="pannello-${idBase}"
          tabindex="${t.chiave === chiaveAttiva ? '0' : '-1'}"
          data-chiave="${t.chiave}"
        >${t.etichetta}</button>
      `).join('')}
    </div>
    <div id="pannello-${idBase}" class="pannello-tab-contenuto" role="tabpanel"></div>
  `;

  const bottoni = Array.from(container.querySelectorAll('.tab-btn'));
  const pannello = container.querySelector(`#pannello-${idBase}`);

  const attivaTab = (chiave) => {
    bottoni.forEach((b) => {
      const attiva = b.dataset.chiave === chiave;
      b.classList.toggle('tab-btn-attiva', attiva);
      b.setAttribute('aria-selected', String(attiva));
      b.tabIndex = attiva ? 0 : -1;
    });
    pannello.setAttribute('aria-labelledby', `tab-${idBase}-${chiave}`);
    onCambio(chiave, pannello);
  };

  bottoni.forEach((b, i) => {
    b.addEventListener('click', () => attivaTab(b.dataset.chiave));
    b.addEventListener('keydown', (e) => {
      let nuovoIndice = null;
      if (e.key === 'ArrowRight') nuovoIndice = (i + 1) % bottoni.length;
      else if (e.key === 'ArrowLeft') nuovoIndice = (i - 1 + bottoni.length) % bottoni.length;
      else if (e.key === 'Home') nuovoIndice = 0;
      else if (e.key === 'End') nuovoIndice = bottoni.length - 1;
      if (nuovoIndice !== null) {
        e.preventDefault();
        bottoni[nuovoIndice].focus();
        attivaTab(bottoni[nuovoIndice].dataset.chiave);
      }
    });
  });

  attivaTab(chiaveAttiva);

  return { attivaTab };
}
