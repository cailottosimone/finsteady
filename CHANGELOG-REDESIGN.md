# CHANGELOG — dev branch di redesign grafico

Questo file documenta **solo** il ridisegno visivo/UX partito dal repository funzionale
`v0.36-001`. Nessuna riga di logica di dominio è stata toccata: stesso IndexedDB, stesso
storage.js, stessi calcoli, stesse regole. Il `CHANGELOG.md` storico non viene modificato in
questo giro — confluirà (con dicitura propria) solo se la direzione viene approvata.

## v0.1-007 — Piccole rifiniture

- **Respiro tra liste e bottone "Nuovo X"**: i bottoni tipo "Nuovo Piano"/"Nuovo Conto"/"Genera
  Consuntivo" ecc. risultavano incollati all'ultima riga della lista sopra. Aggiunta una regola
  condivisa (`[id^="lista-"] + button` in `components.css`) invece di sistemare vista per vista:
  copre tutte le 7 viste con questo pattern (Conti, Fondi, Budget, Categorie, Piano, Consuntivi,
  Profili, Prospetti) con un'unica modifica.
- **Riepilogo Entrata più esplicativo**: ogni istruzione operativa ("Bonifica X € verso Conto Y")
  ora mostra anche il dettaglio di come quella cifra si suddivide tra Fondi/Budget/Obiettivi
  reali all'interno del Conto (es. "Bonifica 600 € verso Risparmio — di cui: Fondo Vacanze:
  400 €, Fondo Auto: 200 €"). Nuovo campo `dettaglio` su ogni istruzione, calcolato in
  `domain/allocazioni.js` (`generaIstruzioniOperative`), reso in `viewAllocazione.js`.
- **Scorciatoia "Vai ai Consuntivi"** dalla vista Ciclo Budget, quando non ci sono Cicli aperti
  (subito dopo una chiusura): apre direttamente "Strategia & Report" sulla tab Consuntivi.
  Aggiunta `impostaTabAttivaStrategiaReport()` in `sezioneStrategiaReport.js`, stesso pattern
  già usato da `impostaTabAttivaImpostazioni()`.
- **Bugfix — hover bianco su "Nuovo movimento" (sidebar desktop)**: la regola globale
  `button:hover` (più specifica di `.btn-nuovo-movimento` da sola: pseudo-classe + elemento
  batte una singola classe) sovrascriveva il background del bottone, lasciando il testo bianco
  su uno sfondo quasi bianco. Stesso bug, stesso fix, anche sul FAB mobile (`.fab-azioni`), mai
  segnalato ma identico nel codice.

## v0.1-006 — Bugfix: vista Consuntivi vuota dopo la generazione

**Bug**: generando un Consuntivo dalla vista Ciclo Budget, la creazione andava a buon fine (lo
storno dell'apertura veniva correttamente bloccato, segno che il record esisteva già in
IndexedDB), ma la vista Consuntivi non mostrava nulla.

**Causa radice**: in `js/ui/viewConsuntivi.js` l'import da `listaUtils.js` era rimasto al vecchio
`intestazioneOrdinabile`/`collegaOrdinamento` (sostituiti in v0.1-005, vedi sotto), mentre il
corpo della funzione era già stato aggiornato per chiamare `barraOrdinamentoHtml`/
`collegaBarraOrdinamento` — mai importate in questo file. Con zero Consuntivi il ramo "Nessun
Consuntivo trovato" evitava il problema; appena c'era almeno un Consuntivo, `renderTabella`
lanciava un `ReferenceError` non gestito (la vista viene invocata senza `await`/`catch` dal
router di `sezioneStrategiaReport.js`), quindi la lista restava vuota senza alcun errore
visibile. Nessuna altra vista è affetta: tutte le altre già importavano correttamente
`barraOrdinamentoHtml`/`collegaBarraOrdinamento`.

**Fix**: corretto solo l'import in `js/ui/viewConsuntivi.js`. Nessuna altra riga toccata.

## v0.1-005 — Tutto su misura: zero tabelle generiche rimaste in tutta l'app

Richiesta esplicita: finire il lavoro ovunque, non solo su Piano/Prospetti/Movimenti. Censite e
convertite **tutte** le tabelle generiche rimaste nell'intera app, vista per vista.

### Nuovi componenti condivisi

- **`barraOrdinamentoHtml` / `collegaBarraOrdinamento`** (in `js/utils/listaUtils.js`):
  sostituisce `intestazioneOrdinabile`/`collegaOrdinamento` (pensate per `<th>` cliccabili, che
  non esistono più) con un controllo esplicito "Ordina per" — stessa idea già introdotta ad hoc
  in Movimenti/Piano/Prospetti, ora estratta in un'unica utility condivisa e riusata ovunque.
- **`.riga-editabile` / `.lista-editabile`**: nome + importo modificabile + azione opzionale.
  Pattern condiviso da ogni form "dividi un importo tra più destinazioni" dell'app.

### Viste convertite in questo giro

- **Allocazione, Distribuzione, Ridistribuzione** (comprese le versioni annidate dentro
  Piano→Collega Movimenti e Prospetti→Ridistribuisci): righe di allocazione/divisione ora nel
  nuovo pattern `.riga-editabile`, non più tabelle.
- **Conti, Fondi (lista + Obiettivi annidati), Budget, Categorie**: elenchi a righe con barra di
  ordinamento condivisa, stesso trattamento già dato a Piano/Prospetti/Movimenti.
- **Dashboard**: la tabella "Budget per Conto" (residua da v0.1-002) → elenco di metriche.
- **Ciclo Budget** (la vista "Mese", probabilmente la più usata dopo Movimenti): ciclo corrente
  ed elenco storico → elenchi di metriche, form di chiusura come dettaglio espanso invece che
  riga di tabella con colspan.
- **Consuntivi**: lista + le 3 tabelle di dettaglio (Budget, Fondi, Obiettivi annidati) →
  elenchi di metriche, stessa struttura gerarchica di prima ma senza tabelle annidate a due
  livelli.
- **Diagnostica** (Impostazioni → Diagnostica): la tabella di verifica e la barra
  dell'equazione patrimoniale, prima due sezioni separate che ripetevano in parte la stessa
  informazione, ora **un'unica scheda per Conto** con entrambe le cose insieme — non solo
  convertito, anche semplificato.
- **Cloud Sync**: elenco Profili disponibili sul cloud → elenco a righe.
- **Profili**: lista Profili (con stato di rinomina inline) e anteprima import backup → elenchi
  a righe/editabili.

### Bug di processo trovato e corretto: verifica sintattica inaffidabile

Durante questo giro, `node --check file.js` in modalità file ha lasciato passare un errore di
sintassi reale (frammenti di markup rimasti orfani da una sostituzione imprecisa in
`viewConsuntivi.js`) senza segnalarlo — probabilmente per un'interazione tra l'auto-rilevamento
modulo/script di Node e l'assenza di un `package.json` con `"type":"module"` in questo progetto.
Individuato grazie a un controllo incrociato (`node --input-type=module --check`, che forza la
modalità corretta e ha isolato l'errore con precisione). Il bug è stato corretto e **tutte** le
verifiche sintattiche di questo giro (e un controllo retroattivo sulla v0.1-003 già consegnata,
risultata pulita) sono state rifatte con il metodo affidabile.

### Cosa resta come tabella vera (per scelta, non per tempo)

- Le 5 tabelle di **Confronto Prospetti** (una colonna per Prospetto): il confronto affiancato
  è lo scopo della sezione, non un difetto — restano tabelle vere con scroll orizzontale
  dedicato (v0.1-004).
- Il documento di **anteprima stampa/PDF** dei Prospetti: è un HTML autonomo, aperto in una
  finestra separata per la stampa — intenzionalmente fuori dal design system dell'app (stile
  da stampa, non da schermo).

## v0.1-004 — Piano e Prospetti: ripensati in profondità (non solo CSS)

Round dedicato esclusivamente a "finire" Piano e Prospetti come già fatto con Movimenti: dalle
tabelle generiche (per quanto corrette) a componenti pensati sul contenuto specifico.

### Analisi preliminare

Contrariamente a quanto temuto, **nessuna** delle tabelle "profonde" di Piano/Prospetti conteneva
dati genuinamente larghi (multi-mese, multi-colonna) tranne una sezione sola: il **Confronto tra
più Prospetti** (una colonna per ogni Prospetto selezionato — lì il confronto affiancato è
proprio lo scopo, non un difetto). Tutto il resto erano varianti dello stesso schema già
risolto altrove: "un'entità con nome + alcuni valori numerici da leggere insieme".

### Nuovi componenti condivisi

- **`.riga-metrica`** (nome + valori con etichetta, si dispongono a destra e vanno a capo su
  schermi stretti): usato per Conti a fine Prospetto, Andamento Budget (stima), proiezione
  Fondi e Obiettivi (incluso lo stato di modifica inline del punto di partenza).
- **`.albero-riepilogo`** (tre livelli con rientro crescente): sostituisce la tabella con
  padding-left crescente di "Entrata simulata e riepilogo" (Piano) con un vero elenco ad
  albero Conto → Fondo/Budget → Obiettivo.
- **`.scroll-orizzontale`**: l'unico caso rimasto genuinamente tabellare (Confronto Prospetti).
  Resta una tabella vera, con scorrimento orizzontale contenuto nel proprio riquadro (mai a
  livello di pagina) e la colonna del nome "congelata" mentre si scorre — pattern standard per
  confronti a più colonne, non un compromesso.

### Viste aggiornate

- **Piano**: Voci di un Piano → elenco a righe (stesso pattern di Movimenti/liste principali).
  "Entrata simulata e riepilogo" → albero invece di tabella indentata.
- **Prospetti**: "Non allocati dal Piano" → striscia di KPI (4 numeri singoli, non un
  confronto tra righe — non aveva senso come tabella). "Conti a fine Prospetto", "Andamento
  Budget (stima)", proiezione "Fondi" e "Obiettivi" → elenchi di metriche. "Movimenti manuali"
  (le 3 tab: Manuali, Trasferimenti, Ridistribuzioni) → elenco a righe, stesso pattern di
  Movimenti. "Confronto Prospetti" (5 tabelle: Conti/Fondi/Obiettivi/Budget/Salute Finanziaria)
  → tabelle vere con scorrimento orizzontale dedicato.
- **Salute Finanziaria a fine Prospetto**: nessuna modifica necessaria — usava già schede a
  griglia (`.scheda-indicatore`), non tabelle: era già a posto.

### Non ancora affrontato (deliberatamente, basso traffico)

Restano tabelle generiche (corrette, non bug, solo non "su misura") in tre form annidati di
secondo livello, tutti con lo stesso schema checkbox + nome + importo modificabile: "dividi la
quota di un Fondo tra i suoi Obiettivi" (raggiungibile da Piano → Collega Movimenti e da
Prospetti → Ridistribuisci). Sono form a bassa frequenza d'uso (si aprono solo dentro un flusso
già di per sé avanzato); li ho lasciati indietro deliberatamente per non allungare ulteriormente
questo giro — segnalali pure se restano un problema concreto nell'uso reale.

## v0.1-003 — Shell desktop, checkbox, Piano e Prospetti

### Shell desktop: perché la sidebar poteva mostrare una propria scrollbar verticale

Il modello precedente (sidebar `position:sticky` + scroll dell'intera pagina) è stato sostituito
con il pattern standard delle app "a due colonne" (Gmail, Slack, Notion...): la shell
(`.app-shell`) è ora alta **esattamente** quanto il viewport (`height:100vh; overflow:hidden`) e
non scorre mai lei stessa; sidebar e area di contenuto scorrono **ciascuna per conto proprio**,
in modo indipendente e prevedibile (`overflow-y:auto` su entrambe, non più `position:sticky`).
Il problema segnalato non poteva più ripresentarsi con questo modello, indipendentemente da
quanto sia alto il contenuto della pagina attiva. Il comportamento mobile (scroll di pagina
normale, topbar sticky + tabbar fissa) non cambia: la correzione riguarda solo la vista desktop.

### Checkbox "ancora bruttina"

Il segno di spunta era realizzato con un bordo ruotato (tecnica CSS comune ma imprecisa da
centrare con esattezza). Sostituito con una vera spunta SVG incorporata: nitida a qualunque
densità di schermo, centrata in modo affidabile — stessa dimensione e stesso posto, solo più
curata. Riguarda `.checkbox-riga` (Movimenti), `.checkbox-confronto` (Prospetti) e la nuova
`.checkbox-quadrata` (Movimenti, "Seleziona tutti"): un solo stile condiviso, come già in v0.1-002.

### Piano e Prospetti: liste principali riprogettate (non solo CSS)

Le correzioni di v0.1-002 (niente più due punti fantasma, niente più sforamento) restavano
valide ma non bastavano da sole a rendere le liste principali di Piano e Prospetti chiare quanto
Movimenti — erano ancora tabelle generiche trasformate, non pensate su misura. In questo giro:

- **Lista Piani** e **lista Prospetti**: stesso trattamento già dato a Movimenti — un contenitore
  raggruppato con riga compatta dedicata (titolo + badge di stato in testa, una riga di metadati,
  una riga di icone-azione), non più righe di tabella generica. L'ordinamento, come già in
  Movimenti, è ora un controllo esplicito "Ordina per" invece del click sull'intestazione.
- **Bug concreto trovato ed eliminato**: la riga di icone-azione di ogni Prospetto (6 icone:
  anteprima/proiezione/modifica/duplica/blocca/elimina) aveva `flex-wrap:nowrap` +
  `overflow-x:auto` forzati via stile inline — impedivano alle icone di andare a capo,
  costringendole silenziosamente a scorrere di lato senza alcuna indicazione visibile. È
  esattamente la causa del testo tagliato "Ricalcola Prosp..." visibile in uno degli screenshot.
  Lo stesso pattern (icone azione forzate su una riga sola) è stato trovato e corretto anche per
  gli Obiettivi dentro un Fondo espanso (contribuiva allo "sfondamento" segnalato in precedenza).
- Le sezioni **non** ancora riprogettate (Voci di un Piano, proiezione mese-per-mese di un
  Prospetto, "Entrata simulata e riepilogo") restano tabelle generiche — ereditano comunque tutte
  le correzioni di v0.1-002 e di questo giro (niente nowrap forzato, niente sforamento).

### Non ancora affrontato

Il dettaglio "profondo" di Prospetti (proiezione mese-per-mese, grafici, confronto multiplo) e le
Voci di un Piano restano nella forma tabellare generica: funzionanti e corrette, ma non ancora
"su misura" come Movimenti/liste principali. Candidato naturale per il prossimo giro, se dopo
questa correzione l'impressione generale è ancora che manchi qualcosa lì.

## v0.1-002 — Correzioni mobile dopo il primo riscontro

Il primo giro (v0.1-001) funzionava bene su desktop ma aveva diversi problemi reali su mobile,
segnalati con screenshot puntuali. Questo giro li corregge, senza toccare altro.

### Bug corretti (root cause, non sintomo)

- **I due punti "fantasma" (":") sparsi ovunque** (Conti, Fondi, Budget, Movimenti,
  Diagnostica...): la regola CSS che antepone l'etichetta di colonna al valore
  (`content: attr(data-label) ": "`) non escludeva le colonne con etichetta VUOTA (le colonne
  azioni, che hanno comunque `data-label=""` perché la relativa intestazione `<th>` è vuota).
  Su qualunque riga con più di un pulsante-azione, quella colonna cadeva nella regola
  "etichetta: valore" con etichetta vuota → appariva un ": " isolato. Bug singolo, condiviso da
  ogni tabella dell'app: la correzione (un `:not([data-label=""])` in più nel selettore) risolve
  ovunque in un colpo solo.
- **Contenuto che sfora il bordo destro dello schermo** (Dashboard, Fondi con molti Obiettivi,
  Prospetti, Piano): le celle di metadati (es. "Parte da: ...", date lunghe) avevano
  `flex-shrink:0`, quindi rifiutavano di restringersi o andare a capo — se il valore era più
  largo dello spazio disponibile, spingeva l'intera riga fuori dallo schermo invece di
  incapsulare il testo. Cambiato in `flex:1 1 auto` con `overflow-wrap:anywhere`: ora si
  restringono e vanno a capo internamente. Aggiunta anche una rete di sicurezza globale
  (`overflow-x:hidden` su `html/body` + `overflow-wrap:break-word` diffuso) contro qualunque
  overflow residuo non individuato puntualmente.
- **Tabella annidata dentro una riga già "a scheda"** (Dashboard → Budget per Conto espanso):
  una tabella dentro una tabella, entrambe trasformate per mobile, poteva comportarsi in modo
  imprevedibile. Sostituita con un semplice elenco a righe (nessuna tabella annidata): stesso
  risultato visivo, zero rischio di doppia trasformazione.

### Cambiamenti di design (dal riscontro esplicito)

- **Separazione tra elementi di un elenco, resa netta senza colore per categoria**: ogni elenco
  mobile (ex tabella trasformata) ora vive dentro un **contenitore unico con bordo e angoli
  arrotondati** (stile "elenco raggruppato", pattern iOS Impostazioni); le singole righe al suo
  interno sono separate solo da un hairline. È il *contenitore*, non il colore della riga, a
  segnare il confine con il resto della pagina — l'utente aveva già scartato in passato la
  colorazione per-riga (repository "Liquidità") come poco convincente; qui non viene reintrodotta.
  Applicato allo stesso identico modo a Conti, Fondi, Budget, Movimenti, Diagnostica, Piano,
  Prospetti, Salute Finanziaria — perché tutte condividono lo stesso meccanismo di base.
- **Form Obiettivo (dentro un Fondo espanso) ora in modale**: prima era inline, su sfondo grigio
  dentro una riga già grigia — poco leggibile, come segnalato ("brutta schermata grigia").
- **Selettore di confronto Prospetti**: non più un cerchio ("ovale"), ora un quadrato
  arrotondato — stesso stile del checkbox di selezione righe di Movimenti, coerenza in tutta
  l'app invece di due forme diverse per lo stesso concetto.
- **Registro Movimenti ripensato da zero** (non solo CSS, markup nuovo): da tabella generica
  (6-7 righe di testo per movimento, "etichetta: valore" ripetuto) a una riga compatta dedicata
  — icona colorata per tipo (Entrata/Uscita/Trasferimento/Rettifica), descrizione e importo in
  evidenza su una riga, data/conto/badge su una seconda riga più piccola. Stessa logica di
  sempre (Storno, Storno tutto, eliminazione diretta, allegati, selezione multipla, CSV): solo
  la disposizione a schermo è cambiata. L'ordinamento, prima al click sull'intestazione di
  colonna (che qui non esiste più), è ora un controllo esplicito "Ordina per" nella barra
  strumenti sopra l'elenco.

### Non ancora affrontato in questo giro (resta per il secondo giro, come da piano)

Piano e Prospetti restano viste **Tier 2**: ereditano tutte le correzioni sopra (niente più due
punti fantasma, niente più sforamento, stesso contenitore raggruppato), ma non hanno ancora
ricevuto un ripensamento del layout dedicato come Movimenti. In particolare "Entrata simulata e
riepilogo" dentro Piano resta un pannello inline espandibile (non una modale, come suggerito):
è un riepilogo che si ricalcola in tempo reale mentre si modificano le Voci del Piano nella
stessa pagina — trasformarlo in modale richiede una revisione più ampia di come Piano comunica
con quella sezione, rimandata per non introdurre rischio in questo giro correttivo.

## v0.1-001 — Primo giro: sistema di design + shell + Dashboard/Conti/Fondi/Budget in profondità

### Perché tutto questo file di changelog è così esplicito
Il ridisegno "da zero" richiesto tocca 20+ viste e ~8.700 righe di codice UI. Rifarle tutte a
mano, una per una, con lo stesso identico livello di cura sarebbe stato un lavoro enorme e ad
alto rischio di introdurre bug funzionali per fretta. La strategia seguita (concordata: "va bene
in 2 step") è stata invece:

1. **Un solo sistema di design condiviso**, in 4 file CSS nuovi (`css/tokens.css`,
   `css/base.css`, `css/layout.css`, `css/components.css`), che ridisegna ogni singola classe
   già usata da qualunque vista dell'app — verificato classe per classe, in modo automatico,
   contro l'intero codebase (nessuna vista "dimenticata": vedi sotto). Questo, da solo, cambia
   già l'aspetto delle 20+ viste, **senza toccarne il codice**.
2. Un secondo livello di intervento, più profondo, sulle viste a più alto traffico
   (**Tier 1**, sotto): qui sì, HTML e JS sono stati modificati, non solo il CSS.
3. Tutte le altre viste (**Tier 2**, sotto) ereditano il nuovo sistema visivo tramite il punto 1
   — stesso comportamento di prima, aspetto coerente col resto — ma non hanno ricevuto un
   ripensamento strutturale specifico. Sono il materiale del secondo giro.

### Decisioni di direzione (dalle risposte alle domande iniziali)

- **Un solo accento di marca**, non più due colori per categoria (verde Fondi / indaco Budget:
  "non ha mai avuto senso"). La separazione concettuale Patrimonio/Operatività richiesta dal FDD
  resta, ma si esprime con etichette, icone e struttura — non con due tinte diverse per la
  stessa interazione. I due nomi di variabile CSS storici (`--colore-patrimonio`,
  `--colore-operativita`) sono stati mantenuti per compatibilità (sono referenziati da stringa
  `var(--...)` dentro alcune viste Tier 2 non toccate — vedi dettaglio più sotto), ma il loro
  ruolo è cambiato: `--colore-operativita` è ora l'unico accento interattivo dell'app;
  `--colore-patrimonio` è diventato un colore semantico "positivo/crescita" (uso che, verificando
  il codice, esisteva già in alcuni punti per gli importi di segno positivo — coerenza
  ritrovata, non inventata).
- **Ispirazione**: Trade Republic / Revolut — minimale, superfici piatte separate per contrasto
  di sfondo invece che per ombra pesante, tipografia forte sui numeri, molto meno "spazio
  sprecato" in card che prima avevano bordo + ombra + padding generoso anche per informazioni
  minori (riscontro esplicito: "le card sono belle ma non sempre la scelta migliore").
- **Navigazione**: sidebar a sinistra su desktop, tabbar in basso + pulsante "+" flottante su
  mobile — le 4 sezioni principali (Dashboard, Conti, Movimenti, Strategia & Report) restano
  identiche nella struttura di prima (Fondi/Budget dentro Conti, Piano/Consuntivi/Prospetti/
  Salute Finanziaria dentro Strategia & Report): **nessuna vista è stata spostata**, solo
  ripresentata. Aggiunta una quinta voce mobile, "Altro" (Profilo/Impostazioni/Cloud Sync), per
  non affollare la tabbar.
- **Le Azioni rapide** (Registra Entrata/Uscita/Trasferimento/Rettifica, Distribuisci,
  Ridistribuisci) ora si aprono in una **modale** invece che come pagina a sé — raggiungibili da
  ovunque nell'app tramite il pulsante "+" (prima erano raggiungibili solo dalla Dashboard).
  "Mese (Ciclo Budget)" resta una pagina vera (troppo corposa per una modale).
- **Font**: rimosso IBM Plex Mono (era usato solo per i numeri); Space Grotesk copre ora sia i
  titoli sia le cifre — un font in meno da caricare, identità numerica più coerente.
- **Font Awesome via CDN confermato** (l'app gira comunque online, su GitHub Pages).
- **Dark mode**: solo l'impalcatura (variabili pronte in `css/tokens.css` sotto
  `[data-tema="scuro"]`), nessuna implementazione visiva in questo giro, come richiesto.
- **Nome, tagline e favicon (€ su sfondo sfumato) confermati invariati.**
- **La barra dell'Equazione Patrimoniale** (Conto = Fondi + Liquidità): confermata come elemento
  di valore reale (è l'unica rappresentazione visiva dell'invariante centrale del FDD), ma prima
  viveva solo dentro Impostazioni → Diagnostica, un posto che quasi nessuno apre di routine.
  In questo giro le è stata data anche una **versione aggregata in Dashboard** (sintesi
  sull'intero portafoglio), lasciando il dettaglio Conto-per-Conto dov'era, in Diagnostica.

### Tier 1 — ridisegnate in profondità (HTML/JS toccati, oltre al CSS)

- **Shell dell'app** (`index.html`, `js/app.js`): sidebar desktop / topbar+tabbar mobile, menu
  "Nuovo movimento" (`js/components/menuAzioniRapide.js`), menu mobile "Altro"
  (`js/components/menuMobile.js`), componente generico per montare una vista in modale
  (`js/components/modaleVista.js` — riusa le viste esistenti così come sono, non ne duplica la
  logica), indicatore Cloud Sync riadattato ai due nuovi punti di montaggio
  (`js/components/syncIndicator.js`, stessa fonte di stato di prima).
- **Dashboard** (`js/ui/dashboard.js`): hero Patrimonio con equazione aggregata, KPI ridotti alle
  informazioni non già mostrate nell'hero, striscia orizzontale compatta di Azioni rapide al
  posto della griglia precedente (che occupava molto più spazio verticale), tabella Budget per
  Conto invariata nella logica.
- **Conti** (`js/ui/viewConti.js`): stessa logica, form di Nuovo/Modifica Conto ora in modale.
- **Fondi** (`js/ui/viewFondi.js`): stessa logica, form di Nuovo/Modifica Fondo ora in modale.
  Il form Obiettivo (annidato dentro la riga espansa di un Fondo), "Chiudi anno" e "Duplica
  Fondo" **restano inline** in questo giro (sono form contestuali a una riga già aperta:
  modalizzarli è previsto per il secondo giro, non era la priorità).
- **Budget** (`js/ui/viewBudget.js`): stessa logica, form di Nuovo/Modifica Budget ora in modale.

### Tier 2 — invariate nella struttura, aggiornate solo dal sistema di design condiviso

Tutte le altre viste (Movimenti, Ciclo Budget, Piano, Consuntivi, Prospetti, Salute Finanziaria,
Categorie, Backup, Cloud Sync, Profili, Impostazioni e tutte le sue tab, Diagnostica): **nessuna
riga di JS toccata**, tranne 1 riga cosmetica per vista in 2 file (`viewCicloBudget.js`) per
togliere la vecchia decorazione a bordo colorato per categoria, ormai priva di senso — vedi sopra.
Ereditano comunque l'intero nuovo sistema visivo (colori, tipografia, spaziatura, tabelle,
form, badge, modali di conferma, grafici SVG — che leggono i colori da variabile CSS, quindi si
sono aggiornati "gratis" insieme alla palette) perché usano le stesse classi CSS condivise di
sempre. Su schermi piccoli, le tabelle di **tutte** queste viste passano automaticamente dal
vecchio pattern "scheda con bordo/ombra/fascia colorata piena" a un pattern più leggero — righe
d'elenco compatte, un solo livello di enfasi tipografica — perché quella trasformazione avviene
in un unico punto condiviso (`css/components.css`, blocco mobile) che tutte le tabelle
dell'app usano.

**Candidate per il secondo giro** (nessuna urgente, solo dove un intervento mirato darebbe più
valore): Prospetti (2.342 righe — la vista più corposa, già chiesta esplicitamente più leggibile:
i grafici a linee esistenti ereditano la nuova palette, ma non sono stati ripensati come
visualizzazione); Movimenti (il pattern "riga di gruppo espandibile" per le Entrate potrebbe
beneficiare di un trattamento dedicato); modalizzare anche i form di Obiettivo/Categoria/Piano.

### Verifiche eseguite prima della consegna
- `node --check` su ogni file `.js` del progetto (nessun errore).
- Inventario automatico di **tutte** le classi CSS usate in **tutte** le viste (comprese quelle
  non toccate) confrontato contro le classi definite nel nuovo CSS: nessuna classe orfana.
- Stesso controllo per le variabili CSS (`var(--...)`): ogni variabile usata, in CSS o in
  stringa dentro il JS, è definita in `css/tokens.css`.
- Verifica diretta del contenuto dello zip consegnato (non solo dei file di lavoro).
