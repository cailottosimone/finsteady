# CHANGELOG — dev branch di redesign grafico

Questo file documenta **solo** il ridisegno visivo/UX partito dal repository funzionale
`v0.36-001`. Nessuna riga di logica di dominio è stata toccata: stesso IndexedDB, stesso
storage.js, stessi calcoli, stesse regole. Il `CHANGELOG.md` storico non viene modificato in
questo giro — confluirà (con dicitura propria) solo se la direzione viene approvata.

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
