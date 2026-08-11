-- Financial Planner — Sync Cloud (Fase 6)
--
-- Da eseguire UNA VOLTA nel SQL Editor del progetto Supabase (progetto → SQL Editor → New query
-- → incolla tutto → Run), E POI un passaggio manuale nel pannello (vedi in fondo a questo file
-- e SETUP-SUPABASE.md): questo script da solo non basta, Postgres e PostgREST richiedono anche
-- che lo schema venga "esposto" dall'interfaccia del progetto.
--
-- Schema dedicato "finsteady" (non il default "public"), come per gli altri progetti Supabase
-- dell'utente: tutto il Sync Cloud vive isolato in questo schema, tabella e funzione comprese.
--
-- Scelta architetturale: un'UNICA tabella generica (finsteady.sync_records) invece di una
-- tabella per ciascuno store IndexedDB dell'app. Il payload di ogni record è salvato così com'è
-- (jsonb), esattamente come domain/backup.js fa già in locale iterando STORE_DEFINITIONS senza
-- conoscere i campi di ciascuno store. Vantaggio: aggiungere un nuovo store IndexedDB in futuro
-- (come già successo più volte nella storia del progetto) non richiede alcuna modifica qui.
--
-- profilo_locale_id: l'app supporta più Profili locali completamente separati (ciascuno con un
-- proprio database IndexedDB fisico). Un account Supabase è legato al browser, non al Profilo:
-- questa colonna evita che due Profili locali sincronizzati con lo stesso account si mescolino,
-- restando comunque partizioni separate all'interno dello stesso account.

create schema if not exists finsteady;

create table if not exists finsteady.sync_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profilo_locale_id text not null,
  store text not null,
  payload jsonb not null default '{}'::jsonb,
  eliminato boolean not null default false,
  aggiornato_il timestamptz not null default now()
);

create index if not exists sync_records_utente_profilo_idx
  on finsteady.sync_records (user_id, profilo_locale_id);

-- Row Level Security: ogni utente vede/scrive solo le proprie righe. Le scritture reali passano
-- sempre dalla funzione fp_sync_upsert qui sotto (SECURITY DEFINER, con controllo esplicito su
-- auth.uid()); queste policy restano comunque come seconda linea di difesa.
alter table finsteady.sync_records enable row level security;

drop policy if exists sync_records_select_proprio on finsteady.sync_records;
create policy sync_records_select_proprio on finsteady.sync_records
  for select using (user_id = auth.uid());

drop policy if exists sync_records_insert_proprio on finsteady.sync_records;
create policy sync_records_insert_proprio on finsteady.sync_records
  for insert with check (user_id = auth.uid());

drop policy if exists sync_records_update_proprio on finsteady.sync_records;
create policy sync_records_update_proprio on finsteady.sync_records
  for update using (user_id = auth.uid());

drop policy if exists sync_records_delete_proprio on finsteady.sync_records;
create policy sync_records_delete_proprio on finsteady.sync_records
  for delete using (user_id = auth.uid());

-- A differenza dello schema "public" (dove Supabase pre-concede l'accesso di base ai ruoli
-- anon/authenticated), uno schema creato da zero parte senza alcun permesso: vanno concessi
-- esplicitamente, altrimenti ogni chiamata fallisce con "permission denied for schema
-- finsteady" ancora prima che le RLS policy entrino in gioco.
grant usage on schema finsteady to authenticated;
grant select, insert, update, delete on finsteady.sync_records to authenticated;

-- Realtime: permette al client di ricevere le modifiche fatte da altri dispositivi via
-- subscription (postgres_changes), oltre al pull esplicito all'avvio.
alter publication supabase_realtime add table finsteady.sync_records;

-- Upsert con rilevamento conflitti atomico e server-side: confronta il timestamp remoto attuale
-- del record con l'ultimo timestamp remoto noto al client (p_base_timestamp, null per un
-- record mai sincronizzato prima). Se qualcun altro ha scritto il record nel frattempo, rifiuta
-- la scrittura e restituisce la versione remota attuale invece di sovrascriverla — mai una
-- risoluzione automatica dei conflitti, sempre una scelta esplicita lato utente (fatta dal
-- client chiamando di nuovo questa funzione, questa volta con p_base_timestamp aggiornato).
create or replace function finsteady.fp_sync_upsert(
  p_id uuid,
  p_store text,
  p_profilo_locale_id text,
  p_payload jsonb,
  p_eliminato boolean,
  p_base_timestamp timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = finsteady
as $$
declare
  v_utente uuid := auth.uid();
  v_esistente finsteady.sync_records;
begin
  if v_utente is null then
    raise exception 'Non autenticato.';
  end if;

  select * into v_esistente from finsteady.sync_records
    where id = p_id and user_id = v_utente
    for update;

  if found and p_base_timestamp is not null and v_esistente.aggiornato_il > p_base_timestamp then
    return jsonb_build_object('ok', false, 'conflitto', true, 'record', to_jsonb(v_esistente));
  end if;

  insert into finsteady.sync_records (id, user_id, profilo_locale_id, store, payload, eliminato, aggiornato_il)
    values (p_id, v_utente, p_profilo_locale_id, p_store, coalesce(p_payload, '{}'::jsonb), coalesce(p_eliminato, false), now())
  on conflict (id) do update set
    profilo_locale_id = excluded.profilo_locale_id,
    store = excluded.store,
    payload = excluded.payload,
    eliminato = excluded.eliminato,
    aggiornato_il = now()
  where finsteady.sync_records.user_id = v_utente;

  select * into v_esistente from finsteady.sync_records where id = p_id;
  return jsonb_build_object('ok', true, 'conflitto', false, 'record', to_jsonb(v_esistente));
end;
$$;

-- Solo utenti autenticati possono chiamare la funzione (che comunque verifica auth.uid() al suo
-- interno: questa grant evita solo che utenti anonimi la invochino inutilmente).
revoke all on function finsteady.fp_sync_upsert(uuid, text, text, jsonb, boolean, timestamptz) from public;
grant execute on function finsteady.fp_sync_upsert(uuid, text, text, jsonb, boolean, timestamptz) to authenticated;

-- ============================================================================================
-- PASSAGGIO MANUALE OBBLIGATORIO (non eseguibile da SQL): a differenza di "public", uno schema
-- creato da zero non è raggiungibile dalle API finché non lo esponi esplicitamente.
-- Nel pannello Supabase: Project Settings → API → sezione "Exposed schemas" (o "Data API" a
-- seconda della versione dell'interfaccia) → aggiungi "finsteady" all'elenco → Save.
-- Senza questo passaggio, ogni chiamata da js/sync/* fallirà con un errore tipo
-- "The schema must be one of the following: public" anche se lo script sopra è andato a buon
-- fine. Dettagli in SETUP-SUPABASE.md.
-- ============================================================================================
