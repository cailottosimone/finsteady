// Dialoghi modali coerenti col design system, in sostituzione di confirm()/prompt() nativi
// del browser (che non si possono personalizzare e non spiegano mai l'azione sul pulsante).
// Un solo overlay per volta: se un dialogo è già aperto, chiuderlo prima di aprirne un altro
// (in questa app le conferme sono sempre sequenziali, mai sovrapposte).

let overlayAttuale = null;

function chiudiOverlayAttuale() {
  if (overlayAttuale) {
    overlayAttuale.remove();
    overlayAttuale = null;
    document.removeEventListener('keydown', gestisciEsc);
  }
}

function gestisciEsc(e) {
  if (e.key === 'Escape' && overlayAttuale) {
    const btnAnnulla = overlayAttuale.querySelector('[data-dialog-annulla]');
    if (btnAnnulla) btnAnnulla.click();
  }
}

function creaOverlay(contenutoHtml) {
  chiudiOverlayAttuale();
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `<div class="dialog-riquadro" role="dialog" aria-modal="true">${contenutoHtml}</div>`;
  document.body.appendChild(overlay);
  overlayAttuale = overlay;
  document.addEventListener('keydown', gestisciEsc);
  return overlay;
}

// mostraConferma({ titolo, messaggio, testoConferma, pericoloso }) → Promise<boolean>
// testoConferma deve essere esplicito sull'azione (es. "Elimina 12 record orfani"), mai un
// generico "OK": chi conferma deve sapere esattamente cosa sta per succedere.
export function mostraConferma({ titolo = 'Conferma', messaggio, testoConferma = 'Conferma', pericoloso = false } = {}) {
  return new Promise((resolve) => {
    const overlay = creaOverlay(`
      <h3 class="dialog-titolo">${titolo}</h3>
      <p class="dialog-messaggio">${messaggio}</p>
      <div class="dialog-azioni">
        <button type="button" class="dialog-btn-annulla" data-dialog-annulla>Annulla</button>
        <button type="button" class="dialog-btn-conferma ${pericoloso ? 'dialog-btn-pericoloso' : ''}" data-dialog-conferma>${testoConferma}</button>
      </div>
    `);
    const risolvi = (valore) => {
      chiudiOverlayAttuale();
      resolve(valore);
    };
    overlay.querySelector('[data-dialog-annulla]').addEventListener('click', () => risolvi(false));
    overlay.querySelector('[data-dialog-conferma]').addEventListener('click', () => risolvi(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) risolvi(false); });
    overlay.querySelector('[data-dialog-conferma]').focus();
  });
}

// mostraPrompt({ titolo, messaggio, valoreIniziale }) → Promise<string|null>
export function mostraPrompt({ titolo = 'Inserisci un valore', messaggio = '', valoreIniziale = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = creaOverlay(`
      <h3 class="dialog-titolo">${titolo}</h3>
      ${messaggio ? `<p class="dialog-messaggio">${messaggio}</p>` : ''}
      <input type="text" class="dialog-input" data-dialog-input value="${(valoreIniziale ?? '').replace(/"/g, '&quot;')}">
      <div class="dialog-azioni">
        <button type="button" class="dialog-btn-annulla" data-dialog-annulla>Annulla</button>
        <button type="button" class="dialog-btn-conferma" data-dialog-conferma>Conferma</button>
      </div>
    `);
    const input = overlay.querySelector('[data-dialog-input]');
    const risolvi = (valore) => {
      chiudiOverlayAttuale();
      resolve(valore);
    };
    overlay.querySelector('[data-dialog-annulla]').addEventListener('click', () => risolvi(null));
    overlay.querySelector('[data-dialog-conferma]').addEventListener('click', () => risolvi(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); risolvi(input.value.trim() || null); }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) risolvi(null); });
    input.focus();
    input.select();
  });
}

// Convenzione per la validazione inline dei form (vedi criteri Fase A del prompt UX):
// marca il campo non valido e mostra un messaggio sotto, senza dialoghi bloccanti.
export function segnalaCampoInvalido(campoEl, messaggio) {
  campoEl.classList.add('campo-invalido');
  let errore = campoEl.parentElement.querySelector('.errore-campo');
  if (!errore) {
    errore = document.createElement('span');
    errore.className = 'errore-campo';
    campoEl.insertAdjacentElement('afterend', errore);
  }
  errore.textContent = messaggio;
}

export function ripulisciCampoInvalido(campoEl) {
  campoEl.classList.remove('campo-invalido');
  const errore = campoEl.parentElement.querySelector('.errore-campo');
  if (errore) errore.remove();
}
