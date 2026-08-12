// Modale-vista: monta una funzione render(container) esistente (es. renderUscita,
// renderTrasferimento...) dentro una modale invece che nel <main> a piena pagina.
//
// Perché questo invece di duplicare le viste: ogni vista di js/ui/*.js accetta già un
// "container" generico e fa container.querySelector(...) al suo interno — non assume mai che
// sia <main>. Passandole il corpo della modale al posto del contenitore di pagina, la vista
// funziona identica in tutto e per tutto (stessa logica, stessa validazione, stesso dominio):
// qui cambia solo DOVE viene disegnata, mai COSA fa.
//
// Un solo overlay per volta, stesso principio di dialogUtils.js (le azioni in questa app sono
// sempre sequenziali, mai sovrapposte).

let overlayAttuale = null;

function chiudiModaleVista() {
  if (overlayAttuale) {
    overlayAttuale.remove();
    overlayAttuale = null;
    document.removeEventListener('keydown', gestisciEsc);
  }
}

function gestisciEsc(e) {
  if (e.key === 'Escape') chiudiModaleVista();
}

// apriModaleVista({ titolo, render, dimensione }) — dimensione: 'compatta' (default) | 'ampia'
export function apriModaleVista({ titolo, render, dimensione = 'compatta' }) {
  chiudiModaleVista();

  const overlay = document.createElement('div');
  overlay.className = 'modale-vista-overlay';
  overlay.innerHTML = `
    <div class="modale-vista-riquadro ${dimensione === 'ampia' ? 'ampia' : ''}" role="dialog" aria-modal="true" aria-label="${titolo}">
      <div class="modale-vista-header">
        <h2>${titolo}</h2>
        <button type="button" class="modale-vista-chiudi" data-chiudi-modale-vista aria-label="Chiudi">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="modale-vista-corpo"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlayAttuale = overlay;
  document.addEventListener('keydown', gestisciEsc);

  overlay.querySelector('[data-chiudi-modale-vista]').addEventListener('click', chiudiModaleVista);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) chiudiModaleVista(); });

  const corpo = overlay.querySelector('.modale-vista-corpo');
  render(corpo);
}

export { chiudiModaleVista };
