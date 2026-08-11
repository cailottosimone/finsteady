-- Financial Planner — Sync Cloud (Fase 6, versione semplificata "Carica"/"Scarica")
--
-- Da eseguire nel SQL Editor del progetto Supabase (progetto → SQL Editor → New query →
-- incolla tutto → Run), E POI un passaggio manuale nel pannello (vedi in fondo a questo file e
-- SETUP-SUPABASE.md): questo script da solo non basta, Postgres e PostgREST richiedono anche
-- che lo schema venga "esposto" dall'interfaccia del progetto. Idempotente: puoi rieseguirlo
-- senza problemi, anche se avevi già lanciato una versione precedente di questo file — le prime
-- due righe puliscono da sole quanto creato dalle versioni precedenti (con sincronizzazione
-- automatica per singolo record: rivelatasi inutilmente complessa, sostituita da un modello
-- molto più semplice qui sotto).
--
-- Schema dedicato "finsteady" (non il default "public"), come per gli altri progetti Supabase
-- dell'utente: tutto il Sync Cloud vive isolato in questo schema.
--
-- Modello: UNA riga per (account, Profilo) con l'intero database esportato come jsonb — stesso
-- identico formato del Backup locale (domain/backup.js → esportaTutto()/importaTutto()).
-- "Carica sul Cloud" sovrascrive questa riga con lo stato attuale del dispositivo. "Scarica dal
-- Cloud" legge questa riga e sostituisce interamente i dati locali. Nessuna sincronizzazione
-- automatica, nessun confronto per singolo record, nessuna funzione PL/pgSQL: solo una tabella
-- con Row Level Security.
--
-- profilo_locale_id: l'app supporta più Profili locali completamente separati (ciascuno con un
-- proprio database IndexedDB fisico). È il NOME del Profilo attivo (normalizzato), non il suo
-- id — l'id è generato in modo indipendente su ogni dispositivo, quindi diverso anche per lo
-- "stesso" Profilo su macchine diverse; il nome invece è quello che l'utente tiene
-- deliberatamente uguale sui dispositivi che devono condividere gli stessi dati.

create schema if not exists finsteady;

drop table if exists finsteady.sync_records cascade;
drop function if exists finsteady.fp_sync_upsert(uuid, text, text, jsonb, boolean, timestamptz);

create table if not exists finsteady.cloud_snapshot (
  user_id uuid not null references auth.users(id) on delete cascade,
  profilo_locale_id text not null,
  payload jsonb not null,
  aggiornato_il timestamptz not null default now(),
  primary key (user_id, profilo_locale_id)
);

-- Row Level Security: ogni utente vede/scrive solo le proprie righe.
alter table finsteady.cloud_snapshot enable row level security;

drop policy if exists cloud_snapshot_select_proprio on finsteady.cloud_snapshot;
create policy cloud_snapshot_select_proprio on finsteady.cloud_snapshot
  for select using (user_id = auth.uid());

drop policy if exists cloud_snapshot_insert_proprio on finsteady.cloud_snapshot;
create policy cloud_snapshot_insert_proprio on finsteady.cloud_snapshot
  for insert with check (user_id = auth.uid());

drop policy if exists cloud_snapshot_update_proprio on finsteady.cloud_snapshot;
create policy cloud_snapshot_update_proprio on finsteady.cloud_snapshot
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cloud_snapshot_delete_proprio on finsteady.cloud_snapshot;
create policy cloud_snapshot_delete_proprio on finsteady.cloud_snapshot
  for delete using (user_id = auth.uid());

-- A differenza dello schema "public" (dove Supabase pre-concede l'accesso di base ai ruoli
-- anon/authenticated), uno schema creato da zero parte senza alcun permesso: vanno concessi
-- esplicitamente, altrimenti ogni chiamata fallisce con "permission denied for schema
-- finsteady" ancora prima che le RLS policy entrino in gioco.
grant usage on schema finsteady to authenticated;
grant select, insert, update, delete on finsteady.cloud_snapshot to authenticated;

-- ============================================================================================
-- PASSAGGIO MANUALE OBBLIGATORIO (non eseguibile da SQL): a differenza di "public", uno schema
-- creato da zero non è raggiungibile dalle API finché non lo esponi esplicitamente.
-- Nel pannello Supabase: Project Settings → API → sezione "Exposed schemas" (o "Data API" a
-- seconda della versione dell'interfaccia) → aggiungi "finsteady" all'elenco → Save.
-- Senza questo passaggio, ogni chiamata da js/sync/* fallirà con un errore tipo
-- "The schema must be one of the following: public" anche se lo script sopra è andato a buon
-- fine. Dettagli in SETUP-SUPABASE.md.
-- ============================================================================================
