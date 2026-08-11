// Client Supabase condiviso — unico punto di inizializzazione, sullo stesso principio di
// storage.js per IndexedDB: nessun altro modulo crea un proprio client.
//
// SDK caricato via import ESM nativo da CDN (esm.sh): il progetto non ha un bundler né npm
// (vanilla JS, VS Code Live Server), quindi non installiamo @supabase/supabase-js come
// dipendenza npm — l'import funziona così com'è, direttamente nel browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Schema Postgres dedicato (non il default "public"), come per gli altri progetti Supabase
// dell'utente — deve corrispondere esattamente allo schema creato da supabase/schema.sql e
// esposto in Project Settings → API → "Exposed schemas" (passaggio manuale, vedi
// SETUP-SUPABASE.md: non basta eseguire lo script SQL).
export const SCHEMA_SYNC = 'finsteady';

// true solo se js/sync/config.js è stato compilato (vedi SETUP-SUPABASE.md). Finché è false,
// il Sync Cloud resta completamente disattivato e l'app si comporta come prima di questa Fase.
export const SYNC_CONFIGURATO = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// db.schema imposta lo schema di default per .from()/.rpc(): così syncEngine.js non deve
// ripetere .schema(SCHEMA_SYNC) ad ogni chiamata. Le API di autenticazione (supabase.auth.*)
// non sono influenzate da questa impostazione, restano sullo schema interno "auth" di Supabase.
export const supabase = SYNC_CONFIGURATO
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: SCHEMA_SYNC } })
  : null;
