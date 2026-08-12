-- ============================================================================
-- FinSteady — schema cloud per il Cloud Sync multi-Profilo/multi-dispositivo
-- ============================================================================
-- Da eseguire UNA VOLTA nell'SQL Editor del progetto Supabase (Dashboard →
-- SQL Editor → New query → incolla tutto → Run). Idempotente: si può rieseguire
-- senza effetti collaterali distruttivi.
--
-- Dopo aver eseguito questo script, un solo passaggio manuale nel pannello:
-- Project Settings → Data API → "Exposed schemas" → aggiungi "finsteady"
-- (per default Supabase espone via API solo lo schema "public"). Senza questo
-- passaggio le chiamate del client falliscono con "schema not found".
--
-- Design diverso da altre app della stessa suite (es. preventivi3d): qui NON c'è una tabella
-- per store IndexedDB con colonne tipizzate. FinSteady ha ~25 store di dominio e uno schema che
-- evolve spesso (vedi CHANGELOG): una tabella per store richiederebbe una migrazione SQL
-- parallela ad ogni cambiamento di db-schema.js. Si usano invece DUE tabelle generiche:
--   - profili_cloud: un registro leggero, una riga per Profilo collegato al cloud;
--   - record_sync: tutti i record di dominio di tutti gli store, come JSONB, con lo store di
--     provenienza e il Profilo cloud (profiloCloudId) a cui appartengono.
-- Aggiungere un nuovo store in futuro non richiede alcuna modifica qui.
-- ============================================================================

create schema if not exists finsteady;
grant usage on schema finsteady to authenticated;

-- ----------------------------------------------------------------------------
-- Funzione di appoggio: "updatedAt" sempre autorevole lato server, per non dipendere
-- dall'orologio (potenzialmente sfasato) di ciascun dispositivo nel confronto "chi ha
-- l'ultima modifica" usato dal client per i conflitti (last-write-wins).
-- ----------------------------------------------------------------------------
create or replace function finsteady.set_updated_at()
returns trigger language plpgsql as $$
begin
  new."updatedAt" := now();
  return new;
end;
$$;

-- ============================================================================
-- profili_cloud — registro leggero dei Profili collegati al cloud
-- ============================================================================
create table if not exists finsteady.profili_cloud (
  "cloudId" uuid primary key,
  "userId" uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  "numeroRecord" int,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz
);

alter table finsteady.profili_cloud enable row level security;

drop policy if exists "solo i propri profili" on finsteady.profili_cloud;
create policy "solo i propri profili" on finsteady.profili_cloud
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

drop trigger if exists trg_updated_at on finsteady.profili_cloud;
create trigger trg_updated_at before insert or update on finsteady.profili_cloud
  for each row execute function finsteady.set_updated_at();

create index if not exists idx_profili_cloud_user on finsteady.profili_cloud ("userId");

grant select, insert, update, delete on finsteady.profili_cloud to authenticated;

-- ============================================================================
-- record_sync — tutti i record di dominio di tutti gli store, di tutti i Profili collegati
-- ============================================================================
create table if not exists finsteady.record_sync (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null default auth.uid() references auth.users(id) on delete cascade,
  "profiloCloudId" uuid not null references finsteady.profili_cloud("cloudId") on delete cascade,
  store text not null,
  "recordId" text not null,
  dati jsonb not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz,
  unique ("profiloCloudId", store, "recordId")
);

alter table finsteady.record_sync enable row level security;

drop policy if exists "solo i propri record" on finsteady.record_sync;
create policy "solo i propri record" on finsteady.record_sync
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

drop trigger if exists trg_updated_at on finsteady.record_sync;
create trigger trg_updated_at before insert or update on finsteady.record_sync
  for each row execute function finsteady.set_updated_at();

-- Indice usato dal pull (filtra per Profilo cloud, ordina/filtra per updatedAt).
create index if not exists idx_record_sync_pull on finsteady.record_sync ("profiloCloudId", "updatedAt");

grant select, insert, update, delete on finsteady.record_sync to authenticated;
