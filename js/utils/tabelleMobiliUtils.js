// js/utils/tabelleMobiliUtils.js
//
// Su schermi piccoli (css/style.css, blocco @media max-width:720px) le righe di tabella
// diventano SCHEDE impilate verticalmente invece di scorrere in orizzontale: ogni cella mostra
// la propria etichetta di colonna sopra il valore (":before { content: attr(data-label) }"),
// perché l'intestazione <thead> in quella modalità è nascosta.
//
// Questo modulo assegna l'attributo data-label ad ogni <td> leggendo il testo del <th>
// corrispondente nella stessa tabella — UNA VOLTA SOLA, qui, invece di modificare a mano le
// decine di viste che generano tabelle in tutta l'app. Si aggancia con un MutationObserver
// sul contenitore principale (#contenuto, passato da app.js all'avvio) e si applica
// automaticamente a QUALSIASI tabella con classe .tabella o .tabella-integrita che compaia,
// anche generata dopo l'avvio (filtri, ordinamento, righe espanse) — nessuna vista deve
// occuparsene esplicitamente, funziona anche per viste future con la stessa struttura.
//
// Righe con un numero di celle diverso dal numero di intestazioni (tipicamente le righe di
// dettaglio/espansione con <td colspan="...">) vengono lasciate senza data-label: in modalità
// scheda diventano semplicemente un blocco a piena larghezza, che è il comportamento corretto
// per un pannello di dettaglio.

function estraiEtichette(tabella) {
  return Array.from(tabella.querySelectorAll(':scope > thead > tr > th')).map((th) => th.textContent.trim());
}

function decoraTabella(tabella) {
  const etichette = estraiEtichette(tabella);
  if (etichette.length === 0) return;
  tabella.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
    const celle = tr.querySelectorAll(':scope > td');
    if (celle.length !== etichette.length) return; // riga di dettaglio/espansione: nessuna etichetta
    celle.forEach((td, i) => td.setAttribute('data-label', etichette[i]));
  });
}

/** Va chiamata una volta all'avvio dell'app (vedi js/app.js), passando il contenitore
 * principale delle viste. Decora subito le tabelle già presenti e resta in ascolto per
 * qualunque tabella aggiunta/modificata in seguito. */
export function avviaDecorazioneTabelleMobili(radice) {
  const decoraTutte = () => {
    radice.querySelectorAll('table.tabella, table.tabella-integrita').forEach(decoraTabella);
  };
  decoraTutte();
  const observer = new MutationObserver(decoraTutte);
  observer.observe(radice, { childList: true, subtree: true });
}
