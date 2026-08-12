# Setup Supabase — FinSteady

Da fare una volta sola, nel pannello del progetto Supabase già creato (`fputmzmqupmlqxvuuypq`),
lo stesso progetto già usato da altre app della suite (schemi separati, nessuna collisione).

## 1. Esegui lo schema

Dashboard → **SQL Editor** → New query → incolla tutto il contenuto di `schema.sql` → **Run**.

Crea lo schema `finsteady` con due tabelle (`profili_cloud` e `record_sync`, vedi commento
in testa a `schema.sql` sul perché di questo design invece di una tabella per store), la
sicurezza per riga (RLS: ogni utente vede solo i propri dati) e un trigger che tiene
`updatedAt` autorevole lato server.

## 2. Esponi lo schema via API — passaggio che si dimentica facilmente

Dashboard → **Project Settings** → **Data API** → sezione **Exposed schemas** → aggiungi
`finsteady` alla lista (di default Supabase espone via API solo lo schema `public`).

Senza questo passaggio, ogni chiamata dal client fallisce con un errore tipo
`schema "finsteady" not found` — è la causa più probabile se qualcosa non funziona al primo
collegamento.

## 3. (Facoltativo, solo se scegli di usare la registrazione via app)

Dashboard → **Authentication** → **Providers** → verifica che "Email" sia attivo (lo è di
default). Se vuoi disattivare la conferma via email al primo `Crea account` (comodo per un uso
solo personale): **Authentication** → **Sign In / Providers** → Email → disattiva
"Confirm email".

## 4. Verifica

Dopo il primo collegamento dall'app (Impostazioni → tab **Cloud Sync**): Dashboard →
**Table Editor** → schema `finsteady` → dovresti vedere comparire una riga in `profili_cloud`
e via via le righe in `record_sync` man mano che salvi/modifichi dati nell'app.

## Note

- Il piano gratuito mette in pausa il progetto dopo 7 giorni senza query: la prima
  sincronizzazione dopo una pausa richiede qualche secondo in più, nessun dato viene perso.
- Nessuna chiave privata nel codice: `js/data/config.js` contiene solo l'URL del progetto e la
  chiave `anon` (pubblica per design) — la sicurezza reale è nelle policy RLS di `schema.sql`.
- Ogni Profilo va collegato al cloud individualmente (tab Cloud Sync, quando è il Profilo
  attivo): collegare un Profilo non collega automaticamente gli altri.
