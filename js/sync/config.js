// Configurazione Sync Cloud (Supabase) — Fase 6.
//
// Da compilare a mano DOPO aver creato un progetto su supabase.com (consigliata una regione UE,
// es. Frankfurt) ed eseguito lo script supabase/schema.sql nel suo SQL Editor. Procedura
// completa in SETUP-SUPABASE.md, nella cartella principale del repository.
//
// SUPABASE_URL e SUPABASE_ANON_KEY si trovano in: progetto Supabase → Project Settings → API.
// La "anon key" è pensata per stare nel codice client (la sicurezza reale la fa la Row Level
// Security abilitata dallo schema): non è comunque una buona pratica versionarla in un
// repository pubblico. Se pubblichi questo progetto, aggiungi questo file a .gitignore e
// distribuisci al suo posto un config.example.js con i valori vuoti.
//
// Finché questi due valori restano vuoti, il Sync Cloud resta disattivato: l'app funziona
// esattamente come prima, solo in locale (vedi supabaseClient.js).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
