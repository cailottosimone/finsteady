-- Financial Planner — Sync Cloud: pulizia di quanto creato dalla PRIMA versione dello script
-- (quella che usava ancora lo schema "public" invece di "finsteady").
--
-- Da eseguire UNA VOLTA, solo se avevi già lanciato una versione precedente di
-- supabase/schema.sql prima che venisse spostato sullo schema dedicato "finsteady". Se il tuo
-- progetto Supabase è nuovo e hai eseguito solo la versione attuale dello script, non ti serve:
-- non hai nulla su "public" da rimuovere.
--
-- "drop table ... cascade" rimuove automaticamente anche le policy di Row Level Security
-- collegate e la appartenenza alla pubblicazione realtime (Postgres lo fa da solo quando una
-- tabella pubblicata viene eliminata): non serve rimuoverle a mano una per una.
-- Non tocca lo schema "public" in sé (resta lo schema di default di Supabase, usato per altro).

drop table if exists public.sync_records cascade;
drop function if exists public.fp_sync_upsert(uuid, text, text, jsonb, boolean, timestamptz);
