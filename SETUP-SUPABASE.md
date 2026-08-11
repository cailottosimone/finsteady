# Setup Sync Cloud (Supabase)

Il Sync Cloud è opzionale: finché non completi questa procedura, `js/sync/config.js` resta
vuoto e l'app funziona esattamente come prima, solo in locale (IndexedDB). Nessuna funzionalità
esistente cambia.

Modello volutamente semplice: due pulsanti nella tab **Sync** di Impostazioni, **Carica sul
Cloud** e **Scarica dal Cloud**. Nessuna sincronizzazione automatica in background, nessuna
risoluzione di conflitti: premi un pulsante, l'operazione si completa, fine — non ti chiede
altro dopo. Carica sovrascrive il Cloud con i dati di questo dispositivo; Scarica sostituisce
interamente i dati di questo dispositivo con quelli del Cloud.

## 1. Crea il progetto Supabase

1. Vai su [supabase.com](https://supabase.com), crea un account (o accedi) e crea un nuovo
   progetto.
2. Scegli una **regione europea** (es. Frankfurt) — i tuoi dati finanziari restano così
   fisicamente in UE.
3. Annota la password del database che scegli in questo passaggio (non serve per l'app, ma
   tienila da parte).

## 2. Esegui lo schema SQL

1. Nel progetto appena creato, apri **SQL Editor** (menu a sinistra) → **New query**.
2. Apri il file `supabase/schema.sql` di questo repository, copiane tutto il contenuto e
   incollalo nell'editor.
3. Premi **Run**. Il messaggio atteso è **"Success. No rows returned"** — è normale, non un
   errore: `create table`, `create policy` e simili non restituiscono righe. Lo script crea uno
   schema dedicato **`finsteady`** (non il default `public`), con dentro un'unica tabella
   `cloud_snapshot` e le sue policy di Row Level Security.

Questo script è idempotente: puoi rieseguirlo senza problemi in qualunque momento, anche più
volte — le prime righe puliscono da sole eventuali oggetti creati da versioni precedenti dello
script (una prima versione, con sincronizzazione automatica per singolo record, è stata
abbandonata perché inutilmente complessa e più difficile da verificare).

**Verifica**: nel Table Editor, imposta lo schema in alto su **finsteady** (non "public" — è un
menu a tendina separato) e controlla che compaia `cloud_snapshot`. In alternativa, nell'SQL
Editor: `select * from finsteady.cloud_snapshot;` non deve dare errore "relation does not
exist" (una tabella vuota, 0 righe, va benissimo finché non premi "Carica" la prima volta).

**Se avevi eseguito la primissima versione dello script** (quella con ancora lo schema
`public`): esegui anche `supabase/cleanup-public.sql` una volta, per rimuovere quei vecchi
oggetti. Se il tuo progetto è più recente, salta questo passaggio.

## 3. Esponi lo schema "finsteady" alle API (passaggio manuale, obbligatorio)

A differenza dello schema `public`, uno schema creato da zero **non è raggiungibile dal client**
finché non lo esponi esplicitamente — questo non si può fare via SQL, solo dal pannello:

1. Vai su **Project Settings → API**.
2. Trova la sezione **"Exposed schemas"** (o **"Data API"**, a seconda della versione
   dell'interfaccia).
3. Aggiungi **`finsteady`** all'elenco (di solito c'è già solo `public`) e salva.

Se salti questo passaggio, l'app mostrerà un errore tipo *"The schema must be one of the
following: public"* non appena provi a caricare o scaricare, anche se il passaggio 2 sopra è
andato a buon fine.

## 4. Abilita l'accesso email/password

1. Vai su **Authentication → Providers** e verifica che **Email** sia abilitato (lo è di
   default).
2. Se vuoi evitare l'email di conferma ad ogni registrazione (utile per un uso personale, su
   pochi dispositivi tuoi), in **Authentication → Settings** puoi disattivare "Confirm email" —
   opzionale, l'app funziona comunque anche con la conferma via email attiva.

## 5. Recupera URL e chiave pubblica

1. Vai su **Project Settings → API** (la stessa pagina del passaggio 3).
2. Copia **Project URL** e **anon public key**.

## 6. Compila la configurazione dell'app

Apri `js/sync/config.js` e incolla i due valori:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

Salva, ricarica l'app: nella tab **Sync** di Impostazioni comparirà un form per registrarti o
accedere invece del messaggio "non configurato".

## Collegare più dispositivi allo stesso Profilo

Perché due dispositivi condividano gli stessi dati serve **sia** lo stesso account
(email/password usati per accedere) **sia** un Profilo attivo con **esattamente lo stesso
nome** (non conta l'ordine con cui li hai creati). La tab Sync mostra sempre a quale Profilo sei
collegato, per verificarlo a colpo d'occhio; lo stesso indicatore compare anche in Dashboard.

Passaggi per collegare un secondo dispositivo (es. un MacBook diverso):

1. **Sul dispositivo che ha già i tuoi dati**: completa il setup, poi nella tab Sync premi
   **"Carica sul Cloud"**.
2. **Sul nuovo dispositivo**: copia lo stesso repository, compila `js/sync/config.js` con lo
   stesso URL/chiave, assicurati che il Profilo attivo abbia lo stesso nome del primo
   dispositivo (rinominalo se serve, dalla vista Profili), accedi con lo stesso account nella tab
   Sync, poi premi **"Scarica dal Cloud"**.

Da quel momento in poi, ogni volta che vuoi allineare i due dispositivi, ripeti: Carica da dove
hai appena lavorato, Scarica sull'altro. Nessun automatismo: sei sempre tu a decidere quando.

## Cosa NON viene sincronizzato

- **Allegati** (ricevute/documenti caricati): restano solo sul dispositivo su cui li hai
  aggiunti. Il resto dei dati (Conti, Fondi, Obiettivi, Budget, Piano, Movimenti...) sincronizza
  normalmente.
- **Il registro dei Profili** (elenco Profili e quale è attivo): resta per-dispositivo. Su un
  nuovo dispositivo dovrai ricreare a mano il Profilo con lo stesso nome prima di collegare il
  Sync — il Profilo in sé non arriva da solo dal cloud, solo i dati al suo interno.

## Sicurezza, in breve

La chiave "anon" in `config.js` è pensata per stare nel client: non è un segreto — la vera
protezione è la Row Level Security abilitata dallo script SQL (ogni utente vede solo le proprie
righe). Se pubblichi questo repository, valuta comunque di escludere `js/sync/config.js` da git
(`.gitignore`) e di versionare invece un `config.example.js` con i valori vuoti, per non
diffondere inutilmente l'URL del tuo progetto.
