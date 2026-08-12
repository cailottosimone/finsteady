// Utility condivisa per ordinamento e filtro testuale di elenchi.
// Principio: qualsiasi elenco dell'app deve poter essere ordinato e filtrato — questo modulo
// evita di duplicare la stessa logica in ogni vista.

// Ordina una copia dell'elenco secondo una chiave estratta da ciascun elemento.
// estraiChiave: (elemento) => stringa | numero
export function ordina(lista, estraiChiave, decrescente = false) {
  const copia = [...lista];
  copia.sort((a, b) => {
    const va = estraiChiave(a);
    const vb = estraiChiave(b);
    let cmp;
    if (typeof va === 'string' || typeof vb === 'string') {
      cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'it', { sensitivity: 'base' });
    } else {
      cmp = (Number(va) || 0) - (Number(vb) || 0);
    }
    return decrescente ? -cmp : cmp;
  });
  return copia;
}

// Filtra un elenco in base a un testo di ricerca libero, cercando in uno o più campi.
// estraiTesto: (elemento) => stringa (già concatenata dei campi su cui cercare)
export function filtraTesto(lista, testo, estraiTesto) {
  if (!testo || !testo.trim()) return lista;
  const q = testo.trim().toLowerCase();
  return lista.filter((el) => estraiTesto(el).toLowerCase().includes(q));
}

// Genera l'HTML di un'intestazione di colonna ordinabile (con indicatore fa-icon ▲▼), da usare
// nei <th> delle tabelle. chiaveColonna deve corrispondere alla chiave passata a
// gestisciClickOrdinamento.
export function intestazioneOrdinabile(etichetta, chiaveColonna, stato) {
  const attiva = stato.ordineChiave === chiaveColonna;
  const freccia = attiva
    ? ` <i class="fa-solid ${stato.ordineDecrescente ? 'fa-caret-down' : 'fa-caret-up'}"></i>`
    : '';
  return `<th class="th-ordinabile" data-chiave="${chiaveColonna}">${etichetta}${freccia}</th>`;
}

// Collega il click sulle intestazioni ordinabili di un contenitore: al primo click su una
// colonna nuova ordina decrescente, ai click successivi sulla stessa colonna alterna la direzione.
export function collegaOrdinamento(container, stato, onCambio) {
  container.querySelectorAll('.th-ordinabile').forEach((th) => {
    th.addEventListener('click', () => {
      const chiave = th.dataset.chiave;
      if (stato.ordineChiave === chiave) {
        stato.ordineDecrescente = !stato.ordineDecrescente;
      } else {
        stato.ordineChiave = chiave;
        stato.ordineDecrescente = true;
      }
      onCambio();
    });
  });
}
