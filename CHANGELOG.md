# Changelog — FinSteady

## v0.35-001 — Checkbox e tag/lucchetto in angolo, padding uniforme

### Modificato
- **Checkbox di selezione "fuori contesto" sopra la scheda** (segnalato con screenshot,
  Prospetti da confrontare): si sposta in alto a SINISTRA della scheda invece di occupare una
  riga a sé stante sopra la fascia colorata. Stesso trattamento generico già usato per le
  singole icone-azione (in alto a destra) — vale automaticamente per ogni checkbox di selezione
  dell'app (Movimenti, Prospetti, Dividi/Ridistribuisci Obiettivi...), nessuna vista toccata a
  parte l'aggiustamento dei margini della fascia colorata.
- **Tag "Attivo"/"Inattivo"/"Scollegato" (Budget) e "Bloccato" (Piano, Prospetti) spostati in
  angolo, in alto a DESTRA della scheda** invece di stare appesi al nome: `js/ui/viewBudget.js`,
  `viewPiano.js`, `viewProspetti.js` ora li mettono in una colonna propria (intestazione vuota),
  posizionata dalla stessa regola CSS generica delle icone singole — quando manca (es. un Piano
  non bloccato) la colonna resta vuota, senza occupare spazio.
- **Padding dei tag uniformato**: "Inattivo" e "Scollegato" avevano `2px 8px` mentre "Attivo"
  (`badge-ok`) usava il padding di base (6px 12px) — rimossi gli override inline non necessari
  in tutto il progetto (Budget, Dashboard, Movimenti), ora tutti i tag hanno lo stesso padding.

## v0.34-001 — Correzioni di contrasto sulla fascia colorata, Categorie come tabella semplice

### Modificato
- **Etichetta "CONTO"/"NOME"/... illeggibile sulla fascia viola**: il colore bianco previsto
  per l'etichetta non vinceva sul grigio scuro di default a causa di una regola CSS con
  specificità più alta (un `:not()` involontariamente "pesava" più del previsto) — bug puramente
  di specificità CSS, non concettuale. Corretto rendendo la regola dell'etichetta bianca
  sicuramente vincente.
- **Il colore non copriva l'area del pulsante (chevron) in alto a destra**, lasciando un
  angolo bianco scoperto proprio lì (segnalato con screenshot): la fascia calcolava lo spazio da
  coprire in base al padding normale della scheda, non a quello (maggiorato) riservato per il
  pulsante singolo in quell'angolo. Ora la fascia si estende fin sotto al pulsante.
- **Tag/badge dallo sfondo grigio chiaro (Inattivo, Stornato, Archiviato...) invisibili sulla
  fascia colorata**: non avevano un colore di testo proprio, ereditavano quello del contesto —
  bianco su sfondo quasi bianco. Ora hanno sempre un colore di testo esplicito.
- **Categorie (Impostazioni) torna a essere una tabella semplice**, non più schede: sono voci di
  un elenco a discesa, non serviva il trattamento riservato a tabelle con informazioni più
  ricche. Nuova classe opzionale `tabella-compatta` (`css/style.css`, `js/ui/viewCategorie.js`):
  qualunque vista può aggiungerla a una `.tabella` per restare una tabella vera anche su mobile,
  solo più compatta (padding ridotto, niente etichette ripetute sopra ogni valore).

## v0.33-001 — Terzo giro di rifiniture mobile (schede annidate, colore, Categorie)

### Modificato
- **La fascia colorata sul nome ora appare solo sul "contenitore" esterno**, non sulle righe
  annidate all'interno (es. "Budget assegnato per Conto": colore solo su Conto, non più anche
  su ogni singolo Budget nel dettaglio espanso) — `js/utils/tabelleMobiliUtils.js` riconosce
  quando una tabella è annidata dentro la cella di dettaglio di un'altra ed evita di applicare
  la fascia lì.
- **Colore della fascia più deciso**: da tinta lilla tenue a colore pieno (`--colore-operativita`,
  lo stesso viola/indaco usato per i pulsanti primari nel resto dell'app — coerente col
  progetto), testo bianco.
- **Bordo e ombra della scheda leggermente più marcati**: bordo da `--colore-bordo` a
  `--colore-bordo-forte`, aggiunta `--ombra` (lo stesso valore di ombra già usato per i pannelli
  in tutta l'app, non un valore nuovo).
- **Categorie: colonne a piena larghezza su mobile invece di card strette e altissime.**
  `.colonne-categorie` (due colonne affiancate su desktop, Categorie Obiettivo/Categorie
  Budget) non aveva una regola di larghezza esplicita per le colonne: su schermi piccoli
  restavano strette quanto il loro contenuto minimo, causando testo spezzato in continuazione e
  schede altissime. Ora occupano tutta la larghezza disponibile, una sotto l'altra.
- **Pulsante "Modifica" di una Categoria, che sembrava non fare nulla su mobile**: il form di
  modifica si apre sempre in fondo al pannello, dopo entrambe le colonne — con un elenco lungo
  (ancora più lungo ora che le colonne sono a piena larghezza) restava fuori dallo schermo senza
  che l'utente se ne accorgesse. Ora la vista scorre automaticamente fino al form appena si apre.

## v0.32-001 — Fascia colorata sul nome di ogni scheda mobile

### Modificato
- **Dimensioni scheda riportate a prima di v0.31** (bordo, angoli, padding, margine tra schede,
  ombra): l'aumento non era la cosa giusta, serviva uno stacco di colore, non di dimensione.
- **La prima cella di ogni riga (Nome/Conto/Descrizione) ora è una fascia colorata** in cima
  alla scheda (tinta lilla `--colore-operativita-soft`, la stessa usata per Budget/Operatività
  nel resto dell'app), non solo testo in grassetto: uno stacco netto, riconoscibile anche solo
  scorrendo la lista velocemente, per capire subito dove finisce una scheda e comincia la
  successiva.

## v0.31-001 — Rebranding FinSteady, rifinitura schede mobile

### Modificato
- **Rinominata l'app in FinSteady** ovunque sia visibile: titolo scheda browser (`<title>`),
  intestazione/Dashboard (`<h1>`), messaggi di errore import backup, nome dei file di backup
  scaricati (`finsteady-backup-...json`, `finsteady-profilo-...json`,
  `finsteady-tutti-i-profili-...json`), commenti di intestazione nei file sorgente,
  changelog. **Non toccati deliberatamente** (identificatori tecnici di storage — cambiarli
  farebbe perdere l'accesso ai dati già salvati di chi usa l'app): il nome del database
  IndexedDB (`financial-planner-db`), il registro dei Profili
  (`financial-planner-profili-registro`) e il prefisso dei nomi database dei Profili creati
  (`financial-planner-db-{id}`). Nota lasciata in `js/db-schema.js` a beneficio di sviluppi
  futuri. Convenzione di versionamento zip invariata (`repository-financial-planner-vX.Y-NNN`,
  come da prassi consolidata).
- **Schede mobile più distinte tra loro**: bordo più marcato, ombra, margine tra una scheda e
  la successiva aumentato (8px → 12px) — con molte righe in fila, prima si confondevano.
- **Nome/valore identificativo di ogni riga in evidenza**: la prima cella con etichetta di ogni
  riga (quasi sempre Nome/Conto/Descrizione, individuata automaticamente da
  `js/utils/tabelleMobiliUtils.js`) ora è in grassetto e leggermente più grande.
- **Celle con un solo pulsante-icona spostate in un angolo** invece di occupare un'intera riga
  della scheda per sé sole (es. il chevron "Dettaglio" di "Budget assegnato per Conto",
  segnalato con screenshot; "Rimuovi riga" in Distribuisci/Registra Entrata; "Elimina" voce di
  Piano) — più spazio usato meglio. Non si applica a celle con più pulsanti (es. le azioni di
  Fondi/Movimenti) né a pulsanti con testo (es. "Scarica come nuovo Profilo" in Cloud Sync):
  quelli restano nel flusso normale, ne hanno bisogno.

## v0.30-001 — Correzioni mobile dopo secondo riscontro utente (tabelle a schede, overflow residui)

### Modificato
Solo CSS/markup + un nuovo modulo di utilità, nessuna modifica funzionale.

- **Tabelle: da scorrimento orizzontale a schede impilate.** Il riscontro dell'utente ("le
  tabelle risultano troppo larghe per mobile e difficilmente utilizzabili") ha superato
  l'approccio di v0.28/v0.29 (tabella scorrevole in orizzontale): ora, sotto i 720px, ogni riga
  di **qualunque** tabella dell'app diventa una scheda verticale, ogni cella mostra la propria
  etichetta di colonna sopra il valore. Nessuno scorrimento laterale residuo su nessuna tabella.
  Implementato con un nuovo modulo, `js/utils/tabelleMobiliUtils.js` — un `MutationObserver`
  agganciato una sola volta in `app.js` che assegna automaticamente `data-label` ad ogni cella
  leggendo l'intestazione di colonna corrispondente, per qualunque tabella (`.tabella`/
  `.tabella-integrita`) presente ora o generata in seguito da qualsiasi vista, presente o
  futura: **nessuna delle ~35 viste che generano tabelle è stata toccata**. Le righe di
  dettaglio/espansione (`<td colspan>`, es. Obiettivi di un Fondo) si agganciano visivamente
  alla scheda della riga principale invece di comparire come schede scollegate a sé stanti.
- **Dropdown "Altre azioni" (Dashboard) usciva dallo schermo a sinistra** (segnalato con
  screenshot): era ancorato a destra del pulsante che lo apre con `position:absolute; right:0`,
  e su schermi stretti la sua larghezza minima (230px) lo faceva sconfinare oltre il bordo
  sinistro. Ora, sotto i 720px, diventa un pannello a piena larghezza in flusso normale subito
  sotto il pulsante: nessun rischio di uscire dai bordi indipendentemente dalla posizione del
  pulsante.
- **Righe di pulsanti che sforavano lo schermo** (`.form-azioni` — es. "2. Strategia di
  Allocazione" in Registra Entrata, 4 pulsanti su una riga senza andare a capo): mancava
  `flex-wrap: wrap` nella regola base. Corretto globalmente (non solo mobile): su desktop,
  dove lo spazio è sufficiente, non cambia nulla, i pulsanti restavano già su una riga.
- **"Budget assegnato per Conto" (Dashboard) leggermente fuori dai margini**: stessa causa
  radice delle tabelle sopra (colonna azione compressa in poco spazio) — risolta dallo stesso
  fix generale, nessuna modifica specifica necessaria.

## v0.29-001 — Correzioni mobile dopo riscontro utente (nav, tabelle, densità)

### Modificato
Solo CSS/markup, nessuna modifica funzionale. Continua il lavoro di v0.28, corretto alla luce
dell'uso reale su telefono.

- **Navigazione → menu ad hamburger** (`index.html`, `js/app.js`, `css/style.css`). La nav a
  capo introdotta in v0.28 restava comunque sempre fissa in cima, occupando spazio permanente.
  Ora, sotto i 720px, resta chiusa di default (zero spazio occupato) e si apre solo al tocco
  dell'icona hamburger nell'intestazione; si richiude da sola ad ogni navigazione
  (`chiudiMenuMobile()` in `app.js`, chiamata da `mostraVista()` — nessun effetto su desktop,
  la classe `nav-aperta` non è usata sopra i 720px).
- **Tabelle: causa reale della "condensazione" e delle righe altissime individuata e corretta.**
  Il fix v0.28 rendeva la tabella scorrevole in teoria, ma senza `white-space:nowrap` sulle
  celle il layout automatico delle tabelle preferisce SEMPRE andare a capo pur di stare nella
  larghezza disponibile, invece di scorrere: risultato, colonne strette con testo spezzato su
  più righe e i 5-6 pulsanti azione impilati su 2-3 righe — da qui le righe altissime segnalate
  in Conti → Fondi e la sensazione di tabella "condensata" in Movimenti. Ora le celle non vanno
  più a capo (eccezione per la colonna Descrizione di Movimenti, testo libero potenzialmente
  lungo — nuova classe `colonna-descrizione`) e la tabella scorre davvero in orizzontale.
- **Testo leggermente più piccolo in tutto il sito**: un solo cambio alla dimensione font della
  radice sotto i 720px (`html { font-size: 93.75% }`, 16px → 15px) — si riscalano
  proporzionalmente tutte le dimensioni tipografiche rem-based dell'app; gli spazi/margini,
  definiti in px fissi, non cambiano.
- **Celle di tabella più compatte in verticale**: padding ridotto da `10px 8px` a `7px 10px`
  (righe più basse, un filo più di respiro orizzontale per compensare la perdita del testo a
  capo).

## v0.28-001 — Ottimizzazione responsive per schermi piccoli (mobile)

### Modificato
Nessuna modifica funzionale: solo CSS (più due correzioni minime a righe flex in
`viewProspetti.js`/`viewRidistribuzione.js`), racchiuso in un unico blocco `@media (max-width:
720px)` in fondo a `css/style.css` — la visualizzazione desktop non cambia in alcun modo sopra
questa soglia.

- **Barra di tab secondaria senza overflow/wrap** (`.barra-tab` — es. le 7 tab di Impostazioni,
  o Fondi/Budget dentro Conti): su un telefono le pillole restavano tutte su una riga,
  allargando l'intera pagina e causando scroll orizzontale su tutta l'app. Ora va a capo.
- **Icone Profilo/Impostazioni/Cloud Sync raggiungibili "alla cieca"**: erano ancorate a destra
  (`margin-left:auto`) dentro una nav a scroll orizzontale — se le voci di nav non ci stavano,
  finivano fuori schermo. Ora la nav va a capo invece di scorrere, tutto resta visibile.
- **Zoom automatico di Safari iOS sui campi di testo**: nessun input/select/textarea garantiva
  un font-size minimo di 16px (alcuni erano a 0.9-0.95rem, molti senza alcuna regola,
  ereditando il default del browser ~13px) — sotto quella soglia iOS ingrandisce la pagina ad
  ogni tap su un campo. Forzato 16px per tutti i campi, solo sotto i 720px.
- **Tabelle senza scroll orizzontale**: con più colonne (e i campi numerici da 100-110px usati
  in alcune di esse, es. Distribuisci/Ridistribuisci/Prospetti) allargavano l'intera pagina
  invece di restare contenute. Ora `.tabella`/`.tabella-integrita` scorrono in orizzontale
  quando necessario, restando leggibili alla loro larghezza naturale.
- **Padding orizzontali pensati per desktop**: fino a 36+24px cumulati tra intestazione, nav e
  pannelli lasciavano pochissima larghezza utile su un telefono da 360-390px. Ridotti sotto i
  720px.
- **Bottoni icona sotto la soglia minima di tocco comoda** (~44px, linee guida iOS/Android):
  `.nav-btn-impostazioni`, `.btn-icona`, `.btn-stella-azione` erano 32-38px. Ingranditi sotto i
  720px.
- **Due righe flex con etichetta a larghezza fissa** (`min-width:160px`, Fondo/Obiettivo +
  campo importo, in Ridistribuisci Liquidità e Prospetti → Ridistribuzione) potevano non
  entrare in uno schermo stretto insieme al campo numerico accanto: aggiunto `flex-wrap:wrap`
  (nessun effetto quando c'è spazio sufficiente, quindi anche qui nessun cambiamento visibile
  su desktop).
- Piccola clausola di sicurezza sul menu "Altre azioni" (Dashboard) e un po' meno padding nei
  dialoghi modali, per i telefoni più piccoli (~320-360px).

## v0.27-001 — FinSteady Cloud Sync

### Aggiunto
- **Cloud Sync**, tramite Supabase, con la stessa architettura (login email/password, outbox
  locale, push/pull automatici in background, risoluzione conflitti last-write-wins su
  `updatedAt`) già in uso in altre app della suite (es. preventivi3d), adattata al fatto che
  FinSteady lavora per Profili (database IndexedDB fisicamente separati):
  - Il collegamento al cloud è **per Profilo**, deciso una volta sola per il Profilo attivo
    (`Carica questo Profilo sul cloud` la prima volta, oppure `Scarica un Profilo già presente
    sul cloud`); da quel momento sincronizza da solo in background finché quel Profilo resta
    attivo. Nessuna azione manuale richiesta a regime.
  - Nuova tab **Cloud Sync** in Impostazioni: login/registrazione, stato del collegamento del
    Profilo attivo, elenco dei Profili già presenti sul cloud non ancora scaricati su questo
    dispositivo (con opzione "Scarica come nuovo Profilo").
  - Nuova icona dedicata in nav (separata da Profilo/Impostazioni) con lo stato del Cloud Sync
    (offline / non collegato / da collegare / in sincronizzazione / sincronizzato / errore) e un
    contatore delle modifiche non ancora inviate.
  - Nuovi moduli: `js/data/config.js`, `cloud.js`, `auth.js`, `syncProfilo.js` (motore di sync
    del Profilo attivo, via `storage.js`) e `js/domain/cloudProfili.js` (scarica un Profilo
    cloud come Profilo locale NUOVO — seconda eccezione documentata, insieme a
    `backupProfili.js`, alla regola "solo storage.js accede a IndexedDB", per lo stesso motivo:
    storage.js è agganciato a un solo database per sessione).
  - Schema Supabase dedicato (`supabase/schema.sql` — schema `finsteady`, RLS per utente): due
    sole tabelle generiche (`profili_cloud`, `record_sync` con `dati` in JSONB) invece di una
    tabella tipizzata per store, per non dover far evolvere lo schema SQL ad ogni aggiunta di
    store/campo in `db-schema.js`.

### Modificato
- **Soft delete centralizzato in `storage.js`**: `dbDelete` non cancella più fisicamente un
  record ma lo marca con `deletedAt` (tombstone); `dbGet`/`dbGetAll`/`dbGetAllByIndex` lo
  filtrano automaticamente, quindi il comportamento visto da ogni modulo di dominio resta
  identico a prima. Necessario per propagare le cancellazioni tra dispositivi via Cloud Sync.
  `domain/backupProfili.js` (che apre connessioni IndexedDB dirette, bypassando storage.js) è
  stato aggiornato per filtrare gli stessi tombstone.
- **Sezione "Backup" spostata dalla Dashboard a Impostazioni**, come tab dedicata separata dalla
  nuova tab "Cloud Sync" (due meccanismi distinti: uno manuale su file, uno automatico in
  background). Nessuna logica di export/import cambiata, solo la collocazione (nuovo file
  `js/ui/viewBackup.js`).

### Note architetturali
- Migrazione additiva dello schema IndexedDB (v8 → v9): due nuovi store TECNICI, `_outbox` e
  `_syncMeta` — stato del solo dispositivo/Profilo locale, mai esportati/importati come dati
  applicativi, non fanno parte del FDD.
- Ogni Profilo resta isolato anche sul cloud: ogni riga di `record_sync` porta un
  `profiloCloudId` e ogni pull filtra sempre per quel valore — nessuna possibilità che dati di
  un Profilo si mescolino con quelli di un altro, nemmeno sullo stesso account cloud.

## v0.26-001 — Backup multi-Profilo (export/import di uno o tutti i Profili)

### Aggiunto
- Nuovo modulo `domain/backupProfili.js`: export/import che, a differenza del Backup esistente
  in Dashboard (che lavora solo sul Profilo attivo tramite `storage.js`), può leggere e scrivere
  anche i database di Profili non attivi, senza cambiare Profilo attivo né ricaricare la pagina
  a metà operazione — tramite connessioni IndexedDB dirette aperte per nome database e richiuse
  subito dopo (unica eccezione consapevole e documentata alla regola "solo storage.js accede a
  IndexedDB", necessaria perché qui il database di destinazione è quello di un Profilo
  arbitrario, non quello corrente).
- **Esporta Profilo attivo**: come il Backup esistente, ma incapsulato nel nuovo formato con
  `profiloId`/`nome`, per un import futuro consapevole del Profilo di provenienza.
- **Esporta tutti i Profili**: un unico file con tutti i Profili registrati (backup
  totale/migrazione dispositivo).
- **Import con anteprima esplicita**: prima di scrivere qualunque dato, mostra per ciascun
  Profilo del file un confronto con l'eventuale Profilo locale corrispondente (nome, data di
  creazione, numero di record) e lascia scegliere: sostituire il Profilo locale, importarlo come
  Profilo nuovo (id e database rigenerati, nessuna collisione), o saltarlo. Nessuna
  sovrascrittura senza conferma esplicita, coerente col principio "nessun automatismo silenzioso".
- **Retro-compatibilità**: i file esportati dal Backup precedente (senza involucro `profili`)
  restano importabili — trattati come un unico Profilo del formato precedente, confrontato di
  default col Profilo attivo.
- Nuova sezione "Backup Profili" nella vista Profili (`viewProfili.js`), separata dal Backup
  esistente in Dashboard (lasciato invariato, continua a coprire il solo Profilo attivo).

### Note architetturali
- Nessuna modifica allo schema IndexedDB: nessun nuovo store, nessun nuovo campo. Il file di
  export applica lo stesso identico set di store (`STORE_DEFINITIONS`) sia per il Profilo attivo
  sia per i Profili non attivi.

## v0.25-002 — Avatar Profilo a iniziale (rimossa immagine caricata)

### Modificato
- **Rimossa la possibilità di caricare un'immagine per il Profilo** (`impostaImmagineProfilo`,
  campo `immagine` nel registro Profili, upload/rimozione in `viewProfili.js`): sostituita da un
  **avatar a iniziale**, calcolato automaticamente (nuovo modulo `utils/avatarUtils.js`) —
  cerchio con la prima lettera del nome del Profilo, colore derivato in modo deterministico dal
  nome stesso (stesso nome → sempre stesso colore). Nessun dato salvato, nessun peso nei file di
  export/import multi-profilo (in arrivo).
- Aggiornati sia la riga Profilo in `viewProfili.js` sia l'icona Profilo nella barra di
  navigazione (`app.js`) per usare il nuovo avatar.

### Rimosso
- Regola CSS `.nav-btn-profilo-immagine`, non più utilizzata.

## v0.25-001 — Storno apertura Ciclo Budget

### Aggiunto
- **Storno apertura Ciclo**: nuova azione `stornaAperturaCiclo` (`domain/budgetCicli.js`) per
  correggere un periodo aperto per errore/prova (es. aperto e chiuso solo per una prova),
  eliminandolo completamente dallo storico come se non fosse mai esistito — diversa dalla
  Riapertura già esistente (che riporta un Ciclo chiuso allo stato "aperto", restando comunque
  un Ciclo da richiudere). Se il periodo era già chiuso, lo riapre prima automaticamente
  (stornando l'eventuale Trasferimento generato in chiusura tramite il meccanismo di Storno già
  esistente — mai cancellato in silenzio, resta tracciato nel Registro Movimenti); poi elimina
  fisicamente i record `budgetCicli` di quel periodo.
- Consentita solo sull'ultimo periodo della catena (cascata a ritroso, un periodo alla volta):
  garantita per costruzione dagli stessi vincoli già esistenti su apertura/riapertura, nessun
  controllo aggiuntivo necessario. Per annullare più periodi in fila, l'azione va ripetuta una
  volta per periodo, a partire dal più recente.
- Bloccata se per il periodo esiste già un Consuntivo (fotografia congelata, mai modificabile):
  messaggio esplicito invece di lasciare lo storico incoerente.
- Nuovo pulsante "Storna apertura" sia nella sezione Ciclo Corrente (periodo ancora aperto) sia
  nello Storico Cicli (periodo già chiuso, ancora riapribile), con conferma esplicita
  (`mostraConferma`, variante pericolosa) che riepiloga cosa verrà annullato prima di procedere.

### Note architetturali
- Nessuna modifica allo schema IndexedDB: nessun nuovo store, nessun nuovo campo. Riusa
  interamente il meccanismo di Storno già esistente per i Trasferimenti di chiusura ciclo.

## v0.24-002 — Rinomina Piano, sezione simulazione espandibile, protezione eliminazione Piano

### Aggiunto
- **Rinomina Piano**: nuovo pulsante "Rinomina" (icona penna) nella riga di ogni Piano, tramite
  `mostraPrompt` (nessun `prompt()` nativo) — disabilitato se il Piano è bloccato.
- **"Entrata simulata e riepilogo" ora è una sezione espandibile**, di default compressa (solo
  titolo e chevron), coerente con le sezioni analoghe già introdotte nel Prospetto.

### Modificato
- **Eliminazione di un Piano bloccato ora impossibile**: sia lato interfaccia (pulsante
  "Elimina" disabilitato quando il Piano è bloccato) sia lato dominio (`eliminaPiano` blocca
  esplicitamente con un errore, indipendentemente da come viene invocata).
- **Avviso (non blocco) prima di eliminare un Piano in uso**: se il Piano è quello predefinito
  (attivo) o è collegato a uno o più Prospetti, la conferma di eliminazione elenca esplicitamente
  dove viene usato prima di procedere — l'eliminazione resta comunque possibile se confermata
  (i Prospetti collegati restano, perdendo solo il riferimento al Piano eliminato).

## v0.23-001 — Miglioramenti UX/UI: terminologia, Diagnostica, Ciclo Budget nelle Azioni, filtro periodo Movimenti, dialoghi coerenti col design system

Modifiche di UX/UI e di linguaggio, come da analisi condivisa col product owner. Nessuna
modifica al modello di dominio, ai nomi degli store IndexedDB, né alla logica di calcolo in
`js/domain/*`/`js/engine/*` (salvo dove esplicitamente indicato).

### Modificato
- **Terminologia**: eliminato ovunque il sinonimo informale "Scenario" a favore di "Piano" —
  in tutte le stringhe rivolte all'utente (`viewPiano.js`, `viewAllocazione.js`,
  `viewDistribuzione.js`, `viewImpostazioniAllocazione.js`, `viewProspetti.js`,
  `domain/prospetti.js`) e nei commenti tecnici residui, per coerenza.
- **Verifica di Integrità Patrimoniale spostata da Dashboard a Impostazioni → Diagnostica**: in
  Dashboard resta solo un badge compatto (✓ Tutto regolare / ⚠ N problemi rilevati, cliccabile),
  il dettaglio completo (tabella, equazione patrimoniale, elenco problemi, "Ripara
  automaticamente") vive ora in una nuova tab "Diagnostica" in Impostazioni. Il calcolo è
  condiviso tra le due viste tramite la nuova funzione esportata `calcolaStatoIntegrita()` in
  `dashboard.js`, per non interrogare due volte IndexedDB. Nessuna modifica a
  `engine/integrityCheck.js` o `domain/riparazione.js`.
- **Rimosso il linguaggio di sviluppo dalla UI**: eliminato il sottotitolo "Fase 4 — Prospetti"
  dall'header e la nota "Fase attuale" (ormai obsoleta) dalla Dashboard.
- **Registro Movimenti**: aggiunto un filtro temporale di default (Ultimi 30/90 giorni, Questo
  mese, Tutto lo storico), applicato prima del filtro testuale esistente. Le righe figlie di
  un'Entrata seguono sempre il filtro della riga di gruppo (mai filtrate indipendentemente).
  Il default all'apertura è "Ultimi 30 giorni", con un link "Vedi tutto lo storico" sempre
  visibile quando il filtro è attivo. L'esportazione CSV resta invariata (esporta sempre
  l'intero storico, indipendentemente dal filtro a schermo): l'etichetta del pulsante è stata
  resa esplicita per chiarezza ("Esporta CSV (tutto lo storico, non risente del filtro periodo
  qui sopra)").

### Aggiunto
- **"Ciclo Budget (Mese)" tra le Azioni della Dashboard**: nuova voce non primaria nell'array
  `AZIONI`, raggiungibile da "Altre azioni" (o promuovibile in evidenza con lo stesso
  meccanismo già esistente in `impostazioniDashboard.js`, verificato generico per qualunque id).
  Nessuna modifica necessaria a `viewCicloBudget.js`: la vista non dipende da alcun contesto
  implicito (budget/ciclo preselezionato) e già mostra tutti i Cicli aperti/storico a
  prescindere dal punto di ingresso.
- **Modulo condiviso `js/utils/dialogUtils.js`**: `mostraConferma()` e `mostraPrompt()`
  (Promise-based) in sostituzione di `confirm()`/`prompt()` nativi, con overlay coerente col
  design system esistente (variabili CSS `--colore-avviso`, `--raggio`, `--ombra`), pulsante di
  conferma con testo esplicito sull'azione anziché un generico "OK", e variante "pericoloso"
  per le azioni distruttive. Aggiunta anche la convenzione di validazione inline
  (`segnalaCampoInvalido`/`ripulisciCampoInvalido`, classi `.campo-invalido`/`.errore-campo`)
  per i form, non ancora applicata ai call site esistenti (fase successiva).
- Migrate a `mostraConferma`/`mostraPrompt` tutte le conferme di azioni distruttive/irreversibili
  individuate come priorità alta: eliminazione Piano e nuovo nome Piano (`viewPiano.js`),
  import backup (`dashboard.js`), riparazione orfani (`viewImpostazioniDiagnostica.js`),
  eliminazione Conto/Fondo/Obiettivo/Categoria/Budget (`viewConti.js`, `viewFondi.js`,
  `viewCategorie.js`, `viewBudget.js`), eliminazione diretta di movimenti singoli/selezionati/
  "Pulisci tutto il Registro" (`viewMovimenti.js`), eliminazione Consuntivo
  (`viewConsuntivi.js`), cambio ed eliminazione Profilo (`viewProfili.js`).
  **Non ancora migrati** (priorità più bassa, rimandati a una sessione successiva): gli Storni
  (azione già reversibile per natura) e l'eliminazione di un allegato in `viewMovimenti.js`,
  la riapertura Ciclo in `viewCicloBudget.js`, il collegamento movimenti in `viewPiano.js`, e i
  residui in `viewProspetti.js` — nessuno di questi era in cima alla priorità indicata, e le
  validazioni di form con `alert()` (es. `viewAllocazione.js`) restano da convertire in
  validazione inline in una fase successiva.

## v0.22-014 — Storno massivo di un'Entrata, correzione saldi Conto con Conto Spesa in arrivo, vista "Giorno" nei grafici Prospetto

### Corretto (critico)
- **Un'Entrata arrivata su un Conto Spesa non aggiornava mai i saldi reali dei Conti Risparmio
  verso cui era stata distribuita** (segnalato dall'utente con un caso reale: entrata su un
  Conto Spesa, distribuzione su più Fondi/Obiettivi di Conti Risparmio diversi — i Fondi/
  Obiettivi risultavano correttamente accreditati, ma il saldo dei Conti Risparmio restava
  invariato). Causa: una condizione troppo ampia saltava l'intero blocco di movimento reale
  sui Conti ogni volta che il Conto di *arrivo* dell'entrata era di tipo "Spesa" — non solo per
  il proprio saldo (corretto, un Conto Spesa deve sempre restare a zero), ma anche per i
  bonifici reali verso *altri* Conti che non c'entravano nulla con quel vincolo. Corretto in
  `domain/allocazioni.js`, sia in `confermaAllocazione` sia (simmetricamente) in
  `stornaRigaAllocazione`: ora solo il saldo del Conto di arrivo resta bloccato a zero quando è
  di tipo Spesa; i movimenti reali verso gli altri Conti coinvolti avvengono regolarmente, come
  già accadeva quando il Conto di arrivo era di tipo Risparmio.
  **Nota**: i saldi già scritti in modo errato da entrate registrate prima di questa versione
  non vengono ricalcolati automaticamente (nessun automatismo silenzioso) — vanno corretti con
  una Rettifica dal Registro Movimenti, se necessario.

### Aggiunto
- **Storno di un'intera Entrata in un solo click**: nel Registro Movimenti, ogni Entrata
  distribuita su più destinazioni è ora una riga di gruppo espandibile (mostra il totale e il
  numero di voci); aprendola si vedono le singole righe, stornabili una a una come prima. Sulla
  riga di gruppo è comparso anche un pulsante "Storna tutto", che genera in un'unica azione uno
  Storno per ciascuna riga ancora stornabile (verso Fondo/Obiettivo) — nessun nuovo tipo di
  movimento: restano N Storni singoli e tracciabili, solo emessi insieme. Nuova funzione
  `stornaAllocazioneCompleta` in `domain/allocazioni.js`.
- **Vista "Giorno" nei grafici dei Prospetti**: aggiunta ai livelli di dettaglio già esistenti
  (Settimana/Mese/Trimestre/Semestre/Anno/5 anni) del grafico dei Prospetti, un punto per
  ciascun giorno del periodo mostrato.

## v0.22-013 — Rimossa l'opzione "Conto" per l'eccesso (bug alla radice), Confronto col Piano rimosso, grafico Salute Finanziaria allineato

### Corretto (critico)
- **Registrare un'Entrata con destinazione eccesso "Conto" poteva lasciare l'app in stato
  confuso**: segnalato dall'utente con un errore ("il Conto ha solo 0€ di liquidità non
  allocata") che compariva dopo che l'Entrata era già stata registrata, lasciando l'utente sulla
  schermata di conferma come se nulla fosse successo. Causa: dopo la conferma, tentavo un
  Trasferimento *separato* verso il Conto designato — ma se il Conto di arrivo è di tipo
  "Spesa" (che non accredita mai saldoReale), quel Trasferimento falliva su un saldo mai
  esistito. **Rimossa del tutto l'opzione "Conto"**: resta solo "Fondo", allocato direttamente
  come riga della stessa Entrata — nessuna operazione separata dopo la conferma, l'intera
  classe di bug è eliminata alla radice, non solo patchata caso per caso.

### Rimosso
- **"Confronto col Piano"** rimosso da Salute Finanziaria (richiesto dall'utente: "non ha
  senso") — UI, dominio e motore ripuliti, nessun residuo.

### Aggiunto
- **Grafico Salute Finanziaria ora con granularità configurabile** (settimana/mese/trimestre/
  semestre/anno/5 anni), stessa possibilità già data al grafico dei Prospetti.

### Corretto
- **Il grafico di Salute Finanziaria partiva mostrando i periodi più vecchi**, non arrivando
  mai a oggi (segnalato dall'utente: "parto da metà 2025 e vedo fino a giugno 2025, mi
  interessa oggi"). Ora parte sempre mostrando gli ultimi periodi, con oggi come punto finale
  esatto (mai un arrotondamento di calendario).

## v0.22-012 — Correzione critica: Confronto col Piano gonfiato con Entrate insufficienti; Obiettivi in ritardo a scadenza raggiunta; grafico Salute Finanziaria allineato al Prospetto

### Corretto (critico)
- **"Confronto col Piano" gonfiato quando un'Entrata non basta a coprire le Voci del Piano**:
  segnalato dall'utente con un caso reale ("-800 su 3/6 mesi, -1200 sull'anno" con **zero**
  movimenti reali registrati) e verificato riproducendolo esattamente sui suoi dati. Il calcolo
  sommava ciecamente "quanto ogni Voce richiederebbe" anche quando l'Entrata non ci arrivava
  (2 Entrate su 3, nel suo caso) — irrealizzabile. Corretto usando la stessa risoluzione già
  usata altrove nell'app per un'Entrata insufficiente (`risolviInsufficienzaPerPriorita`):
  applica le Voci in ordine di priorità finché il denaro non si esaurisce. Verificato
  numericamente sui dati esatti dell'utente: i valori ora restano limitati a quanto l'Entrata
  può davvero coprire.
- **Obiettivi in ritardo non segnalava un Obiettivo a scadenza raggiunta se sopra all'80%**:
  segnalato dall'utente (100 su 120 = 83%, scadenza del Prospetto coincidente con quella
  dell'Obiettivo, ma nessun ritardo mostrato). "mesiRimanenti" è sempre "almeno 1" anche a
  scadenza già passata, quindi il solo controllo con la soglia dell'80% lo mascherava. Corretto:
  un Obiettivo con scadenza raggiunta e non completo è ora **sempre** in ritardo, qualunque
  percentuale abbia raggiunto — la soglia dell'80%/3 mesi resta solo per l'avviso precoce
  (scadenza non ancora raggiunta ma vicina). Corretto anche un problema di fuso orario nel
  confronto delle date (stessa classe di bug già affrontata altrove nell'app).

### Aggiunto
- **Il grafico di Salute Finanziaria reale ora ha le stesse migliorie del grafico Prospetto**:
  paginazione a periodi (12 alla volta, frecce avanti/indietro), tooltip con intervallo
  inizio-fine, click su un punto per un pannello con i movimenti (Entrate/Uscite/Rettifiche/
  Trasferimenti, con nome e importo) caduti in quel periodo per quel Conto, singolo punto
  centrato invece di schiacciato a sinistra, più margine per le etichette.

### Corretto
- **Etichette del grafico Prospetto**: margine inferiore ulteriormente ampliato (erano ancora
  segnalate tagliate), e un solo punto in finestra ora è centrato invece di stare a sinistra.
- **Anteprima stampa/PDF**: aggiunti i "Non allocati" del Prospetto, se presenti.

## v0.22-011 — Grafico Prospetto: paginazione, tooltip con intervallo, click per i movimenti; non allocati in stampa

### Aggiunto
- **Navigazione a periodi nel grafico**: mostra al più 12 periodi alla volta, con frecce
  "Periodo precedente/successivo" per scorrere l'intero orizzonte — utile con granularità fitte
  (es. settimana su un Prospetto di anni). Parte mostrando gli ultimi periodi.
- **Tooltip con intervallo**: al passaggio del mouse indica inizio e fine esatti del periodo
  rappresentato dal punto (non più una singola etichetta).
- **Click su un punto**: apre un pannello con l'elenco dei movimenti (Scenario, ripetitivi,
  singoli) caduti in quel periodo, ciascuno con data, nome e importo — richiesto dall'utente per
  poter "evidenziare" le entrate e uscite di un periodo specifico.
- **Non allocati del Prospetto ora anche nell'Anteprima stampa/PDF**, se presenti.

### Corretto
- **Etichette dei periodi tagliate in basso**: più margine nel grafico e rotazione delle
  etichette corretta (ancorate al punto giusto, non più a rischio di uscire dal riquadro).

## v0.22-010 — Non allocati tracciati, grafico Prospetto con date reali (corregge bug Uscite), destinazione eccesso configurabile

### Corretto (critico)
- **Il grafico del Prospetto ignorava le Uscite**, segnalato dall'utente confrontando grafico e
  tabelle: la `traiettoria` del motore veniva catturata *prima* di applicare i movimenti
  "singolo" (Uscite/Entrate una tantum, e i movimenti generati da Trasferisci/Ridistribuisci) —
  tabelle e "Crescita patrimoniale sull'orizzonte" erano corrette (usano il risultato finale,
  che li include), solo il grafico no. Riscritto completamente: nuova
  `calcolaTraiettoriaDettagliataProspetto` costruisce una linea del tempo con **date reali**
  (Scenario e movimenti ripetitivi sul giorno del ciclo di ciascuna occorrenza, movimenti
  singoli sulla loro data esatta), verificata numericamente contro il conteggio delle
  occorrenze già validato in precedenza.

### Aggiunto
- **Granularità del grafico selezionabile**: settimana, mese, trimestre, semestre, anno, 5
  anni — richiesto dall'utente per vedere il dettaglio dell'andamento del Conto a piacere.
- **"Non allocati" del Prospetto, tracciati esplicitamente**: quanto dell'entrata ipotizzata da
  uno Scenario non è coperto da nessuna Voce non sparisce più silenziosamente dalla proiezione
  (bug noto, ora corretto) — resta un totale sempre visibile nel dettaglio del Prospetto, **mai
  instradato automaticamente** in un Fondo/Conto (scelta esplicita dell'utente: "non sono da
  nessuna parte ma sappiamo che esistono"). Riallocabile solo a mano: nuovo checkbox
  "Distribuisci anche i non allocati (X€)" dentro Ridistribuisci, che aggiunge la quota
  disponibile al saldo allocabile dell'origine scelta.
- **Destinazione dell'eccesso configurabile per le Entrate reali** (Impostazioni → Registra
  Entrata, nuovo store `impostazioniAllocazione`): quando in Registra Entrata si usa uno
  Scenario che non copre l'intera Entrata, l'eccesso può ora confluire automaticamente in un
  Fondo designato (allocazione diretta) o in un Conto designato (trasferito lì subito dopo la
  conferma, se diverso dal Conto di arrivo) — invece di restare sempre "disponibilità residua"
  generica sul Conto di arrivo. Comportamento di default (nessuna destinazione impostata)
  invariato.
- Nuovo `js/domain/impostazioniAllocazione.js`, nuova tab "Registra Entrata" in Impostazioni.

### Chiarito
- Confermato dal codice: nel Piano, il campo "entrata simulata" serve solo per l'anteprima di
  quanto si starebbe allocando ("Copertura completa" / "Residuo non allocato") — non è
  persistito da nessuna parte, nessun altro effetto sui dati reali.

## v0.22-009 — Tasso di risparmio sostituito con Confronto col Piano

### Modificato
- **Salute Finanziaria reale**: "Tasso di risparmio" (percentuale isolata) sostituito con
  **"Confronto col Piano"** — decisione esplicita dell'utente: una percentuale non dice se si è
  "in linea" con la propria tabella di marcia. Nuovo indicatore in euro, cumulativo sul
  periodo: quanto versato realmente in Fondi/Obiettivi meno quanto il **Piano attivo** avrebbe
  suggerito per le stesse Entrate reali registrate — un mese sotto e uno sopra si compensano da
  soli, perché si guarda solo il totale del periodo, non mese per mese. Non calcolabile se non
  c'è un Piano attivo.
- **Salute Finanziaria del Prospetto**: "Tasso di risparmio" rimosso **senza sostituto** — lì
  confrontava la crescita simulata con l'entrata simulata, la stessa cosa vista da due lati
  (tautologico in un contesto di sola simulazione, diversamente dalla versione reale dove
  confronta un dato reale con un Piano).

### Chiarito (limite noto, non ancora risolto)
- Confermato su richiesta dell'utente: sia il vecchio Tasso di risparmio sia il nuovo Confronto
  col Piano contano **tutte** le Entrate registrate, senza distinzione di tipo (stipendio vs
  altro) — il modello non ha un campo che categorizzi le Entrate.
- Confermato anche un secondo limite, segnalato dall'utente: se l'entrata ipotizzata di un
  Prospetto è superiore a quanto le Voci del suo Scenario allocano, l'eccedenza non viene
  tracciata da nessuna parte (sparisce dalla simulazione) — il Prospetto non associa l'entrata
  ipotizzata a un Conto specifico, quindi non c'è un posto ovvio dove instradarla. Proposte
  discusse ma non ancora implementate: (1) renderla visibile come numero esplicito, oppure
  (2) tracciarla come liquidità crescente di un Conto di riferimento da aggiungere al Prospetto.

## v0.22-008 — Salute Finanziaria per Prospetto, Grafici nel dettaglio, Confronto esteso

### Aggiunto
- **Salute Finanziaria a fine Prospetto**: nuova sezione nel dettaglio, con gli stessi 5
  indicatori della Salute Finanziaria reale (Mesi di autonomia, Obiettivi finanziati, Obiettivi
  in ritardo, Crescita patrimoniale, Tasso di risparmio) ma calcolati sui dati **proiettati** —
  "come se fossi a fine Prospetto e andassi a vedere la mia Salute Finanziaria". Il Fondo
  Emergenza resta quello designato globalmente (solo il suo saldo è quello proiettato);
  Obiettivi in ritardo/scadenza guardano dalla data fine del Prospetto, non da oggi; Crescita
  patrimoniale e Tasso di risparmio sull'intero orizzonte del Prospetto (non un periodo fisso).
- **Composizione della spesa mensile per Prospetto, configurabile**: per ogni Prospetto,
  scegli "Eredita da Impostazioni" (stessa composizione globale, valutata sui dati proiettati)
  oppure "Personalizza per questo Prospetto" — con un tipo di voce in più rispetto a quelle
  globali: "Eredita i Budget del Piano collegato a questo Prospetto" (riusa `budgetStimati`,
  già calcolato coerentemente con lo Scenario specifico del Prospetto).
- **Sezione "Grafici" nel dettaglio del Prospetto**: andamento del patrimonio totale in Fondi,
  ciclo per ciclo — riusa la `traiettoria` già calcolata dal motore di proiezione (mai esposta
  finora), nessuna ricostruzione storica necessaria essendo una proiezione in avanti. Griglia
  con valori numerici e tooltip al passaggio del mouse, come nel grafico reale.
- **"Confronta Prospetti" esteso**: oltre ai Fondi (già presenti), ora anche Conti (patrimonio
  previsto), Obiettivi (con % di completamento), Budget (totale impegnato) e gli indicatori di
  Salute Finanziaria — tutti affiancati per ciascun Prospetto selezionato.
- Nuove funzioni: `domain/prospetti.js` (`impostaModalitaAutonomiaProspetto`,
  `elencoVociAutonomiaProspetto`, `aggiungiVoceAutonomiaProspetto`,
  `rimuoviVoceAutonomiaProspetto` — voci in `prospettoElementi`, categoria 'voceAutonomia',
  stessa infrastruttura di movimenti e override saldo); `domain/saluteFinanziaria.js`
  (`calcolaSaluteFinanziariaProspetto`). Nessun nuovo store IndexedDB.

## v0.22-007 — Ricalcola Prospetto: log diagnostico dettagliato

### Aggiunto
- **"Ricalcola Prospetto" ora registra in console (F12 → Console) il dettaglio di ogni
  movimento esaminato**: se è stato ignorato e perché (non è un drenaggio da correggere, Fondo
  non trovato, Fondo senza Obiettivi, già corretto) oppure corretto (con le nuove righe create).
  Serve a diagnosticare un caso segnalato dall'utente in cui "Ricalcola" non ha sistemato un
  Prospetto rimasto sbagliato (risolto poi eliminando e rifacendo la ridistribuzione) — non
  ancora riprodotto con certezza in laboratorio: questo log permetterà di vedere esattamente
  dove si ferma, se il problema si ripresenta.

## v0.22-006 — Ricalcola Prospetto (correzione retroattiva), azioni sempre in linea

### Aggiunto
- **"Ricalcola Prospetto"**: nuovo pulsante nel dettaglio, per i Prospetti creati prima della
  correzione del doppio conteggio (v0.22-002). Rigioca in ordine cronologico i movimenti di
  Trasferisci/Ridistribuisci già salvati: prima ricostruisce lo stato dopo Scenario e movimenti
  ripetitivi (mai salvati come righe, sempre ricalcolati), poi corregge ogni drenaggio "vecchio
  stile" (genericamente sul Fondo, senza toccare i suoi Obiettivi) con l'equivalente gerarchico
  corretto — stesso importo assoluto totale, ripartito stavolta correttamente. Non tocca nient'
  altro: Scenario, movimenti normali e le righe di destinazione (mai state sbagliate) restano
  identici. Segnala quante righe sono state corrette, o se il Prospetto era già a posto.

### Modificato
- **Azioni sempre in linea**: sia nell'elenco Prospetti (Anteprima/Proiezione/Modifica/Elimina)
  sia nel dettaglio (Mostra tutti/Ricalcola/Anteprima stampa), le azioni non vanno più a capo.
  Ampliata anche la larghezza massima del contenuto (1040px → 1240px) per fare più spazio.

## v0.22-005 — Migliorie grafiche: Seleziona tutti, chip Conti, grafico con assi/tooltip, scheda Emergenza compatta

### Aggiunto
- **"Seleziona tutti" / "Deseleziona tutti"** per gli Obiettivi di un Fondo nella Ridistribuzione
  Prospetti — utile con Fondi che hanno molti Obiettivi.
- **Grafico Salute Finanziaria con indicatori numerici**: griglia orizzontale con valori sull'asse
  (era "un po' scarno"), e un **tooltip al passaggio del mouse** su ciascun punto — "Conto —
  Mese: importo", per ogni Conto disegnato.

### Modificato
- **Scelta dei Conti per il grafico**: da spunte a **chip cliccabili** (pillole, si colorano
  quando selezionate) — "molto brutto con le spunte".
- **Scheda "Fondo Emergenza" tornata compatta** (era diventata un riquadro largo per contenere
  tutta la configurazione): ora mostra solo i mesi di autonomia, con una piccola icona
  ingranaggio che apre la configurazione (Fondo designato, composizione della spesa mensile
  stimata) in una nuova sezione dedicata dentro **Impostazioni → Salute Finanziaria**.

## v0.22-004 — Budget collegati al Piano attivo (attivazione automatica, non più manuale)

### Aggiunto
- **Un solo Piano attivo alla volta, con conseguenze reali**: attivare un Piano ora attiva
  automaticamente i Budget referenziati dalle sue Voci (`tipoDestinazione:'budget'`) e disattiva
  tutti gli altri Budget — compresi quelli non collegati a nessun Piano. Decisione esplicita
  dell'utente: "l'obiettivo è che i budget utilizzati dal calcolo mesi emergenza siano gli
  stessi del piano attivo... quando cambio piano non voglio stare a modificarli a mano".
  Riusato il campo `Piano.attivo` già esistente (prima solo una preferenza cosmetica di
  default, ora vincolante per i Budget) — nessuna nuova tabella di collegamento: "i budget del
  piano" sono semplicemente quelli referenziati dalle sue Voci, dato già esistente.
- **Un Budget può restare scollegato da ogni Piano** (confermato dall'utente: "uno non
  utilizzato può esserci, magari vecchio ma che voglio tenere") — reso esplicitamente evidente
  con un badge dedicato "Scollegato" (tratteggiato, distinto da "Inattivo"), sia in Conti →
  Budget sia nel dettaglio Budget-per-Conto della Dashboard.
- Il pulsante "Imposta come predefinito" in Piano ora si chiama "Attiva questo Piano" ed
  esplicita la conseguenza reale, con conferma prima di procedere.
- **Rimosso il toggle manuale Attivo/Inattivo** dal form e dalla tabella Budget: verrebbe
  sovrascritto alla prossima attivazione di un Piano, quindi non ha più senso esporlo come
  azione manuale — l'attivazione si gestisce collegando il Budget a una Voce del Piano che si
  vuole tenere attivo.
- Dashboard, Ciclo Budget ("Apri Nuovo Ciclo") e Salute Finanziaria continuano a funzionare
  senza modifiche: leggono già il campo `Budget.stato`, che ora viene sincronizzato
  automaticamente dall'attivazione del Piano invece che da un toggle manuale.

## v0.22-003 — Salute Finanziaria: composizione configurabile dell'autonomia, grafico patrimonio Conti

### Aggiunto
- **Composizione configurabile della "spesa mensile stimata"** per i Mesi di autonomia del
  Fondo Emergenza, come richiesto — non più solo la somma automatica dei Budget attivi:
  - **Bundle "Tutti i Budget attivi"**: la voce di default, con una spunta per toglierla.
  - **"Aggiungi voce"**, tre tipi: Budget singolo (per un Budget non coperto dal bundle, es. uno
    inattivo che si vuole comunque considerare), Risparmio annuale (obiettivo complessivo di un
    Fondo con Obiettivi ÷ 12 — un dodicesimo al mese per un Fondo che accumula per l'anno
    prossimo), Risparmio mensile (importo inserito a mano, su qualunque Fondo).
  - Ogni voce mostra il proprio contributo mensile ed è rimovibile singolarmente.
- **Sezione "Grafici"** dentro Salute Finanziaria: andamento del patrimonio totale (Fondi +
  liquidità/Budget) di uno o più Conti negli ultimi 12 mesi, selezionabili singolarmente
  (nessuna selezione = tutti). Ricostruito dal registro movimenti mese per mese (nessuno
  storico di saldi viene conservato) — semplificazione dichiarata in UI: la quota di liquidità
  libera/Budget di ciascun Conto è considerata costante al valore di oggi, solo i Fondi vengono
  ricostruiti con precisione mensile.

## v0.22-002 — Correzione critica: doppio conteggio negli Obiettivi dopo Ridistribuzione

### Corretto (critico)
- **Doppio conteggio segnalato dall'utente con un esempio preciso**: Obiettivo partito da 50,
  cresciuto a 80 (50 + 10€/mese per 3 mesi, corretto), poi ridistribuendo per lasciarne solo 60
  nel Fondo (spostando 20 altrove) il risultato mostrava 140 invece di 60. Causa: drenare un
  Fondo genericamente (`tipoDestinazione:'fondo'`) riduce solo il saldo aggregato del Fondo, mai
  il saldoAccumulato dei suoi Obiettivi — quando la ridistribuzione riassegnava poi denaro a uno
  specifico Obiettivo (drill-down gerarchico verso i suoi Obiettivi, già esistente in
  ingresso), quell'Obiettivo cresceva senza mai essere stato ridotto in origine, "contando gli
  stessi soldi più volte" esattamente come descritto dall'utente.
- Corretto rendendo anche il **drenaggio** gerarchico, simmetrico alla distribuzione in
  ingresso: prelevare da un Fondo con Obiettivi ora riduce prima il residuo non vincolato
  (Fondo meno la somma dei suoi Obiettivi) e solo se necessario intacca proporzionalmente gli
  Obiettivi stessi — corretto sia per il drenaggio parziale (Trasferisci) sia per quello
  completo (Ridistribuisci, e la cascata Conto → ciascuno dei suoi Fondi). Verificato
  numericamente sullo scenario esatto descritto: dopo il prelievo di 20, sia il Fondo sia
  l'Obiettivo tornano correttamente a 60.
- **Il Fondo origine può ora comparire anche come destinazione** in Ridistribuisci (prima era
  escluso): utile per "tieni una quota qui, sposta il resto altrove" in un'unica operazione.

### Aggiunto
- **"Visualizza anteprima"** (icona occhio) nell'elenco Prospetti, accanto a Proiezione/
  Modifica/Elimina: espande la riga se necessario e apre subito l'anteprima di stampa/PDF.

## v0.22-001 — Fase 5: Salute Finanziaria, movimenti manuali nella stampa Prospetti

### Aggiunto
- **Fase 5 — Salute Finanziaria** (FDD §4.11 e cap. 6), nuova tab dentro Strategia & Report.
  Sola lettura, nessun nuovo dato persistito a parte due preferenze:
  - **Mesi di autonomia del Fondo Emergenza**: saldo del Fondo designato ÷ spesa mensile
    stimata (somma degli importi di default dei Budget attivi). Il Fondo Emergenza va designato
    esplicitamente (il modello non ha un flag apposito, confermato con l'utente) — nuovo store
    `impostazioniSaluteFinanziaria` (`DB_VERSION` 7).
  - **Percentuale di Obiettivi finanziati**: saldo accumulato complessivo ÷ target complessivo,
    su tutti gli Obiettivi.
  - **Obiettivi in ritardo**: scadenza entro 3 mesi E meno dell'80% raggiunto (soglie
    confermate con l'utente), con elenco dei singoli Obiettivi coinvolti.
  - **Crescita patrimoniale**: variazione del totale Fondi nel periodo scelto (3/6/12 mesi,
    selezionabile e salvato come preferenza), ricostruita dal registro movimenti (nessuno
    storico di saldi viene conservato: Allocazioni, Uscite, Rettifiche e Trasferimenti che
    interessano i Fondi vengono sommati con il segno corretto; gli spostamenti interni tra
    Fondi si annullano automaticamente nell'aggregato).
  - **Tasso di risparmio**: quota delle Entrate nel periodo finita in Fondi/Obiettivi.
  - Nuovi `engine/saluteFinanziaria.js` (calcoli puri), `domain/saluteFinanziaria.js`
    (recupero dati e orchestrazione), `domain/impostazioniSaluteFinanziaria.js` (preferenze).
- **Anteprima stampa/PDF dei Prospetti**: aggiunta la sezione Movimenti manuali (solo Entrate/
  Uscite manuali una tantum o ripetitive — esclusi i movimenti generati da Trasferisci/
  Ridistribuisci, che restano nella loro sezione dedicata).

## v0.21-010 — Saldo Prospetto precedente, Differenza esplicita, Anteprima stampa/PDF, sfoltimento note

### Aggiunto
- **"Saldo Prospetto precedente"**: nuova colonna nella tabella Conti, visibile solo per un
  Prospetto concatenato — il patrimonio del Conto al termine del Prospetto di origine, distinto
  sia dal saldo reale attuale sia dal patrimonio previsto di questo Prospetto.
- **"Differenza" ora dichiara esplicitamente a cosa si riferisce**: "(vs. saldo attuale)" per
  un Prospetto non concatenato, "(vs. Prospetto precedente)" per uno concatenato — richiesto
  dall'utente per non lasciare ambiguità tra le due basi di calcolo possibili.
- **Anteprima stampa / PDF**: nuovo pulsante nel dettaglio del Prospetto. Apre in una nuova
  scheda un documento essenziale (solo tabelle: Conti, Budget, Fondi, Obiettivi — senza le
  descrizioni discorsive presenti nell'app) e invoca la stampa nativa del browser, che mostra
  già un'anteprima prima di stampare o salvare come PDF.

### Modificato
- Sfoltite diverse note discorsive nella vista Prospetti (introduzione, Punto di partenza,
  Andamento Budget, Trasferisci/Ridistribuisci, Movimenti manuali, Giorno del ciclo) — richiesto
  dall'utente, erano troppo prolisse.

## v0.21-009 — Correzione: patrimonio previsto dei Conti sbagliato nei Prospetti concatenati

### Corretto (critico)
- **Trovata la causa esatta del disallineamento segnalato dall'utente** ("somma dei Fondi" di
  un Conto = 1000 ma "Patrimonio totale previsto" = 800, con zero liquidità libera reale su
  quel Conto): il bug esiste SOLO nei Prospetti concatenati. La vecchia formula calcolava
  "saldo reale del Conto **oggi** + variazione di **questo solo Prospetto**" — ma in un
  Prospetto concatenato i Fondi di partenza sono già quelli ereditati (simulati) dal Prospetto
  di origine, non quelli reali di oggi: sommare la variazione di un solo anello della catena al
  saldo di oggi faceva perdere per strada tutta la crescita già avvenuta nei Prospetti
  precedenti, producendo sistematicamente un totale troppo basso.
- Corretto isolando prima la quota realmente reale del Conto — liquidità libera + Budget
  assegnato, che non è mai simulata — usando i **Fondi reali di oggi** (nuovo campo
  `fondiReali`, recuperato sempre, indipendentemente dalla concatenazione), e sommandoci poi la
  proiezione finale dei Fondi (che per un Prospetto concatenato include già l'intera catena).
  Verificato numericamente: con zero liquidità libera reale, "Patrimonio totale previsto" ora
  coincide esattamente con "somma dei Fondi" mostrata in Trasferisci/Ridistribuisci.

## v0.21-008 — Correzione virgola mobile, menu Altre azioni che non si chiudeva, chiarimento Conti in Prospetti

### Corretto (critico)
- **Importi con decimali infiniti (es. "6442,9000000000001")**: segnalato dall'utente come
  particolarmente fastidioso — alcune somme (il saldo di un Conto come somma dei suoi Fondi,
  sia nel dominio che nella UI) non venivano mai arrotondate prima di essere mostrate,
  esponendo il classico errore di rappresentazione binaria dei numeri decimali in JavaScript.
  Corretto avvolgendo tutte queste somme con `arrotonda()`, sia nel selettore d'origine di
  Trasferisci/Ridistribuisci sia nella validazione del dominio.
- **Il menu "Altre azioni" in Dashboard non si chiudeva mai**: la regola CSS `.dropdown-azioni`
  impostava `display: flex` incondizionatamente, con la stessa specificità (ma dichiarata dopo)
  della regola implicita del browser per l'attributo `hidden` — di fatto la sovrastava sempre,
  rendendo il menu permanentemente visibile a prescindere dal suo stato. Aggiunta la regola
  `.dropdown-azioni[hidden] { display: none; }`, più specifica, che ripristina il comportamento
  corretto.

### Chiarito (non un bug, ma un'etichettatura ambigua)
- Segnalato dall'utente: dopo una Ridistribuzione, "la somma dei saldi dei Fondi di un Conto"
  (mostrata come origine in Trasferisci/Ridistribuisci) e il "Patrimonio totale previsto" del
  Conto (mostrato nella tabella "Conti a fine Prospetto") possono legittimamente differire — il
  secondo include anche l'eventuale liquidità non ancora allocata in nessun Fondo, il primo no.
  Sono due metriche diverse per definizione, non un errore di calcolo, ma la UI non lo rendeva
  per nulla chiaro. Ora entrambe le sezioni spiegano esplicitamente la differenza, e le opzioni
  "Conto" nei selettori d'origine sono etichettate "(somma dei Fondi, esclusa liquidità non
  allocata)" per non lasciare spazio ad ambiguità.

## v0.21-007 — Bug saldo Conto in Ridistribuzione, Budget dei Prospetti concatenati, Dashboard personalizzabile

### Corretto (critico)
- **Bug segnalato dall'utente**: ridistribuendo l'intero saldo di un Conto, il messaggio di
  errore mostrava un "saldo proiettato" diverso da quello reale (es. 1000 invece di 800). Causa:
  il selettore d'origine mostrava il saldo Conto "reale + variazione dei Fondi" (include
  liquidità non allocata, la stessa metrica della sezione "Conti a fine Prospetto"), mentre il
  dominio validava contro "somma dei Fondi proiettati" — due numeri diversi ogni volta che il
  Conto ha liquidità non allocata. Corretto: il selettore ora mostra sempre e solo la somma dei
  Fondi proiettati, la stessa cifra che il dominio verifica.
- **Andamento Budget nei Prospetti concatenati**: segnalato dall'utente — se un Prospetto B
  parte da un Prospetto A ma ha un Piano diverso collegato, i Budget mostrati devono riflettere
  il Piano di B, non restare "ereditati" da A. Corretto: se il Prospetto ha uno Scenario
  collegato con Voci verso Budget, l'importo per ciclo è ora calcolato da QUELLE Voci (stessa
  logica già usata per Fondi/Obiettivi, `calcolaRichiestaDaPiano`) — non più un elenco generico
  di tutti i Budget attivi, identico in ogni Prospetto a prescindere dal Piano collegato. Se non
  c'è uno Scenario collegato (o non ha Voci verso Budget), resta la stima generica sull'importo
  di default, con nota esplicita in UI su quale dei due casi si applica.

### Aggiunto
- **Dashboard personalizzabile**: nuova sezione "Dashboard" dentro Impostazioni (tab accanto a
  Categorie) con l'elenco delle Azioni e una stellina per ciascuna — spuntata, l'Azione compare
  in evidenza accanto a "Registra Entrata" nella Dashboard; altrimenti resta dentro il menu
  "Altre azioni". "Registra Entrata" è sempre in evidenza, non fa parte della scelta.
- **"Altre azioni" ora è un pulsante della stessa dimensione di "Registra Entrata"**, affiancato
  ad esso (non più una pillola piccola), colore neutro — così come tutte le Azioni eventualmente
  promosse in evidenza (solo "Registra Entrata" resta viola).
- Nuovo store `impostazioniDashboard` (`DB_VERSION` 6) e dominio dedicato per salvare questa
  preferenza, per-Profilo come tutto il resto dei dati.

## v0.21-006 — Correzione fondamentale: i movimenti singolo non sono legati ai cicli; Andamento Budget; Ridistribuzione gerarchica; Dashboard Azioni

### Corretto (critico)
- **Il concetto di ciclo era applicato anche dove non doveva, segnalato dall'utente con un
  esempio preciso**: Prospetto dall'1/10 al 31/12 con ciclo il 15, una spesa una tantum
  (movimento "singolo") il 3 ottobre spariva dal totale — perché cadeva prima della prima
  occorrenza del giorno del ciclo, e veniva scartata come se fosse "fuori orizzonte" per un
  motivo che non ha alcun senso per un evento con una data precisa. Il ciclo riguarda SOLO lo
  Scenario (entrata periodica) e i movimenti "ripetitivo" (che per definizione si ripetono ogni
  mese) — un movimento "singolo" ora si applica semplicemente se la sua data cade nel periodo
  del Prospetto (dataInizio - dataFine), punto, senza alcun riferimento a cicli. Corretto sia
  nel motore (`engine/prospettoCalc.js`, i "singolo" si applicano in un passaggio finale
  separato dal ciclo per ciclo di Scenario/ripetitivi) sia nel dominio (fuoriOrizzonte è ora un
  semplice confronto di date, non più un indice di ciclo).

### Aggiunto
- **"Andamento Budget (stima)"**: nuova sezione nel dettaglio del Prospetto. Non potendo
  prevedere la spesa reale di un Budget (nessuna registrazione dettagliata delle spese nel
  modello), si ipotizza che ogni ciclo venga impegnato per intero l'importo di default di
  ciascun Budget attivo — "hai sicuramente destinato questa cifra": se ne avanzerà o servirà di
  più si vedrà solo nella realtà, a fine ciclo. Include il totale impegnato su tutti i Budget.
- **Ridistribuzione gerarchica, non più un elenco piatto**: segnalato dall'utente — "non ha
  senso ridistribuire equamente tra un Fondo e un suo Obiettivo, non sono allo stesso livello".
  Ora si ripartisce prima il totale tra i Fondi; per ciascun Fondo, opzionalmente, si può
  scendere di un livello e dividere la SUA quota tra i suoi Obiettivi (Equa/Proporzionale/
  Manuale) — una conseguenza della quota del Fondo, non una scelta allo stesso livello.
- **Grafica della Ridistribuzione in stile "Ridistribuisci Liquidità"** (Dashboard): riga per
  Fondo con importo modificabile ed espansione verso i suoi Obiettivi, scorciatoia "Equamente",
  controllo di coerenza live "Assegnato ai Fondi / Totale da ridistribuire". Usa eventi
  `change` (non `input`) per non perdere il focus ricostruendo l'HTML ad ogni carattere digitato
  — stessa tecnica già impiegata dalla vista di riferimento.
- **Trasferisci** resta un flusso separato e semplice (una sola destinazione), invariato nella
  logica salvo la separazione netta dal nuovo flusso di Ridistribuisci.
- **Dashboard, sezione Azioni**: implementata la soluzione scelta — un solo pulsante primario
  grande (Registra Entrata) e un menu a tendina compatto "Altre azioni" per le restanti cinque,
  anziché una riga di pillole sempre visibili. Si chiude cliccando fuori o su una voce.

## v0.21-005 — Prospetti: situazione Conti a fine periodo, Trasferisci/Ridistribuisci distinti e ridistribuzione per Conto

### Aggiunto
- **"Conti a fine Prospetto"**: nuova tabella nel dettaglio che mostra il saldo *previsto* di
  ciascun Conto (non solo quello reale attuale come prima), con una riga di **Patrimonio
  totale** — attuale vs previsto. Il saldo previsto di un Conto riflette la crescita dei Fondi
  che gli appartengono, stesso principio già usato per i movimenti di chiusura Ciclo Budget.
- **Trasferisci e Ridistribuisci ora sono due pulsanti distinti**, come richiesto — non più un
  unico wizard con un menu "Modalità": "Trasferisci" apre subito il flusso a una destinazione,
  "Ridistribuisci" apre subito quello a più destinazioni con Equa/Manuale.
- **Ridistribuzione per Conto**: l'origine di un Trasferimento/Ridistribuzione può ora essere
  anche un intero Conto, non solo un Fondo o un Obiettivo — preleva per intero ciascuno dei suoi
  Fondi (liberandone l'intero patrimonio previsto) per poterlo ridistribuire tra altri Fondi e,
  se scelto, anche tra i loro Obiettivi (già supportato dalla selezione destinazioni esistente).
  Con origine un Conto, l'importo totale è sempre bloccato al suo saldo previsto (nessun euro
  creato o perso, anche in simulazione).

### Modificato
- Icona "Rimuovi immagine" del Profilo: ora `fa-eraser` (era `fa-image-slash`).
- Ordine della nav principale: "Movimenti" spostato in ultima posizione tra le quattro voci
  (Dashboard, Conti, Strategia & Report, Movimenti).

## v0.21-004 — Correzione definitiva cicli Prospetti (giorno del ciclo separato da data inizio) e icona nav

### Corretto (critico)
- **Il concetto di ciclo era ANCORA sbagliato**, questa volta segnalato dall'utente con una
  domanda diretta e decisiva: "prendo lo stipendio il 15, oggi (26 luglio) inizio un Prospetto:
  quanti cicli fino a fine anno?" Risposta corretta: 5. La versione precedente (v0.21-003)
  confondeva il giorno di `dataInizio` con il giorno dello stipendio — usava il 26 (giorno in
  cui si apre il Prospetto) come se fosse il giorno del ciclo, invece del 15 (giorno reale dello
  stipendio), risultando in 6 invece di 5.
- **Nuovo campo esplicito "Giorno del ciclo"** sul Prospetto, separato da "Data inizio": quando
  si inizia a proiettare da una data arbitraria (es. "oggi") diversa dal giorno in cui il ciclo
  si apre davvero, ora si può indicare il giorno reale. Di default coincide con il giorno di
  "Data inizio" (il caso più comune), ma è sempre modificabile. Auto-suggerito quando si cambia
  la data inizio in creazione.
- Le due funzioni di conteggio occorrenze (una per il numero di cicli generico, una per i
  movimenti "ripetitivo") sono state unificate in un'unica `contaOccorrenzeGiorno`, con la
  regola corretta "prima occorrenza >= ancoraggio" (non ">"): gestisce sia il caso in cui
  l'ancoraggio stesso sia il giorno del ciclo (non va escluso) sia il caso in cui sia una data
  arbitraria diversa dal giorno del ciclo. Verificato numericamente su tutti gli scenari
  discussi: 1 ottobre→31 dicembre = 3; 26 luglio con stipendio 15→31 dicembre = 5; 26 luglio con
  stipendio 28→31 dicembre = 6.
- **Corretto anche un rischio latente di fuso orario**: `new Date("YYYY-MM-DD")` viene
  interpretato come mezzanotte UTC, non mezzanotte locale — nei fusi orari indietro rispetto a
  UTC questo può far scivolare la data indietro di un giorno una volta letta con i getter
  locali. Non si manifesta con il fuso orario italiano (avanti rispetto a UTC) ma restava un
  parsing scorretto in generale. Tutte le date del Prospetto vengono ora sempre costruite e
  riformattate esplicitamente in locale, mai tramite un giro per `toISOString()`/UTC.

### Corretto
- **Icona Profilo rettangolare ancora sbagliata in nav** (ma corretta nell'elenco Profili):
  trovata la causa reale — una regola globale `button { padding: 8px 14px; margin-right: 6px; }`
  non veniva azzerata per il pulsante icona di navigazione, comprimendo l'area interna in un
  rettangolo stretto e asimmetrico (~10×22px invece di un quadrato 38×38) anziché in un
  quadrato. Corretto azzerando padding/margin ereditati e aggiungendo `overflow: hidden` come
  ulteriore garanzia. L'elenco Profili non soffriva del problema perché usa uno `<span>`, non un
  `<button>`, quindi non ereditava quella regola.

### Da fare (proposta presentata, non ancora implementata)
- Dashboard, sezione Azioni: vedi proposta discussa in conversazione, in attesa di conferma
  sull'approccio prima di implementare.

## v0.21-003 — Correzione critica cicli Prospetti, icona profilo, azioni orizzontali, toggle Budget, Dashboard

### Corretto (critico)
- **Il concetto di "ciclo" nei Prospetti era sbagliato, corretto su segnalazione precisa
  dell'utente**: un ciclo si apre esattamente il giorno in cui arriva lo stipendio (dataInizio)
  e si chiude il giorno prima dello stesso giorno del mese successivo — non un conteggio
  astratto di mesi coperti. Esempio dell'utente: un Prospetto dall'1 ottobre al 31 dicembre deve
  contare 3 cicli (1 ottobre, 1 novembre, 1 dicembre), non 2. La correzione precedente (v0.20-xxx,
  "mesi coperti dall'intervallo") era anch'essa insufficiente: avrebbe dato risultati diversi a
  seconda del giorno di dataInizio, mentre il giorno esatto conta sempre, in ogni caso. Nuova
  funzione `calcolaIndiceCiclo`, che ancora dataInizio stesso come primo ciclo e conta le
  occorrenze successive dello stesso giorno — stesso principio già corretto in
  `calcolaOccorrenzeRipetitivo`, ora applicato coerentemente anche al numero di cicli generico
  (che guida le Voci di Piano) e alla risoluzione dei movimenti "singolo".

### Corretto
- **Icona Profilo con immagine rettangolare ridimensionata in modo errato**: l'immagine è un
  flex item del pulsante di navigazione; senza `min-width:0`/`min-height:0` il suo "min-size"
  automatico si basa sulle dimensioni intrinseche dell'immagine (comportamento di default dei
  flex item per elementi sostituiti come `<img>`), sovrastando `width/height:100%` per immagini
  non quadrate. Corretto sia in nav sia nell'anteprima dell'elenco Profili.
- **Azioni degli Obiettivi in tabella disposte verticalmente**: la colonna azioni, compressa
  dalle molte altre colonne (barra di avanzamento, importi...), andava a capo. Impedito con
  `flex-wrap: nowrap` sulla riga di azioni di quella tabella specifica.

### Aggiunto
- **Pulsante rapido Attiva/Disattiva sul Budget**: icona dedicata in tabella (accanto a
  Modifica/Elimina), senza dover aprire il form di modifica.
- **Dashboard, sezione Azioni meno affollata** (proposta richiesta dall'utente, ora
  implementata): un solo pulsante primario grande (Registra Entrata, l'azione più frequente) e
  le altre cinque azioni come pillole compatte in una riga sotto — non più una griglia di sei
  card tutte della stessa dimensione.

## v0.21-002 — Allegati, eliminazione Budget con precauzioni, Obiettivi tabellari, totali Dashboard, redesign Prospetti

### Aggiunto
- **Allegati su Entrata/Uscita**: sezione "Allegato" espandibile e facoltativa (file, percorso
  sul PC, note) in Registra Entrata e Registra Uscita. Nuovo dominio `domain/allegati.js`,
  nuovo store `allegati` (indicizzato per movimento, `DB_VERSION` 5). Visualizzabili dal
  Registro Movimenti con un'icona graffetta (Alt+click per eliminare).
- **Prospetti — Data inizio esplicita e concatenamento**: ogni Prospetto ha ora una data inizio
  propria (non più implicitamente "oggi"). Nuovo campo "Parti da": situazione attuale (default)
  oppure il risultato finale di un altro Prospetto — in quel caso la data inizio è calcolata
  automaticamente (data fine dell'origine + 1 giorno) e i saldi di partenza sono ereditati dalla
  sua proiezione finale, non dai saldi reali. Concatenabile per un numero qualunque di passaggi,
  con protezione esplicita contro catene circolari.
- **Prospetti — Trasferisci / Ridistribuisci il risultato finale**: nuovo strumento per
  prelevare il saldo finale proiettato di un Fondo/Obiettivo e spostarlo (simulazione pura,
  nessuna validazione reale coinvolta: può scendere sotto qualunque soglia) su una destinazione
  (Trasferisci) o su più destinazioni divise con Equa/Manuale (Ridistribuisci), all'ultimo
  ciclo dell'orizzonte — pensato per portare avanti un avanzo/sforamento verso un Prospetto
  concatenato successivo (es. "Spese 2026" → "Spese 2027").
- **Prospetti — Mostra anche Fondi/Obiettivi non coinvolti**: nuovo toggle nel dettaglio.
  Aggiunta anche una sezione **Conti** informativa (saldo reale, non proiettato: i Conti non
  crescono nel tempo nel modello).
- **Obiettivi Fondo in formato tabellare**: l'elenco espanso di un Fondo mostra ora gli Obiettivi
  in tabella (Nome, Scadenza, Accumulato/Target con barra, Mancante, Consigliato/mese, Mesi
  rimanenti), azioni sempre a destra — stesse informazioni di prima, solo riorganizzate.
- **Dashboard "Budget assegnato per Conto"**: nuova riga di totale generale (somma su tutti i
  Conti). I totali (per Conto e generale) contano solo i Budget **attivi**; i Budget inattivi
  restano visibili nel dettaglio espanso, marcati con badge "Inattivo".

### Corretto
- **Bug segnalato dall'utente sui Prospetti**: un movimento "ripetitivo" ancorato a un giorno
  del mese non ancora passato rispetto a oggi (es. il 27, partendo dal 26) contava un'occorrenza
  in meno del dovuto rispetto a un giorno già passato (es. il 1°) sullo stesso orizzonte a data
  fissa. Corretto: ogni ripetitivo calcola ora il proprio numero di occorrenze reali sul
  calendario, invece di riusare il numero di cicli generico dello Scenario (pensato per un
  evento non ancorato a un giorno specifico).
- **Eliminazione Budget**: non più bloccata in modo rigido se ha uno storico di Cicli — ora
  elimina a cascata anche i Cicli collegati, con doppia conferma che spiega esattamente cosa
  verrà perso (segnalato dall'utente: "devo poterlo eliminare con le dovute precauzioni"). I
  Trasferimenti già avvenuti (avanzo/sforamento) restano nel Registro Movimenti come storico,
  mostrando "Budget eliminato" come riferimento — stesso trattamento riservato a qualunque altra
  entità eliminata.
- **Icona Profilo troppo distante da Impostazioni**: le due icone condividevano la stessa
  classe CSS con `margin-left:auto`, e due margini `auto` adiacenti si dividono lo spazio
  libero tra loro invece di accumularsi solo a sinistra della prima. Corretto raggruppandole in
  un contenitore dedicato con `margin-left:auto` (solo il gruppo viene spinto in fondo).
- **Icona Profilo personalizzabile**: caricamento di un'immagine per ciascun Profilo (salvata
  come data URL), mostrata al posto dell'icona generica sia nell'elenco Profili sia in nav.

## v0.21-001 — Profili: isolamento completo tra utenze diverse

### Aggiunto
- **Profili**: crea, rinomina, elimina e cambia Profilo — confermato dall'utente: anche
  rinominare ed eliminare, cambio con ricaricamento pagina (più semplice e sicuro di un cambio
  "a caldo" senza reload).
- **Isolamento garantito a livello di database, non di filtro applicativo**: ogni Profilo ha il
  proprio database IndexedDB fisicamente separato (nomi diversi). Non è un campo "profiloId" su
  ogni record — è un database diverso. Due Profili non possono interagire tra loro nemmeno per
  errore in una query dimenticata, perché non condividono alcuna base dati.
- **Migrazione trasparente**: il database esistente prima di questa versione diventa
  automaticamente il primo Profilo ("Predefinito", rinominabile subito da "Profili") — nessun
  dato perso, nessuna azione richiesta al primo avvio.
- **Nuovo registro separato** (`js/profili.js`): un database IndexedDB dedicato, minuscolo e dal
  nome fisso, che elenca i Profili e traccia quale è attivo — completamente indipendente dai
  database dei singoli Profili (mai lo stesso database del registro e quello dei dati).
- **Icona Profilo** (persona) accanto all'icona Impostazioni (ingranaggio) in fondo alla nav,
  come proposto: apre la nuova vista "Profili". Tooltip con il nome del Profilo attivo.
- **Eliminazione di un Profilo**: cancella fisicamente anche il suo database (non solo la voce
  nell'elenco) — dati davvero rimossi, non solo nascosti. Doppia conferma esplicita in UI.
  Bloccata per il Profilo attivo (va cambiato prima) e per l'unico Profilo rimasto.
- `db-schema.js`: `DB_NAME` non è più una costante fissa ma una variabile impostata da
  `impostaNomeDatabase()` all'avvio dell'app, in base al Profilo attivo — `storage.js` non ha
  richiesto alcuna modifica (bind ES module dinamico). Cambiare Profilo richiede un
  ricaricamento della pagina: la connessione al database viene messa in cache al primo utilizzo,
  cambiarla a metà sessione non sarebbe sicuro.
- `domain/backup.js` (esporta/importa configurazione) continua a funzionare invariato: opera
  già sul database correntemente connesso, quindi resta automaticamente per-Profilo.

## v0.20-007 — Correzione: Cicli Budget orfani dopo eliminazione di Budget/Fondo/Conto

### Corretto (critico)
- **Bug segnalato dall'utente**: eliminando tutti i Conti/Fondi/Budget, restavano Cicli Budget
  ("Mese") ancora da chiudere, con un `budgetId` che non corrispondeva più a nessun Budget
  esistente — un TODO di `domain/budget.js` ("bloccare l'eliminazione se esistono budgetCicli
  collegati") non era mai stato implementato: `eliminaBudget` cancellava il Budget senza
  controllare il suo storico di Cicli, lasciandoli orfani.
- **Corretto bloccando l'eliminazione**, stesso principio già in uso per Fondo/Conto (che
  bloccano se contengono Obiettivi/Fondi-Budget): un Budget con almeno un Ciclo collegato (aperto
  o chiuso) non può più essere eliminato. Messaggio esplicito con l'alternativa corretta:
  **disattivarlo** invece di eliminarlo.
- **Aggiunto il modo per disattivare un Budget**: nuovo checkbox "Attivo" nel form Budget — un
  Budget disattivato non genera più un nuovo Ciclo con "Apri Nuovo Ciclo" (il filtro esisteva già
  nel motore, ma non era mai stato esposto in nessuna UI). Badge "Inattivo" in tabella.
- **La Verifica di Integrità Patrimoniale ora rileva questo problema**: nuova categoria "Ciclo
  Budget orfano". In precedenza `eseguiVerificaIntegritaCompleta` non riceveva nemmeno i Cicli
  Budget: il problema segnalato dall'utente non sarebbe mai comparso nella Dashboard.
- **`domain/riparazione.js` ("Ripulisci tutto orfano") aggiornato**: ora ripulisce anche i Cicli
  Budget orfani già esistenti nel database. Corretto anche un bug latente nello stesso file —
  non gestiva `'budget'` come tipo di entità valido, col rischio concreto di **cancellare per
  errore i Trasferimenti di chiusura Ciclo validi** (avanzo/sforamento), scambiati per orfani
  ogni volta che qualcuno avesse eseguito una riparazione. Corretto prima che causasse danni.

## v0.20-006 — Prospetti: modifica di Prospetto/movimenti, punto di partenza personalizzato

### Aggiunto
- **Modifica di un Prospetto già creato**: nuovo pulsante "Modifica" (icona matita) nell'elenco,
  apre lo stesso form della creazione precompilato — non serve più eliminare e ricreare per
  cambiare nome, Scenario, orizzonte o entrata ipotizzata.
- **Modifica di un movimento manuale già aggiunto**: stesso principio, pulsante "Modifica" per
  riga nell'elenco dei movimenti. In modifica non è disponibile l'opzione "Fondo, diviso tra i
  suoi Obiettivi" (si modifica sempre la singola riga già esistente; per cambiare l'intera
  distribuzione, si elimina il gruppo e se ne crea uno nuovo).
- **Punto di partenza personalizzato per Fondi/Obiettivi**, specifico di ciascun Prospetto —
  segnalato dall'utente: vuole "gestire il patrimonio atteso nel modo più realistico possibile",
  con la stessa libertà con cui gestisce quello reale. Ogni riga della proiezione (Fondo o
  Obiettivo) ha ora un'icona "Modifica punto di partenza": imposta un saldo di partenza diverso
  da quello reale, **solo per questo Prospetto** — come una Rettifica, ma puramente simulata: il
  Fondo/Obiettivo reale non viene mai toccato. Un'icona "Ripristina" riporta al saldo reale.
  Pulsanti dedicati permettono di personalizzare anche un Fondo/Obiettivo che altrimenti non
  comparirebbe nella tabella (perché non riceve nulla da Scenario o movimenti).
- `domain/prospetti.js`: nuove `aggiornaProspetto`, `aggiornaMovimentoProspetto`,
  `impostaSaldoPartenzaProspetto`, `rimuoviSaldoPartenzaProspetto`, `elencoSaldiPartenzaProspetto`.
  Riusano ancora `prospettoElementi`, ora distinguendo `categoria: 'movimento'` da
  `categoria: 'overrideSaldo'` (retrocompatibile: le righe già esistenti, prive del campo,
  restano trattate come movimenti). Nessuna modifica allo schema IndexedDB.

## v0.20-005 — Prospetti: Piano facoltativo, movimenti manuali distribuibili tra Obiettivi

### Aggiunto
- **Prospetto senza Scenario**: il Piano è ora facoltativo in fase di creazione ("Nessuno — solo
  movimenti manuali"). Un Prospetto può basarsi esclusivamente sui propri movimenti manuali,
  senza alcuno Scenario collegato — segnalato dall'utente. Se non c'è uno Scenario, il campo
  "Entrata ipotizzata per ciclo" scompare (non ha senso senza nulla da allocare).
- **Movimenti manuali distribuibili tra gli Obiettivi di un Fondo**: oltre a "un Obiettivo" e
  "un Fondo (intero)", la destinazione di un movimento manuale può ora essere "un Fondo, diviso
  tra i suoi Obiettivi" — stessa UX già introdotta in Piano→"Collega Movimenti" (selezione degli
  Obiettivi che interessano, Strategia Equa/Proporzionale/Manuale, tabella con importi
  modificabili prima di confermare). Il risultato sono più righe indipendenti (una per
  Obiettivo), raggruppate da un `gruppoId` condiviso per poterle riconoscere ed **eliminare
  insieme** con un pulsante dedicato, oltre a poter comunque eliminare una singola riga.
- `domain/prospetti.js`: nuove `aggiungiMovimentiProspettoMultipli` ed
  `eliminaGruppoMovimentiProspetto`; `creaProspetto`/`calcolaProiezioneProspetto` aggiornati per
  gestire l'assenza di Piano.

## v0.20-004 — Prospetti: movimenti manuali (ripetitivi o singoli)

### Aggiunto
- **Movimenti manuali** nel Prospetto, oltre allo Scenario (Piano): eventi ipotizzati
  dall'utente, con un esempio concreto che ha guidato la progettazione ("ogni 2 del mese
  entrano 20€, il 16 ottobre ne servono 499"). Due tipi:
  - **Ripetitivo**: si applica una volta per ogni ciclo proiettato (il giorno del mese indicato
    è solo indicativo — la proiezione ragiona per cicli/mesi, non giorno per giorno).
  - **Singolo**: si applica una sola volta, nel ciclo in cui cade la sua data rispetto a oggi.
    Se la data cade oltre l'orizzonte del Prospetto, resta segnalato ("fuori orizzonte") invece
    di essere applicato silenziosamente o di allungare la proiezione.
- Ogni movimento ha un importo (positivo = entrata, negativo = uscita) e una destinazione
  (Fondo o Obiettivo, come le Voci di Piano) — nessuna sorpresa se il risultato va in negativo:
  è proprio l'informazione utile ("se prelevi 499€ il 16 ottobre, a quel punto il Fondo andrebbe
  sotto zero"), quindi non viene mai forzato a zero.
- Gestiti dal dettaglio di ciascun Prospetto: elenco, aggiunta, eliminazione. Riusano lo store
  `prospettoElementi`, predisposto fin dalla Fase 0 e già indicizzato per `prospettoId` — sembra
  pensato esattamente per questo. Nessuna modifica allo schema IndexedDB.
- `engine/prospettoCalc.js`: la logica di applicazione importo→Fondo/Obiettivo (già usata per
  le Voci di Piano) è stata estratta in un helper condiviso e riusata anche per i movimenti
  manuali, nessuna duplicazione.

## v0.20-003 — Correzione: perdita di focus sull'Importo totale (divisione Fondo→Obiettivi in Collega Movimenti)

### Corretto
- **Bug segnalato dall'utente** (già visto in altre parti dell'app): nel nuovo blocco di
  divisione Fondo→Obiettivi di "Collega Movimenti" (Piano), l'input "Importo totale da
  dividere" perdeva il focus a ogni carattere digitato. Causa: l'evento `input` ricostruiva
  l'intero blocco HTML, compreso l'input stesso che aveva appena generato l'evento.
- Corretto separando la costruzione della struttura (fatta una sola volta, o ai cambi di
  Strategia/selezione Obiettivi — eventi discreti, non in corso di digitazione) dall'aggiornamento
  dei soli valori calcolati nelle celle Importo, che ora avviene senza toccare il DOM
  dell'input attivo — stesso principio già in uso per le barre di ricerca in tutte le altre
  viste (l'elemento che genera l'evento resta sempre fuori dalla zona rigenerata).

## v0.20-002 — Piano: "Collega Movimenti" ora include i Fondi, con divisione tra i loro Obiettivi

### Aggiunto
- **"Collega Movimenti"** (in Piano) ora permette di selezionare anche un **Fondo**, oltre a
  Budget e Obiettivi. Selezionando un Fondo che ha Obiettivi, si apre una sezione per scegliere
  quali Obiettivi interessano e come dividere un importo totale tra loro, con le stesse
  strategie già usate nei movimenti (Equa, Proporzionale per Importo Target, Manuale) — riusa
  `calcolaPropostaEqua`/`calcolaPropostaProporzionale`, nessuna logica di allocazione duplicata.
  Il risultato è una Voce di Piano indipendente per ciascun Obiettivo selezionato (mai una Voce
  "Fondo" quando si dividono i suoi Obiettivi).
- **Resta sempre possibile collegare un Fondo senza Obiettivi** (un campo importo singolo,
  poiché non esiste un valore di default sensato per un Fondo intero) e **collegare un singolo
  Obiettivo indipendente**, come già in precedenza — nessuna delle due strade preesistenti è
  stata rimossa.
- `domain/piano.js: collegaMovimenti` esteso con l'elemento `{ tipo: 'fondo', id, valore }` e
  con un `valore` opzionale su `{ tipo: 'obiettivo', ... }` per sovrascrivere l'importo mensile
  consigliato calcolato automaticamente (usato quando l'importo di un Fondo viene diviso
  manualmente tra i suoi Obiettivi). Compatibile con le chiamate precedenti.

### Non incluso in questa modifica
- La "Nuova Voce manuale" (creazione di una singola Voce a mano) resta invariata: destinazione
  singola, nessuna divisione multi-Obiettivo. La richiesta riguardava specificamente "Collega
  Movimenti"; se serve la stessa divisione anche lì, è un'estensione separata.

## v0.20-001 — Fase 4: Prospetti

### Aggiunto
- **Prospetto**: simulazione che proietta la crescita di Fondi e Obiettivi applicando
  ripetutamente le Voci di uno Scenario (Piano) a un'entrata ipotizzata costante, ciclo dopo
  ciclo, su un orizzonte a scelta dell'utente. Confermato dall'utente: proiezione **e**
  confronto tra più Prospetti; orizzonte **sia** a numero di mesi **sia** a data specifica,
  scelto in fase di creazione; Scenario scelto **di volta in volta** per ogni Prospetto (non
  necessariamente quello predefinito).
- **"Non modifica alcun dato"**: il Prospetto salva solo la propria configurazione (nome,
  Scenario, orizzonte, entrata ipotizzata per ciclo). Il calcolo della proiezione è sempre
  ricalcolato dal vivo a partire dai saldi *attuali* di Fondi/Obiettivi — mai persistito, stessa
  filosofia di calcolo dinamico già usata per Obiettivi/Fondi (§2.5/§5.7 FDD). Riaprendo lo
  stesso Prospetto in un altro momento, la proiezione riparte sempre dalla situazione reale di
  quel momento, non da un valore congelato.
- **Ambito della proiezione**: solo Fondi e Obiettivi (ciò che "cresce nel tempo" nel modello).
  Budget e Conto come destinazione di una Voce di Piano non vengono proiettati: non hanno un
  concetto di crescita accumulata nel tempo (il Budget si consuma e si riassegna ogni ciclo).
- **Confronto tra Prospetti**: selezione multipla nell'elenco (checkbox) e pulsante "Confronta
  selezionati" — tabella con un Fondo per riga e un Prospetto per colonna, valore proiettato a
  confronto diretto.
- Nuovo motore puro `engine/prospettoCalc.js: calcolaProiezione` (riusa `calcolaRichiestaDaPiano`
  già esistente, nessuna logica di allocazione duplicata) e nuovo dominio `domain/prospetti.js`.
- Nuova vista **Prospetti**, terza tab dentro "Strategia & Report" (accanto a Piano e
  Consuntivi), stesso linguaggio visivo delle altre viste.
- Nessuna modifica allo schema IndexedDB: lo store `prospetti` (predisposto fin dalla Fase 0)
  viene finalmente usato; lo store `prospettoElementi`, anch'esso predisposto, resta **non
  utilizzato** in questa versione (nessuna selezione granulare di quali Conti/Fondi includere:
  la proiezione segue semplicemente le Voci dello Scenario scelto). Se serve una selezione più
  fine in futuro, si può aggiungere senza migrazioni.

## v0.19-003 — Consuntivo: Assegnato corretto e controparte tracciata; scorciatoie di chiusura; avviso diagnostico

### Corretto (critico)
- **Segnalato dall'utente**: nel Consuntivo (e nello Storico Cicli), un Budget con sforamento
  coperto da un Fondo mostrava un "Assegnato" pari a Budget+sforamento (o, in caso di avanzo
  trasferito, Budget-avanzo) — perché il campo veniva letto DOPO il movimento di chiusura, che
  aggiorna anche l'importoAssegnato del Ciclo per azzerarne internamente il residuo. Corretto:
  `chiudiCiclo` ora fotografa l'Assegnato **prima** di generare il movimento di chiusura, e
  quello resta il valore salvato e mostrato. Il **Residuo** mostrato è ora quello originale
  (quanto realmente avanzato o sforato), non più azzerato dal movimento.

### Aggiunto
- **Controparte tracciata esplicitamente**: quando il residuo genera un movimento (avanzo
  trasferito, sforamento coperto), il Ciclo chiuso registra ora anche tipo e nome del Fondo/
  Obiettivo usato (`controparteTipo`, `controparteNome`, congelati al momento della chiusura,
  indipendenti da modifiche future). Compare come nuova colonna "Controparte" sia nello Storico
  Cicli sia nel dettaglio Budget del Consuntivo — così è sempre chiaro, leggendo una riga, cosa
  è successo: Assegnato, Utilizzato, Avanzo/Sforamento, Esito, e con chi.
- **Scorciatoie per la chiusura**, per singola voce e per tutte insieme (campo sempre
  modificabile dopo):
  - **"Tutto speso (€ X)"** accanto a ogni voce: compila "quanto hai speso" con la disponibilità
    del Budget (assegnato + riporto), cioè nessun residuo.
  - **"Valorizza tutti a budget"**, visibile in modalità "Chiudi tutti i Cicli": applica la
    stessa scorciatoia a tutte le voce in un colpo solo.
- **Avviso diagnostico per "Nuovo Consuntivo"**: il pulsante resta sempre cliccabile (non più
  disabilitato in silenzio); se non ci sono periodi pronti, un messaggio spiega perché — nessun
  Ciclo mai aperto, oppure un periodo con ancora N Cicli aperti da chiudere (con le date),
  oppure tutti i periodi chiusi hanno già un Consuntivo.

### Compatibilità
- I Cicli già chiusi prima di questa correzione mantengono l'Assegnato "gonfiato/sgonfiato" già
  salvato (non ricalcolabile retroattivamente senza conoscere il valore originale). Riaprendo e
  richiudendo un Ciclo con questa versione, i nuovi valori saranno corretti.

## v0.19-002 — Chiusura Ciclo: la controparte può essere anche un Obiettivo, non solo il Fondo

### Modificato
- **"Trasferisci a un Fondo" / "Copri con un Fondo"** in chiusura Ciclo (singola e bulk) ora
  permettono di scegliere, oltre al Fondo nel suo complesso, anche un **Obiettivo specifico**
  di un Fondo — segnalato dall'utente: ha senso indirizzare un avanzo direttamente su un
  obiettivo di risparmio, o coprire uno sforamento prelevando da un obiettivo specifico invece
  che dal saldo generale del Fondo.
- **La regola sul Conto reale resta identica indipendentemente dalla scelta**: si muove sempre
  e solo il Conto del Fondo coinvolto (anche quando la controparte diretta è un suo Obiettivo,
  il Conto movimentato è quello del Fondo a cui l'Obiettivo appartiene) — mai quello del Budget.
- `domain/trasferimenti.js: creaMovimentoChiusuraCiclo` accetta ora `tipoControparte`
  ('fondo'|'obiettivo') e `controparteId` invece del solo `fondoId`; `domain/budgetCicli.js:
  chiudiCiclo` ha la stessa estensione nella propria firma. Nessuna modifica allo schema
  IndexedDB.

## v0.19-001 — Correzione critica: avanzo/sforamento di Ciclo Budget, movimentazione reale asimmetrica

### Corretto (critico)
- **Bug segnalato dall'utente**: chiudendo un Ciclo Budget con residuo (avanzo trasferito a un
  Fondo, o sforamento coperto da un Fondo), la Dashboard mostrava "Trasferimento sbilanciato:
  l'origine non esiste più". Causa: `engine/integrityCheck.js` non riconosceva `'budget'` come
  tipo valido di origine/destinazione di un Trasferimento (lo confondeva con un riferimento
  rotto). Corretto: ora verifica correttamente l'esistenza del Budget.
- **Correzione concettuale più profonda, anch'essa segnalata dall'utente**: un Budget non
  detiene mai patrimonio reale — il denaro che "aveva a disposizione" è virtualizzato fin
  dall'Entrata che lo ha generato e non risiede realmente sul suo Conto (tipicamente un Conto
  "Spesa", che deve restare sempre a zero). Il vecchio codice, riusando il motore generico di
  Trasferimento, in certi casi avrebbe mosso denaro reale anche sul Conto del Budget (violando
  "un Conto Spesa resta sempre a zero" se Budget e Fondo vivono su Conti diversi).
- **Nuova logica dedicata** (`domain/trasferimenti.js: creaMovimentoChiusuraCiclo`,
  `stornaMovimentoChiusuraCiclo`), usata da `chiudiCiclo`/`riapriCiclo` al posto del
  Trasferimento generico: il saldoReale del Conto del **Fondo** viene sempre aggiornato
  (+avanzo ricevuto, -sforamento coperto: è di fatto una vera Entrata/Uscita patrimoniale), il
  saldoReale del Conto del **Budget** non viene mai toccato, indipendentemente dal fatto che
  coincida o meno con quello del Fondo.

### Aggiunto
- **Tracciabilità esplicita**: questi movimenti sono ora marcati con `causaleCiclo` ('avanzo' |
  'sforamento') e compaiono nel Registro Movimenti con un badge ben visibile **AVANZO** /
  **SFORAMENTO** e una descrizione dedicata ("AVANZO BUDGET: ..." / "SFORAMENTO BUDGET: ...") —
  cercabile e contabile dalla barra di ricerca del Registro per verificare a fine anno (o
  quando serve) quante volte si è sforato o avanzato.
- **Non stornabili manualmente** dal Registro Movimenti (icona Storna nascosta per queste
  righe): l'unico modo corretto di annullarli è **"Riapri Ciclo"** (in Mese/Ciclo Budget), che
  tiene sincronizzato anche lo stato del Ciclo — uno Storno diretto scollegato dalla riapertura
  lascerebbe il Ciclo "chiuso" con gli effetti reali già annullati, uno stato incoerente.
  (Restano comunque eliminabili con l'eliminazione diretta "senza storno", stesso strumento di
  pulizia già esistente per dati rotti.)
- Corretta anche una lacuna preesistente in `ui/viewMovimenti.js`: le funzioni che risolvono il
  nome del Conto e l'etichetta di un'origine/destinazione di Trasferimento non gestivano il
  tipo `'budget'` (mostravano "Conto eliminato" ed etichette mancanti per qualunque
  Trasferimento Budget↔Fondo, non solo quelli di chiusura Ciclo).

### Compatibilità
- Un Trasferimento di chiusura Ciclo creato **prima** di questa correzione non ha il campo
  `causaleCiclo` (creato con il vecchio motore generico). "Riapri Ciclo" lo riconosce e lo
  storna con il motore con cui era stato creato, invece di applicargli la nuova logica
  asimmetrica — evita di correggere in modo scorretto un movimento già registrato con regole
  diverse. Resta comunque stornabile manualmente dal Registro Movimenti (come lo era prima):
  solo i movimenti creati da qui in avanti nascondono lo Storno manuale.

## v0.18-002 — Tab uniformate alla nav + favicon

### Modificato
- **Le tab secondarie** (Conti→Fondi/Budget, Strategia & Report→Piano/Consuntivi) hanno ora
  **esattamente lo stesso aspetto della nav principale**: pillola, gradiente viola quando
  attiva, stesso hover — richiesto dall'utente per coerenza visiva piena tra i due livelli di
  navigazione. Rimossa la distinzione a colore verde/indaco che avevo introdotto inizialmente
  (accento Patrimonio/Operatività): la richiesta esplicita di uniformità con la nav prevale.

### Aggiunto
- **Favicon**: nuova icona per la scheda del browser (`assets/favicon.svg`), quadrato
  arrotondato con lo stesso gradiente viola già usato per gli elementi attivi di nav/tab, "€"
  bianco al centro. Collegata in `index.html` (`<link rel="icon" type="image/svg+xml" ...>`).

## v0.18-001 — Riorganizzazione della navigazione

### Modificato
- **Nav principale ridotta da 9 a 4 voci** (+ icona Impostazioni): Dashboard, Movimenti, Conti,
  Strategia & Report, e l'icona a ingranaggio in fondo alla barra per Impostazioni.
- **Conti**: sotto la tabella dei Conti, nuova sotto-sezione a tab **Fondi | Budget** (accenti
  colore verde/indaco mantenuti sulle tab stesse, per non perdere la separazione visiva
  Patrimonio/Operatività). Fondi e Budget non sono più viste a sé nella nav.
- **"Mese" (ex "Ciclo Budget")**: non è più una tab dedicata. Si raggiunge con un pulsante
  dentro la tab Budget ("Mese (Ciclo Budget)"), con un link "← Torna a Conti / Budget" in cima
  per tornare indietro — stesso pattern già usato per "Registra Entrata" e simili (vista
  raggiungibile ma non in nav).
- **Impostazioni** (icona ingranaggio, angolo destro della nav): per ora contiene solo
  Categorie. Nessuna tab interna finché è l'unica voce (una barra di tab con un solo elemento
  non aiuta né la leggibilità né l'accessibilità) — pronta ad accogliere altre impostazioni in
  futuro con lo stesso meccanismo di tab già costruito.
- **"Strategia & Report"** (nuova sezione, nome scelto dall'utente): raggruppa **Piano** e
  **Consuntivi** come tab. I futuri **Prospetti** (Fase 4) e **Indicatore di Salute
  Finanziaria** (Fase 5) si aggiungeranno qui come ulteriori tab, senza nuove voci in nav.
- Nota "Fase attuale" in Dashboard e sottotitolo in `index.html`, ormai disallineati (fermi alla
  Fase 2), aggiornati a Fase 3.

### Aggiunto
- **`utils/tabsUtils.js`**: componente condiviso per barre di tab accessibili (pattern ARIA
  "tabs" — `role="tablist"`/`"tab"`/`"tabpanel"`, roving tabindex, navigazione da tastiera con
  frecce ←/→ e Home/End), un solo punto di implementazione riusato da Conti e da Strategia &
  Report, per garantire lo stesso comportamento ovunque.
- **`ui/sezioneStrategiaReport.js`** e **`ui/viewImpostazioni.js`**: nuove viste composite che
  montano le viste esistenti (Piano, Consuntivi, Categorie) dentro un contenitore comune, senza
  duplicarne la logica interna.

### Architettura
- **Confermata la scelta di restare su un solo `index.html`** (mono-pagina, SPA con router via
  JS) invece di dividere il progetto in più file HTML: con IndexedDB e nessun bisogno di
  SEO/caricamento server-side, il multi-pagina avrebbe solo moltiplicato il markup da mantenere
  allineato (head, script, nav) senza benefici concreti.
- Corretti in `viewPiano.js` due riferimenti hardcoded a `document.querySelector('#contenuto')`
  che avrebbero rotto l'annidamento nei tab (avrebbero ri-renderizzato l'intera pagina invece
  del solo pannello di Piano dentro Strategia & Report). Nessuna vista possiede più il proprio
  container per hardcoding: tutte ricevono e riusano il container passato dal chiamante,
  requisito ora implicito per qualunque vista montabile dentro una tab.
- Nessuna modifica allo schema IndexedDB, nessuna modifica ai domini (`js/domain/*`): questa è
  una riorganizzazione puramente di navigazione/composizione delle viste esistenti.

## v0.17-001 — Fase 3: Consuntivo

### Aggiunto
- **Consuntivo**: fotografia reale e immutabile di fine periodo. A differenza di Budget/Fondi/
  Obiettivi (entità vive, sempre ricalcolate a runtime), il Consuntivo è una **copia congelata**
  di nomi e importi al momento della creazione — nessun riferimento vivo alle entità di origine,
  coerente con "non modificabile da Piano successivo". Non è patrimonio né operatività: resta
  fuori dalla formula di coerenza patrimoniale (§5.20), è solo un report storico.
- **Cosa fotografa** (decisione confermata dall'utente: tutto): per ogni Budget del periodo,
  assegnato/riporto/utilizzato/residuo/esito; per ogni Fondo esistente, saldo e avanzamento
  Obiettivi complessivo; per ogni Obiettivo, accumulato/target/scadenza/percentuale.
- **Quando si genera** (confermato: entrambe le modalità):
  - **Proposta automatica**: quando tutti i Cicli Budget di un periodo sono chiusi e quel
    periodo non ha ancora un Consuntivo, la vista "Ciclo Budget" mostra un pulsante "Genera
    Consuntivo per questo periodo".
  - **Manuale**: nuova vista **Consuntivi** in navigazione, con "Nuovo Consuntivo" e scelta del
    periodo tra quelli completamente chiusi e non ancora fotografati.
- **Vincolo**: un Consuntivo richiede che TUTTI i Cicli Budget del periodo scelto siano chiusi
  (mai una fotografia parziale); non è possibile generarne due per lo stesso periodo (va prima
  eliminato quello esistente).
- **Vista Consuntivi**: elenco tabellare ordinabile/filtrabile (Periodo, Creato il, Note),
  dettaglio espandibile con tre tabelle (Budget, Fondi, Obiettivi annidati per Fondo) — stesso
  linguaggio visivo di Conti/Fondi/Budget/Piano/Movimenti/Categorie.
- **Eliminazione** (confermato: con doppia conferma esplicita, come "Pulisci Registro"):
  eliminazione diretta (non è un movimento, non serve uno Storno), irreversibile.
- Nuovo dominio `domain/consuntivi.js`: `creaConsuntivo`, `elencoConsuntivi`,
  `ottieniDettaglioConsuntivo`, `eliminaConsuntivo`, `elencoPeriodiSenzaConsuntivo`.
- Nuovo store IndexedDB `consuntivoObiettivoRighe` (mancava tra quelli predisposti in Fase 0,
  necessario per il dettaglio Obiettivi): migrazione additiva, `DB_VERSION` 3→4. Gli store
  `consuntivi` e `consuntivoBudgetRighe`/`consuntivoFondoRighe`, già predisposti, sono ora
  effettivamente utilizzati. `domain/backup.js` (export/import) li copre già automaticamente,
  perché itera dinamicamente su tutti gli store dello schema.

## v0.16-002 — Categorie tabellare + uniformazione completa delle fa-icons

### Modificato
- **Vista Categorie**: le due liste (Obiettivo, Budget), finora elenchi puntati (`<ul>`), sono
  ora tabelle ordinabili (Nome, Ordinamento) e filtrabili per testo, con azioni a icona —
  stesso trattamento di Conti/Fondi/Budget/Piano/Movimenti (`utils/listaUtils.js`).
- **Uniformazione fa-icons** (segnalato dall'utente, che ha sistemato l'ultima icona rimasta in
  Dashboard): sostituiti tutti i restanti simboli testuali usati come icone di azione con
  Font Awesome, per coerenza totale in tutta l'app:
  - Obiettivi annidati in un Fondo: Modifica (✎→`fa-pen`), Elimina (✕→`fa-trash`), "+ Nuovo
    Obiettivo" (`fa-plus`).
  - Righe di "Registra Entrata" e "Distribuisci Disponibile": rimuovi riga (✕→`fa-trash`),
    "+ Aggiungi riga" (`fa-plus`).
  - **Indicatori di ordinamento delle colonne** (▲▼), usati da ogni tabella ordinabile
    dell'app: convertiti in `fa-caret-up`/`fa-caret-down` in `utils/listaUtils.js` — un solo
    punto di modifica, effetto su tutte le viste tabellari.
  - Nota descrittiva in Registro Movimenti allineata (menzionava ancora il vecchio simbolo ✕).
- **Non toccati** (per non eccedere la richiesta): i simboli ✓/⚠️ usati come semplice
  decorazione testuale inline in messaggi di conferma/errore (es. "Rettifica registrata ✓",
  "⚠️ Entrata insufficiente") — non sono icone di un pulsante, ma testo discorsivo. Se li vuoi
  convertiti anche quelli, basta chiederlo.

## v0.16-001 — Riapertura Ciclo Budget (singola o tutte)

### Aggiunto
- **Riapertura di un Ciclo Budget chiuso**, richiesta esplicita dell'utente: prima si poteva
  solo attendere l'apertura del periodo successivo per riavere la disponibilità di un Budget
  chiuso per errore o troppo presto.
  - **Singola**: nuova azione "Riapri Ciclo" (icona lucchetto aperto) su ogni riga chiusa
    riapribile, nella sezione Storico Cicli di "Ciclo Budget".
  - **Tutti**: pulsante "Riapri tutti i Cicli riapribili", visibile solo quando esiste almeno un
    Ciclo riapribile — stesso spirito di "Chiudi tutti i Cicli".
- **Quando è consentita**: solo se, per quel Ciclo, non è ancora stato aperto un periodo
  successivo (per nessun Budget: il periodo è globale). Se un nuovo periodo è già stato aperto,
  riaprire un Ciclo del periodo precedente creerebbe una sovrapposizione nella cronologia — non
  consentito, coerente col vincolo già esistente "nessuna sovrapposizione né buchi" di apertura
  Ciclo.
- **Reversibilità tracciata, mai un annullamento silenzioso**: se la chiusura aveva generato un
  vero Trasferimento (residuo positivo trasferito a un Fondo, o sforamento coperto da un Fondo),
  la riapertura lo **storna** con il normale meccanismo di Storno già esistente (`domain/storni.js`):
  il Trasferimento originale resta nel Registro Movimenti, marcato come stornato, con il proprio
  Storno collegato — nessuna cancellazione, nessuna modifica silenziosa di un movimento storico.
  Se invece la chiusura non aveva generato alcun Trasferimento (mantieni/libera/riporta/usa
  liquidità), la riapertura si limita a ripristinare lo stato "aperto" del Ciclo.
- Nuovo campo tecnico `trasferimentoChiusuraId` sul Ciclo Budget (riferimento al Trasferimento
  generato in chiusura, se presente): necessario per sapere cosa stornare in fase di riapertura.
  **Compatibilità additiva**: i Cicli già chiusi prima di questa versione non hanno questo
  riferimento — se la loro chiusura aveva generato un Trasferimento, la riapertura automatica
  viene bloccata con un messaggio esplicito, invece di rischiare un ripristino incompleto o
  scorretto dei saldi.
- Nuove funzioni in `domain/budgetCicli.js`: `elencoCicliRiapribili`, `riapriCiclo`,
  `riapriTuttiICicli`. Nessuna modifica allo schema IndexedDB (il nuovo campo è additivo, non
  richiede migrazione di versione).

## v0.15-003 — Piano: elenco tabellare (via richiesta utente, pre-Fase 3)

### Modificato
- **Vista Piano**: l'elenco degli Scenari non usa più la card `.scheda-fondo` (pensata per il
  Patrimonio, con la barra verde in alto) — segnalato dall'utente come fuorviante per il Piano,
  che non è patrimonio. L'elenco è ora una `<table class="tabella">` ordinabile (Nome,
  Predefinito) e filtrabile per testo, con riga espandibile per "Voci e simulazione" — stesso
  trattamento già in uso in Conti/Fondi/Budget/Movimenti (`utils/listaUtils.js`).
- Pulsanti azione della riga (Imposta predefinito, Voci e simulazione, Elimina) convertiti in
  pulsanti a icona (`btn-icona` + Font Awesome), coerenti con lo standard già in uso nelle altre
  viste.
- **Simulazione**: il riepilogo ora mostra anche il **Totale allocato** (somma delle Voci
  calcolate), non solo il residuo non allocato o l'eventuale importo mancante.

### Nota
- Nessuna modifica allo schema IndexedDB, nessuna modifica ad altre viste. Riapertura di un
  Ciclo Budget chiuso: **non ancora implementata** — confermato all'utente, in attesa di
  decisione su quando pianificarla.

## v0.15-002 — Correzione: il Conto di arrivo di un'Entrata, se è "Spesa", non deve mai variare

### Corretto (critico)
- Segnalato dall'utente: la protezione "un Conto Spesa non modifica mai il saldo" era stata
  applicata solo ai Conti di **destinazione** delle righe di un'Entrata, non al Conto di
  **arrivo** dell'Entrata stessa (quello scelto al passo 1 di "Registra Entrata"). Se quel
  Conto era di tipo Spesa, veniva comunque accreditato per l'intero importo.
- Corretto in `domain/allocazioni.js`, sia in conferma sia in storno: se il Conto di arrivo è
  di tipo "Spesa", l'intero movimento reale sui Conti per quell'Entrata viene saltato (nessun
  Conto viene toccato, nemmeno quello di arrivo). Gli effetti su Fondi/Obiettivi restano
  comunque regolari, perché indipendenti dal tracciamento dei Conti.
- **Limite noto**: nel caso limite in cui il Conto di arrivo sia Spesa e contemporaneamente
  alcuni Fondi coinvolti vivano su Conti reali diversi da esso, quei Conti non vengono
  accreditati (l'intero movimento viene saltato). Segnalazione aperta per un eventuale
  raffinamento futuro.

## v0.15-001 — Conto Spesa mai movimentato, tabella Budget/Conto, export CSV, Piano esteso ai Conti

### Corretto (critico)
- **Segnalazione dell'utente rimasta in sospeso**: una destinazione Budget in un'Entrata non
  deve mai creare patrimonio reale — solo indicare "lascia/sposta X qui". Non era stato ancora
  implementato: corretto ora in `domain/allocazioni.js`, sia in conferma sia in storno.
- **Conto di tipo "Spesa": il saldo non si muove mai**, nemmeno tramite Entrata o Trasferimento
  verso quel Conto. L'istruzione operativa resta comunque visibile ("sposta X verso quel
  Conto") come semplice indicazione, ma nessun saldo reale viene toccato: il denaro resta, nel
  modello, sul Conto di origine. Bloccato direttamente anche il Trasferimento diretto verso un
  Conto Spesa (operazione singola, sicura da bloccare in modo atomico).

### Aggiunto
- **Dashboard, "Budget assegnato per Conto"**: ora in formato tabellare (Conto + totale), con
  riga di dettaglio espandibile che mostra le singole voci che compongono il totale — come
  richiesto, coerente con il trattamento già usato per Fondi/Conti/Budget.
- **Esporta Registro (CSV)** nel Registro Movimenti: scarica l'intero storico (non solo le
  righe filtrate a video) in un file CSV, apribile in Excel/Numeri/Fogli Google.
- **Piano**: le Voci possono ora avere come destinazione anche un **Conto** (non solo Fondo,
  Budget, Obiettivo) — utile per scenari che prevedono di spostare direttamente denaro verso un
  altro Conto. Aggiunto anche un campo **Note** libero su ogni Voce.
- Il motore di Allocazione ora riconosce righe con destinazione diretta "Conto" (necessario per
  usare queste nuove Voci di Piano in "Registra Entrata" tramite la strategia "Da Piano"), sia
  nella UI di aggiunta manuale riga sia nella risoluzione del movimento reale sui Conti.

## v0.14-004 — Data e ora nei Movimenti (cronologia corretta)

### Aggiunto
- I form di Registra Entrata, Uscita, Trasferimento e Rettifica ora chiedono **data e ora**
  (non solo la data), precompilata con l'istante corrente. Il Registro Movimenti mostra
  entrambe. Prima, più movimenti nello stesso giorno risultavano tutti "a mezzanotte" una volta
  convertiti in ISO, rendendo l'ordinamento cronologico ambiguo tra movimenti dello stesso
  giorno; ora l'ordine riflette davvero la sequenza reale.

## v0.14-003 — Tipologia Conto: Risparmio o Spesa, con vincolo di saldo

### Aggiunto
- **"Tipologia" del Conto** diventa una scelta fissa — Risparmio o Spesa — invece di testo
  libero (evoluzione esplicita rispetto al FDD originale, dove la tipologia era puramente
  organizzativa). Un Conto **Spesa non può avere un saldo diverso da zero**.
- Il vincolo blocca direttamente i casi sicuri da bloccare in modo atomico: creazione del
  Conto, cambio di tipologia su un Conto esistente, e Rettifica diretta su quel Conto.
- Per qualunque altro percorso che potesse comunque produrre un saldo diverso da zero su un
  Conto Spesa (es. attraverso un'Allocazione o un Trasferimento, dove bloccare a metà
  rischierebbe di lasciare un'operazione incoerente), la **Verifica di Integrità
  Patrimoniale** lo segnala esplicitamente con una nuova categoria "Conto Spesa con saldo".
- Corretto anche un messaggio residuo nella Verifica di Integrità che citava ancora il Budget
  nella formula, refuso rimasto dalla precedente correzione.

## v0.14-002 — Il Budget esce di nuovo dalla formula patrimoniale + fix tolleranza somme

### Corretto (critico)
- **Ripristinato definitivamente**: Saldo Conto = Fondi + Liquidità non allocata, **senza
  Budget**. Il Budget non è mai patrimonio, in nessun momento — nemmeno con un Ciclo aperto.
  Lo diventa solo quando, a chiusura ciclo, un avanzo (o una copertura di sforamento) genera un
  vero Trasferimento verso/da un Fondo: da quel momento è un movimento tracciato su un Fondo,
  non più "Budget" nella formula. La sezione "Budget assegnato per Conto" in Dashboard resta,
  ma è ora esplicitamente informativa e separata dalla Verifica di Integrità Patrimoniale.
- **Bug**: modificare un Obiettivo (es. la scadenza) poteva far apparire un errore assurdo tipo
  "il saldo accumulato (1155.0000000000002) supererebbe il saldo del Fondo (1155)" — pur non
  avendo toccato alcun importo. Causa: sommare più valori già puliti a 2 decimali (es. 385.00 +
  385.00 + 385.00) può comunque produrre un residuo infinitesimale in virgola mobile, e i
  controlli di coerenza tra Obiettivi e Fondo (`domain/obiettivi.js`, `domain/fondi.js`)
  confrontavano quel valore grezzo, senza tolleranza. Corretto in entrambi i punti.

## v0.14-001 — Chiusura Ciclo multipla, Impostazioni espandibili, Piano → Scenario Finanziario

### Aggiunto — Ciclo Budget
- **"Chiudi tutti i Cicli"**: mostra tutti i Budget con ciclo aperto fianco a fianco, ciascuno
  con il proprio campo "quanto hai speso" e il proprio assistente per il residuo; un'unica
  conferma chiude tutti quelli compilati, segnalando quali restano incompleti.
- **Impostazioni Ciclo espandibili**: nascoste di default dietro "Modifica impostazioni", per
  evitare modifiche accidentali alla modalità globale (mese solare/custom).

### Rivisto — Piano → Scenario Finanziario
- Il Piano è ora concettualmente uno **Scenario Finanziario**: una strategia di distribuzione
  delle entrate future, non un elenco di movimenti. Non contiene denaro, non modifica saldi.
- **"Collega Movimenti"**: seleziona Budget e Obiettivi esistenti e crea automaticamente una
  Voce di Piano per ciascuno (copiando nome/importo previsto iniziale). Il collegamento è solo
  un riferimento logico (`collegamentoTipo`/`collegamentoId`) per tracciabilità: la Voce creata
  resta poi completamente indipendente e modificabile, senza mai alterare l'originale.
- **Nessun vincolo di esclusività tra Scenari**: "attivo" resta solo la preferenza di default
  preselezionata nei menu, ma ogni Scenario è sempre utilizzabile, sia per registrare Entrate
  reali sia solo per simulare. In "Registra Entrata" e "Distribuisci Disponibile", la strategia
  "Da Piano" ora mostra un selettore per scegliere esplicitamente quale Scenario usare, invece
  di applicare sempre e solo quello predefinito.
- **Limite noto**: in "Ridistribuisci Liquidità" le due scorciatoie "Da Piano" (a livello Fondi
  e Obiettivi) usano ancora automaticamente lo Scenario predefinito, senza selettore esplicito —
  aggiornamento rimandato a una prossima richiesta se serve.
- I Prospetti (Fase 4, non ancora costruita) useranno questo stesso modello di Scenario per le
  simulazioni comparative, come previsto dalla revisione.

## v0.13-001 — Fase 2: Ciclo Budget

### Aggiunto
- **Impostazioni Ciclo**: un'unica impostazione globale (mese solare o intervallo custom,
  es. 15→14) che si applica a tutti i Budget insieme — non configurabile per singolo Budget,
  per decisione esplicita dell'utente.
- **Apertura Ciclo**: un'unica azione apre un Ciclo per ogni Budget attivo, tutti con lo stesso
  periodo. Il periodo successivo continua senza sovrapposizioni né buchi rispetto all'ultimo
  Ciclo chiuso; se non esiste ancora alcun Ciclo, si parte dal periodo "in corso" secondo le
  impostazioni.
- **Chiusura Ciclo** con assistente per il residuo (mai un automatismo, sempre una scelta
  esplicita, coerente con tutta la filosofia dell'app):
  - Residuo positivo → Mantieni nel Budget (si riporta al prossimo Ciclo) / Trasferisci al
    Fondo (diventa patrimonio) / Libera Liquidità (nessun riporto).
  - Residuo negativo (sforamento) → Riporta al prossimo Ciclo (comportamento base FDD) /
    Copri con un Fondo (mai il Conto direttamente: sarebbe prendere gli stessi soldi due
    volte) / Usa liquidità libera del Conto (accettato, nessun riporto).
- **Trasferimento esteso al Budget**: ora supporta anche il Budget come origine o destinazione
  (oltre a Conto/Fondo/Obiettivo), necessario per "Trasferisci al Fondo" e "Copri con Fondo".
  Nessuna dipendenza circolare: `trasferimenti.js` accede al Ciclo Budget aperto tramite
  `storage.js` direttamente, non importa `domain/budgetCicli.js` (che invece dipende da lui).
- **Il Budget rientra nella formula di coerenza patrimoniale** (Conto = Fondi + Budget +
  Liquidità): con un Ciclo aperto, il Budget ha finalmente un importo reale earmarked dal
  Conto. Chiarimento esplicito dell'utente: "il Budget non è patrimonio" resta una questione
  di **classificazione** (operatività vs patrimonio), non di conteggio — il denaro va comunque
  contato da qualche parte finché è earmarked.
- **Vista "Ciclo Budget"**: impostazioni, ciclo corrente (con chiusura guidata per ciascun
  Budget) e storico dei cicli chiusi, ordinabile e filtrabile.

## v0.12-001 — Avanzamento del Fondo calcolato automaticamente dagli Obiettivi

### Aggiunto
- **Se un Fondo ha Obiettivi, il suo "Obiettivo complessivo" non è più un valore inserito a
  mano**: è ora automaticamente la somma degli Importi Target dei suoi Obiettivi. L'avanzamento
  del Fondo è il rapporto tra la somma dei saldi accumulati e questa somma. Calcolo dinamico
  (mai salvato, coerente con il resto dell'app): si aggiorna da solo ogni volta che un Obiettivo
  viene aggiunto, modificato o eliminato (`engine/obiettivoCalc.js: calcolaDatiFondo`).
- Nuova colonna "Avanzamento Obiettivi" nella tabella Fondi, con barra di progresso.
- Nel form "Modifica Fondo", il campo "Obiettivo complessivo" diventa di sola lettura (con nota
  esplicativa) quando il Fondo ha Obiettivi; resta modificabile a mano solo per i Fondi senza
  Obiettivi, dove non c'è nulla da sommare.
- La strategia "Proporzionale (per Obiettivo complessivo)" in Ridistribuisci Liquidità ora usa
  questo stesso valore calcolato, invece del vecchio campo manuale.

## v0.11-003 — Correzione: l'arrotondamento "per difetto" faceva sparire centesimi reali

### Corretto (critico)
- Segnalato dall'utente: distribuendo 1.000 € su più Fondi, il totale visibile in Dashboard
  risultava di un centesimo inferiore a quanto realmente distribuito. Causa: arrotondare sempre
  **per difetto** ad ogni singola scrittura di saldo tronca via anche il normale rumore di
  virgola mobile (es. 333.33999999999994, che matematicamente è 333.34, diventava 333.33),
  e ripetuto su più Fondi il centesimo perso si accumula.
- **Corretto**: i saldi (Conto, Fondo, Obiettivo, Budget) ora usano l'arrotondamento
  **standard** (al più vicino), non più sistematicamente per difetto. L'importo mensile
  consigliato per un Obiettivo resta arrotondato per eccesso, come richiesto esplicitamente
  (meglio accantonare qualche centesimo in più che rischiare di mancare la scadenza).
- Se dovesse comunque presentarsi una minima incongruenza, resta sempre disponibile una
  Rettifica per correggerla manualmente.

## v0.11-002 — Nessun movimento orfano: pulizia a cascata + azione di riparazione

### Corretto
- **Causa individuata**: eliminare un Fondo, un Conto o un Obiettivo (o un movimento tramite
  "Elimina" nel Registro) lasciava orfano tutto ciò che lo referenziava — righe di Allocazione,
  Uscite, Trasferimenti, Rettifiche e i loro Storni — generando gli avvisi ripetuti "Movimento
  orfano" / "Storno incoerente" in Verifica di Integrità Patrimoniale.

### Aggiunto
- **Prevenzione futura**: eliminare un Conto, un Fondo o un Obiettivo ora ripulisce
  automaticamente a cascata ogni movimento che lo referenzia direttamente (e i relativi
  Storni), così non si generano più nuovi riferimenti orfani. I messaggi di conferma in Conti/
  Fondi lo segnalano esplicitamente. Le eliminazioni dirette di un movimento nel Registro
  (icona ✕) ora ripuliscono anche i propri Storni collegati.
- **Azione di riparazione** ("Ripara automaticamente"): nuovo pulsante nella sezione Verifica di
  Integrità Patrimoniale, visibile solo se ci sono problemi rilevati. Elimina in un colpo solo
  tutti i movimenti e gli Storni ormai orfani già presenti nel database (generati prima di
  questa correzione), senza toccare alcun movimento valido.

## v0.11-001 — Uscita corretta, arrotondamenti a 2 decimali, pulizia Movimenti, Backup

### Corretto (critico)
- **Stesso bug dell'Entrata, trovato anche nell'Uscita**: un'Uscita riduceva il Fondo (e
  l'eventuale Obiettivo) ma non toccava mai il saldo reale del Conto. Un'Uscita rappresenta un
  pagamento reale: il denaro esce dal Fondo **e** esce fisicamente dal Conto a cui appartiene
  (va a pagare qualcosa fuori dal sistema). Corretto in `domain/uscite.js`, sia in creazione sia
  nello storno. Trasferimento e Rettifica sono stati riverificati: già corretti (il primo muove
  denaro reale solo tra Conti realmente diversi; la seconda è intenzionalmente lo strumento di
  riconciliazione che può creare un divario, per esplicita scelta dell'utente).

### Corretto — Arrotondamenti
- **Nuova utility condivisa** (`utils/denaro.js`): ogni saldo (Conto, Fondo, Obiettivo, Budget)
  viene ora sempre arrotondato a **esattamente 2 decimali** ad ogni scrittura, eliminando il
  rumore di virgola mobile che poteva accumularsi attraverso allocazioni/trasferimenti/storni
  ripetuti (es. un saldo che finiva per essere "123.0054480").
  - Saldi reali (quanto **ho** davvero: saldoReale, saldo, saldoAccumulato) → arrotondati
    **per difetto**: non si può mai mostrare più denaro di quanto ce ne sia realmente.
  - Importo mensile consigliato per un Obiettivo (quanto **mettere da parte**) → arrotondato
    **per eccesso**: meglio accantonare qualche centesimo in più che rischiare di non
    raggiungere l'Obiettivo entro la scadenza.

### Corretto — Rumore nella Verifica di Integrità Patrimoniale
- I problemi identici (tipicamente "Movimento orfano" e "Trasferimento sbilanciato" generati da
  Conti/Fondi eliminati e referenziati da molti movimenti) venivano ripetuti uno per uno, anche
  decine di volte. Ora vengono raggruppati per testo identico, mostrando un conteggio
  (es. "...(×12)") invece di righe ripetute.

### Aggiunto — Pulizia del Registro Movimenti
- **Eliminazione diretta dei movimenti** (icona ✕, distinta dallo Storno ↺): rimuove il
  movimento dal database senza annullarne alcun effetto sul saldo e senza lasciare traccia.
  Va usata solo per ripulire movimenti ormai rotti (orfani di entità eliminate), mai per
  correggere un movimento valido (in quel caso resta sempre preferibile lo Storno).
  Decisione esplicita e informata dell'utente, in deroga al principio di immutabilità.
- **Selezione multipla**: casella per riga + "seleziona tutti" + "Elimina selezionati".
- **"Pulisci tutto il Registro"**: elimina l'intero storico dei movimenti (doppia conferma
  esplicita). I saldi attuali di Conti/Fondi/Obiettivi restano invariati: si cancella solo lo
  storico, non il patrimonio.
- **Testo semplificato nel Registro**: rimossi simboli come frecce (→) e trattini decorativi
  dalle descrizioni. Quando un'entità referenziata non esiste più (eliminata), la parte relativa
  viene semplicemente omessa invece di mostrare segnaposto come "—"; se non resta nulla da
  mostrare, compare solo la descrizione del movimento.

### Aggiunto — Backup
- **Esporta / Importa configurazione** in Dashboard: esporta l'intero database in un file JSON
  scaricabile, per portare la configurazione (Conti, Fondi, Obiettivi, Budget, Piano, Movimenti)
  su un altro PC. L'importazione sostituisce interamente i dati correnti (doppia conferma).
- Nuove funzioni tecniche di supporto: `storage.js: dbClear`, `domain/backup.js: esportaTutto,
  importaTutto`. Non introducono alcun nuovo concetto finanziario nel modello.

## v0.10-004 — Correzione definitiva: gli importi si aggiornano solo a conferma, non ad ogni carattere

### Corretto
- Il tentativo precedente (ripristinare focus e cursore dopo ogni carattere) non risolveva bene
  l'esperienza di digitazione. Cambiato approccio, più robusto: i campi importo di "Registra
  Entrata", "Distribuisci Disponibile" e "Ridistribuisci Liquidità" ora aggiornano lo stato e
  ricalcolano i totali solo alla conferma del valore (evento `change`: quando si esce dal campo
  o si preme Invio), non ad ogni carattere digitato (`input`). Il re-render, quando avviene, non
  interrompe più la digitazione perché non capita più a metà scrittura.

## v0.10-003 — Correzione: perdita di focus scrivendo negli importi

### Corretto
- **Bug fastidioso**: nei campi importo delle righe di "Registra Entrata", "Distribuisci
  Disponibile" e "Ridistribuisci Liquidità" (sia a livello Fondi sia a livello Obiettivi), ogni
  singolo carattere digitato provocava un re-render completo della sezione — che distrugge e
  ricrea l'elemento `<input>`, facendo perdere il focus. Per scrivere "100" bisognava scrivere
  "1", ricliccare, scrivere "0", ricliccare, scrivere "0". Corretto in tutti e quattro i punti:
  dopo il re-render, il focus e la posizione del cursore vengono ripristinati sullo stesso campo.
- Le barre di ricerca (Conti/Fondi/Budget/Movimenti) erano già al sicuro da questo problema:
  aggiornano solo la lista sottostante, non l'input di ricerca stesso.

## v0.10-002 — Budget ordinabile/filtrabile + azioni a icona

### Aggiunto
- **Budget**: stesso trattamento di Conti/Fondi/Movimenti — ordinabile per Nome/Conto/
  Categoria/Importo default, filtrabile per testo libero.

### Modificato
- **Pulsanti azione nelle tabelle** (Conti, Fondi — inclusi gli Obiettivi annidati —, Budget,
  Movimenti): sostituiti i pulsanti testuali con pulsanti a icona (✎ Modifica, ✕ Elimina,
  ⊙ Obiettivi, » Chiudi anno, ▤ Archivia, ↺ Riattiva/Storna), con il nome dell'azione mostrato
  al passaggio del mouse (tooltip nativo). Risolve anche lo sbandamento della spaziatura tra i
  pulsanti quando andavano a capo.

## v0.10-001 — Elenchi ordinabili e filtrabili (Movimenti, Fondi, Conti)

### Aggiunto
- **Nuova utility condivisa** (`utils/listaUtils.js`): ordinamento e filtro testuale riusabili
  da qualsiasi vista con un elenco, con intestazioni di colonna cliccabili (▲▼) e barra di
  ricerca in stile coerente in tutta l'app.
- **Registro Movimenti**: ora è un'unica tabella (non più card), con ogni riga di un'Allocazione
  "appiattita" in una riga di tabella a sé — così l'intero registro è omogeneo, indipendentemente
  dal tipo di movimento. Ordinabile per Data (default, più recente in cima), Conto di
  destinazione e Importo; filtrabile per testo libero (cerca su descrizione, tipo, Conto).
- **Fondi**: convertito nello stesso formato tabellare di Conti (nome, Conto, saldo, stato,
  azioni), ordinabile per Nome/Conto/Saldo e filtrabile per testo. Il dettaglio degli Obiettivi
  di un Fondo si apre come riga espansa sotto la riga del Fondo, non più come card.
- **Conti**: aggiunte le stesse capacità di ordinamento (Nome/Istituto/Saldo/Stato) e ricerca
  testuale, per coerenza con Movimenti e Fondi.

## v0.9-001 — Correzione critica: l'Entrata ora muove denaro reale sui Conti + scorciatoie Ridistribuzione

### Corretto (critico)
- **Bug di integrità**: confermando un'Allocazione (Entrata), il saldo dei Fondi coinvolti
  aumentava ma **nessun Conto veniva mai accreditato** — né quello di arrivo, né eventuali Conti
  di destinazione via bonifico. Risultato: "Verifica di Integrità Patrimoniale" segnalava
  un'incoerenza immediata dopo ogni Entrata (Fondi cresciuti, Conto invariato). Corretto in
  `domain/allocazioni.js`: alla conferma, l'intera entrata viene accreditata al Conto di arrivo;
  per le righe il cui Conto di movimento è diverso (bonifico verso un altro Conto), il denaro si
  sposta di conseguenza — stessa logica già corretta usata in `trasferimenti.js`. Lo storno di
  una singola riga ora annulla anche l'eventuale movimento reale tra Conti, non solo l'effetto
  su Fondo/Obiettivo.
- Chiarimento sulla sequenza di Rettifica + Storno riportata dall'utente: non era un secondo
  bug. Creare una Rettifica di +20 e poi stornarla subito produce correttamente un effetto netto
  di zero (le due operazioni si annullano a vicenda) — comportamento atteso, non un errore.

### Aggiunto
- **Scorciatoie in "Ridistribuisci Liquidità"**, ad entrambi i livelli (Fondi di un Conto,
  Obiettivi di un Fondo): "Equamente", "Proporzionale" (per Obiettivo complessivo dei Fondi /
  per Importo Target degli Obiettivi) e "Da Piano" (usa le Voci del Piano attivo pertinenti,
  con risoluzione automatica per priorità se il Piano eccede il totale da ridistribuire). Riusano
  interamente il motore già costruito per "Registra Entrata", nessuna logica duplicata.

## v0.8-001 — Ridistribuisci Liquidità estesa a Conto→Fondi→Obiettivi

### Modificato
- **"Ridistribuisci Liquidità" ridisegnata**: prima operava solo tra gli Obiettivi di un singolo
  Fondo. Ora parte da un Conto e mostra in un unico specchietto tutti i suoi Fondi (saldo
  attuale, nuovo saldo modificabile); da ciascun Fondo si può aprire il dettaglio dei suoi
  Obiettivi e ridistribuire anche quelli, nella stessa sessione. Esempio dell'utente: un Conto
  con 1.000 € su 5 Fondi da 200 € ciascuno può ora essere risistemato liberamente (es. 100 € e
  300 €) da un'unica schermata, invece di dover aprire ogni Fondo separatamente.
- Ordine di applicazione dei Trasferimenti generati alla conferma: prima i Fondi che cedono
  denaro (liberano liquidità nel Conto), poi quelli che ne ricevono (attingono alla liquidità
  appena liberata), infine le ridistribuzioni interne tra Obiettivi — così i controlli di
  coerenza vedono sempre lo stato corretto e nessun passaggio fallisce per un ordine sbagliato.
- **Pulsante primario unificato in tutta l'app** con il gradiente viola (applicata la modifica
  CSS fatta dall'utente su "Registra Entrata", estesa per coerenza anche a `.btn-primario`
  usato ovunque: Salva, Conferma, Nuovo Conto/Fondo/Obiettivo, ecc. — prima era nero pieno,
  un'incoerenza rispetto alle tab e ai pulsanti azione già viola).

## v0.7-002 — Correzioni grafiche e Dashboard

### Corretto
- **Layout dei pulsanti Azioni in Dashboard**: andava a capo in modo disordinato. Sostituito con
  una griglia (`azioni-griglia`) a colonne uniformi, pulsanti con icona coerente e pulsante
  primario ("Registra Entrata") visivamente distinto.
- **Riga verde poco chiara nel Registro Movimenti**: rimossa. Non comunicava nulla di utile,
  solo confusione visiva; le righe di dettaglio tornano a un separatore semplice.
- **Tab di navigazione**: ora completamente arrotondate (pillola), con un gradiente viola più
  vivo al posto del colore piatto precedente.

### Aggiunto
- **Verifica di Integrità Patrimoniale**: i Conti con saldo e Fondi entrambi a zero continuano
  a comparire nella tabella, ma non generano più una Barra dell'Equazione vuota (0 = 0 + 0 non
  comunica nulla).
- **Nuova sezione "Budget assegnato per Conto"** in Dashboard: somma, per ciascun Conto, degli
  importi "modello" dei Budget definiti su di esso, con il dettaglio di ciascun Budget.

## v0.7-001 — Ridistribuisci Liquidità, correzioni e affinamenti grafici

### Corretto (critico)
- **Bug bloccante**: selezionare la strategia "Manuale" in "Distribuisci Disponibile" (e,
  scoperto per estensione, anche in "Registra Entrata") causava un loop infinito di render e
  bloccava la pagina. Causa: `renderPasso2` richiamava sempre `avviaStrategia`, che per la
  strategia "manuale" avvia subito un nuovo render completo, il quale richiama di nuovo
  `renderPasso2`, che richiama di nuovo `avviaStrategia`... Corretto in entrambi i file: una
  volta generate le righe (passo 3), `avviaStrategia` non viene più richiamato.

### Aggiunto
- **Ridistribuisci Liquidità**: nuova vista per rivedere come è già ripartito il saldo di un
  Fondo tra i suoi Obiettivi (riallocazione di denaro già assegnato, non nuova liquidità).
  Genera Trasferimenti Fondo↔Obiettivo per ciascuna variazione — nessuna nuova logica di
  dominio: riusa integralmente `creaTrasferimento` già esistente.

### Modificato
- **Rinominato "Distribuisci Liquidità" → "Distribuisci Disponibile"**, per distinguerlo
  chiaramente da "Ridistribuisci Liquidità": il primo distribuisce solo la liquidità non ancora
  allocata, il secondo riallocazione tra Obiettivi di un Fondo il denaro già assegnato.
- **Verifica di Integrità Patrimoniale**: rimosso il Budget dalla formula (ora Conto = Fondi +
  Liquidità, non più "+ Budget"). Il Budget non ha ancora un saldo reale in questa fase:
  includerlo (anche a zero) era fuorviante per un Conto dedicato solo a Budget, che mostrava
  "coerenza" per la ragione sbagliata.

### Grafica
- Tab di navigazione attiva: ora sfondo pieno color evidenza, non solo bordo inferiore.
- Rimossi gli accenti colorati dalle 3 card KPI di "Patrimonio" in Dashboard (non avevano una
  logica cromatica coerente): ora neutre.
- Card "esterne" (Fondi, e i singoli movimenti nel Registro) restano con l'accento verde/indaco
  in alto solo dove ha senso (i Fondi). Le card del Registro Movimenti sono ora neutre (nuova
  classe `.scheda-movimento`), per evitare che una lista di movimenti diversi produca una
  sequenza ripetuta di righe verdi orizzontali. Gli elementi "interni" (Obiettivi annidati in
  un Fondo, righe di un'Allocazione) usano invece una sottile linea verde verticale a sinistra.

## v0.6-001 — Restyling grafico

### Modificato
- **Nuovo sistema di design**: sfondo bianco arioso, due accenti vivaci e limitati che
  rispecchiano la separazione concettuale Patrimonio/Operatività (§5.3, §5.20 FDD):
  - **Verde smeraldo** (`#00B37E`) per tutto ciò che è Fondi/Patrimonio
  - **Indaco elettrico** (`#5B5FEF`) per tutto ciò che è Budget/Operatività
- **Tipografia**: Space Grotesk per i titoli, Inter per il corpo del testo, **IBM Plex Mono**
  per tutti gli importi (cifre tabulari allineate, carattere "da strumento di precisione").
- Card di Fondi/Budget: barra di accento sottile in alto (invece del bordo laterale spesso),
  angoli più morbidi, ombra leggera.
- **Nuovo elemento distintivo: la Barra dell'Equazione Patrimoniale** in Dashboard — visualizza
  letteralmente, per ogni Conto, l'equazione cardine del FDD (§5.20): Conto = Fondi + Budget +
  Liquidità non allocata, con un segmento colorato proporzionale per ciascuna componente.
- Sezioni Fondi e Budget con accento superiore verde/indaco per rinforzare la distinzione
  patrimonio/operatività anche dove non ci sono card (es. tabella Budget).

## v0.5-001 — Distribuisci Liquidità

### Aggiunto
- **Vista "Distribuisci Liquidità"**, azione da Dashboard: distribuisce liquidità già presente
  su un Conto verso Fondi e Obiettivi, riusando le stesse 4 strategie del motore di Allocazione
  (Manuale, Equa, Proporzionale, Da Piano — incluso lo stesso meccanismo di risoluzione per
  entrata/importo insufficiente). A differenza di "Registra Entrata", non genera un'Allocazione
  legata a una nuova entrata: genera un **Trasferimento per ciascuna riga** (Conto → Fondo/
  Obiettivo), perché qui non arriva denaro nuovo, si limita a cambiare l'earmarking di denaro
  già esistente. Le voci Budget di un Piano vengono escluse (i Budget non hanno ancora un saldo
  reale in questa fase) e segnalate all'utente.
- Riutilizzo diretto di `engine/allocationEngine.js`, nessuna duplicazione della logica di calcolo.

## v0.4-002 — Rettifica estesa a Fondo e Obiettivo

### Modificato
- **Principio esteso** (segnalazione dell'utente: "tutto ciò che ha un saldo deve essere
  modificabile solo tramite movimenti/rettifiche, non a mano senza lasciare traccia"): la
  Rettifica ora si applica non solo al Conto ma anche a **Fondo** e **Obiettivo**.
- **"Modifica Fondo" non permette più di cambiare il Saldo.** **"Modifica Obiettivo" non
  permette più di cambiare il Saldo accumulato.** Entrambi i valori si impostano solo alla
  creazione; ogni correzione successiva richiede una Rettifica esplicita.
- Rettificare un Obiettivo muove anche il Fondo a cui appartiene della stessa cifra (il saldo
  dell'Obiettivo è una quota del Fondo: altrimenti si violerebbe l'unicità del denaro, §5.2).
- Compatibilità additiva: le Rettifiche create nella versione precedente (solo su Conto,
  campo `contoId`) restano leggibili e funzionanti — normalizzate in lettura, mai riscritte.

## v0.4-001 — Rettifica: il saldo del Conto non si modifica più liberamente

### Aggiunto
- **Rettifica** (`domain/rettifiche.js`, store `rettifiche`): nuovo tipo di movimento, unico modo
  per correggere il saldo reale di un Conto dopo la sua creazione (arrotondamenti, interessi,
  competenze bancarie, correzione di un errore di inserimento). Descrizione **obbligatoria**
  (a differenza degli altri movimenti): è l'unica cosa che dà senso a un numero che altrimenti
  apparirebbe "dal nulla". Stessa filosofia degli altri movimenti: evento storico immutabile,
  correggibile solo con uno Storno.
- Vista rapida "Registra Rettifica", azione da Dashboard (coerente con Entrata/Uscita/Trasferimento).
- Rettifiche incluse nel Registro Movimenti (con storno) e nella Verifica di Integrità
  Patrimoniale (controllo di riferimento orfano e di storno incoerente).
- Migrazione additiva dello schema IndexedDB: DB_VERSION 2 → 3, aggiunto lo store `rettifiche`.

### Modificato
- **"Modifica Conto" non permette più di cambiare il Saldo reale.** Il saldo si imposta solo
  alla creazione del Conto (saldo di partenza); ogni correzione successiva richiede una
  Rettifica esplicita, che lascia traccia nel Registro Movimenti — coerente con il principio
  per cui ogni cambiamento di un valore finanziario deve essere un evento tracciato, non una
  modifica silenziosa.

## v0.3-002 — Correzione bug validazione + Verifica di Integrità Patrimoniale

### Corretto (critico)
- **Bug di validazione nativa del browser**: i campi importo usavano `step="0.01"`, che attiva
  la validazione nativa "stepMismatch" di HTML5. Questa validazione, per un bug noto dei motori
  browser legato alla precisione dei numeri in virgola mobile, rifiutava come "non validi" anche
  valori perfettamente corretti (es. 1155), suggerendo correzioni assurde come 1154,999. Risolto
  impostando `step="any"` su tutti i campi importo: disabilita la validazione nativa difettosa,
  che era comunque ridondante — la validazione reale (numeri, arrotondamento, coerenza) è già
  interamente gestita nel livello di dominio.

### Aggiunto
- **Verifica di Integrità Patrimoniale** (rinominata da "Verifica di coerenza patrimoniale",
  proposta dall'utente): un "controllo di salute" complessivo dell'app, in Dashboard. Oltre alla
  verifica Saldo Conto = Fondi + Liquidità libera, controlla ora anche:
  - nessun Fondo con saldo negativo;
  - nessun Obiettivo che superi il saldo del proprio Fondo;
  - nessun riferimento rotto tra entità ("movimento orfano": Fondo→Conto, Obiettivo→Fondo,
    Budget→Conto, riga di Allocazione→Fondo/Obiettivo/Allocazione, Uscita→Fondo/Obiettivo);
  - nessun Trasferimento con origine o destinazione inesistente;
  - nessuno storno incoerente (riga/Uscita/Trasferimento marcati "stornati" senza un record di
    Storno collegato, o viceversa).
  Implementata come funzione pura (`engine/integrityCheck.js: eseguiVerificaIntegritaCompleta`),
  che riceve le collezioni già caricate e non accede mai direttamente a IndexedDB.

## v0.3-001 — Registro Movimenti, Uscita, Trasferimento, Storno

### Aggiunto
- **Principio architetturale nuovo (decisione esplicita dell'utente)**: ogni movimento
  (riga di Allocazione, Uscita, Trasferimento) è un **evento storico immutabile**. Non si
  modifica né si elimina mai. Un errore si corregge con uno **Storno**: un movimento inverso
  generato automaticamente, che annulla l'effetto sul saldo preservando integralmente lo
  storico. La riallocazione dell'importo stornato non è mai obbligatoria.
- **Dominio Storno** (`domain/storni.js`, store `storni`): registra ogni storno come evento
  a sé stante, collegato al movimento originale tramite riferimento, mai sovrascrivendolo.
- **Dominio Uscita** (`domain/uscite.js`, store `uscite`): pagamento reale che riduce un Fondo
  o un suo Obiettivo. Esclusi i Budget, coerentemente con l'assenza di registrazione dettagliata
  delle spese (§5.18 FDD).
- **Dominio Trasferimento** (`domain/trasferimenti.js`, store `trasferimenti`): movimento tra
  due entità che detengono valore (Conto, Fondo, Obiettivo). Principio applicato: il saldo
  reale di un Conto cambia solo se il Conto di origine e quello di destinazione sono
  effettivamente diversi; se un Fondo/Obiettivo si sposta restando nello stesso Conto, cambia
  solo l'earmarking interno, mai il saldo reale (altrimenti si conterebbe lo stesso euro due
  volte, violando §5.2).
- **Vista Registro Movimenti**: cronologia unificata di Allocazioni (con storno per singola
  riga), Uscite e Trasferimenti (storno dell'intero movimento), ordinata per data.
- **Viste rapide "Registra Uscita" e "Registra Trasferimento"**, raggiungibili come azioni
  dalla Dashboard (non voci di navigazione), coerentemente con "Registra Entrata".
- Migrazione additiva dello schema IndexedDB: DB_VERSION 1 → 2, aggiunti gli store `uscite`,
  `trasferimenti`, `storni`. Nessuno store esistente è stato toccato.

## v0.2-002 — Correzione bug critico + revisione modello Fondi/Categorie

### Corretto (critico)
- **Bug di corruzione dati**: modificando un Conto, Fondo, Obiettivo o Budget tramite il form
  "Modifica", i campi numerici (saldo, importo target, ecc.) venivano scritti così come arrivavano
  dal form HTML — cioè come **stringhe** — invece di essere convertiti in numeri. Alla successiva
  Allocazione, la somma tra un saldo salvato come stringa e un importo numerico produceva una
  concatenazione di testo invece di un'addizione (es. "1000.10" + 25 → "1000.1025" invece di
  1025.10). Corretto in tutti e quattro i moduli di dominio (`conti.js`, `fondi.js`,
  `obiettivi.js`, `budget.js`): i campi numerici vengono ora sempre normalizzati con `Number()`
  prima della scrittura, indipendentemente dalla provenienza del dato.
  **Nota**: se hai già un Fondo con un saldo "contaminato" da questo bug, aprilo in Modifica e
  salvalo di nuovo (anche senza cambiare nulla): da ora in poi verrà scritto correttamente come numero.

### Modificato
- "Registra Entrata" non è più una voce della barra di navigazione principale: è ora un
  pulsante di azione rapida in Dashboard ("+ Registra Entrata"), coerente con l'impostazione
  UX del FDD (§4.3: la Dashboard deve essere orientata all'azione).

### Revisione del modello: Fondi e Categorie
- **Categoria**: non appartiene più al Fondo. Appartiene ora all'**Obiettivo** e al **Budget**.
  Il Fondo identifica *dove* si accantona il denaro (es. "Spese 2027"); la Categoria identifica
  *per quale ambito della vita* quel denaro è destinato (es. Auto, Casa, Salute), permettendo
  report trasversali indipendenti dal Fondo/anno.
  - Migrazione: additiva e non distruttiva. Eventuali Categorie create in precedenza con
    ambito "fondo" restano nel database ma non sono più mostrate né utilizzabili in questa UI.
    Se servono ancora, vanno ricreate con ambito "obiettivo" o "budget".
- **Fondi annuali**: confermato il mantenimento di Fondi come esercizi finanziari autonomi
  (es. "Spese 2026", "Spese 2027"). Aggiunta la gestione del ciclo di vita:
  - **Chiudi anno**: crea il Fondo dell'anno successivo copiando gli Obiettivi del Fondo di
    origine (nome, importo target, data prevista, categoria), con saldo e saldo accumulato
    azzerati. Il Fondo di origine non viene toccato da questa azione.
  - **Archivia / Riattiva**: azione separata e deliberata, per marcare un Fondo come concluso
    (resta consultabile, non più modificabile per nuove allocazioni). Il trasferimento
    dell'eventuale saldo residuo resta una scelta manuale dell'utente (non automatizzato).

## v0.2-001 — Fase 1: Piano e Allocazione

### Aggiunto
- Dominio **Piano**: CRUD, un solo Piano attivo alla volta, eliminazione a cascata delle
  proprie Voci (composizione: le Voci non hanno significato indipendente dal Piano).
- Dominio **Voci del Piano**: destinazione Fondo/Budget/Obiettivo, importo fisso o percentuale,
  priorità.
- Motore di Allocazione (`engine/allocationEngine.js`) con le 4 strategie previste dal FDD:
  - **Manuale**: nessun calcolo automatico, l'utente compone le righe da zero.
  - **Equa**: distribuzione in parti uguali tra gli elementi selezionati.
  - **Proporzionale**: rapporti calcolati sull'**Importo Target complessivo** degli Obiettivi
    selezionati (decisione esplicita dell'utente tra le alternative possibili).
  - **Da Piano**: applica le Voci del Piano attivo. Se l'entrata non copre tutte le voci fisse,
    il sistema avvisa sempre e lascia scegliere tra "Assegna manuale" e "Assegna per priorità"
    (decisione esplicita dell'utente) — mai una riduzione automatica silenziosa.
- Dominio **Allocazione** (`domain/allocazioni.js`): valida che la somma delle righe coincida
  con l'importo dell'entrata, applica gli effetti reali (Fondi e Obiettivi aggiornati in ordine
  coerente), genera le istruzioni operative raggruppate per Conto di destinazione.
- Vista **Piano**: gestione Piani/Voci, attivazione, simulazione immediata di un importo ipotetico.
- Vista **Registra Entrata**: flusso guidato in 3 passi (dati entrata → strategia e proposta →
  righe modificabili con controllo somma) fino alla conferma e alla lista di operazioni da
  eseguire.

### Nota architetturale importante
- Le allocazioni verso un **Budget** in questa fase generano solo l'istruzione operativa
  (es. "mantieni/bonifica"), senza aggiornare alcun saldo del Budget. La vera contabilità
  del Budget (assegnato/utilizzato/residuo per ciclo) richiede lo store `budgetCicli`,
  prima ancora non collegato: arriverà correttamente in Fase 2. Aggiornare un campo del
  Budget "master" ora avrebbe mischiato configurazione e saldo reale.

### Corretto durante lo sviluppo (prima della consegna)
- La strategia "Da Piano", quando il Piano non esauriva l'intera entrata, non generava una
  riga di "disponibilità residua": la somma delle righe risultava inferiore all'entrata e
  bloccava la conferma. Ora il residuo viene aggiunto automaticamente come riga modificabile.

## v0.1-002 — Fase 0: correzione bug "-0,00 €" nella verifica di coerenza

### Corretto
- La verifica di coerenza patrimoniale (Dashboard) segnalava erroneamente un'incoerenza
  ("-0,00 €" di liquidità non allocata) quando la somma dei Fondi di un Conto, a causa dei
  normali limiti dell'aritmetica in virgola mobile (es. 100 - 33.33 - 33.33 - 33.34), produceva
  un residuo infinitesimale negativo invece di uno zero esatto.
- Aggiunta tolleranza di arrotondamento al centesimo in `integrityCheck.js` e normalizzazione
  di "-0" a "0" in `formatCurrency.js`, così che importi effettivamente pari a zero non vengano
  mai mostrati come negativi.

## v0.1-001 — Fase 0: Entità base

Prima versione funzionante dell'applicazione, basata sul Functional Design Document v1.0.

### Aggiunto
- Schema IndexedDB completo (tutti gli store previsti dal modello del dominio: conti, categorie,
  fondi, obiettivi, budget, budgetCicli, impostazioniCiclo, piano, pianoVoci, allocazioni,
  allocazioniRighe, consuntivi, consuntivoBudgetRighe, consuntivoFondoRighe, prospetti,
  prospettoElementi). Solo gli store relativi a Fase 0 sono attualmente utilizzati dalla UI;
  gli altri sono predisposti per le fasi successive senza richiedere migrazioni strutturali.
- `storage.js`: unico layer di accesso a IndexedDB (CRUD generico).
- Dominio **Conto**: CRUD completo, blocco eliminazione se contiene Fondi o Budget collegati.
- Dominio **Categoria**: CRUD completo, ambito "fondo" o "budget", blocco eliminazione se in uso.
- Dominio **Fondo**: CRUD completo, appartenenza obbligatoria ad un Conto, blocco eliminazione
  se contiene Obiettivi.
- Dominio **Obiettivo**: CRUD completo, appartenenza obbligatoria ad un Fondo, verifica che il
  saldo accumulato totale degli Obiettivi di un Fondo non superi mai il saldo del Fondo stesso
  (principio di unicità del denaro, §5.2 FDD).
- Dominio **Budget** (definizione master): CRUD completo, nessun campo target/scadenza/avanzamento
  (§5.6 FDD). La gestione del ciclo (assegnato/utilizzato/residuo) arriverà in Fase 2.
- Motore di calcolo dinamico Obiettivi (`obiettivoCalc.js`): importo mancante, mesi rimanenti,
  importo mensile consigliato, percentuale — sempre ricalcolati a runtime, mai persistiti.
- Verifica di coerenza patrimoniale (`integrityCheck.js`), §5.20 FDD: confronto Saldo Conto vs
  Fondi collegati (in questa fase i Budget non concorrono ancora, in attesa dei cicli di Fase 2).
- Dashboard con patrimonio totale, stato di coerenza per Conto, riepilogo Budget.
- Viste UI: Conti, Fondi (con gestione Obiettivi annidata), Budget, Categorie.

### Limiti noti di questa fase (non sono bug, sono fuori scope)
- Nessun Piano né motore di Allocazione (Fase 1).
- Nessun ciclo Budget reale: solo la definizione "modello" del Budget (Fase 2).
- Nessun Consuntivo (Fase 3).
- Nessun Prospetto (Fase 4).
- Nessun indicatore di Salute Finanziaria (Fase 5).

### Note architetturali
- Nessuna registrazione dettagliata delle spese: coerente col principio del FDD.
- Nessuna automazione modifica altre entità senza conferma esplicita.
- Ogni eliminazione con dipendenze viene bloccata (integrità > comodità, §5.21 FDD).
