// js/data/config.js — unico punto di configurazione del cloud, stessa architettura già in uso
// in altre app della stessa suite (vedi preventivi3d): cambiano solo questi valori, nessun
// altro file di js/data/*.js.
//
// SUPABASE_URL e SUPABASE_ANON_KEY sono pensate da Supabase per essere pubbliche nel client
// (non sono un segreto): la sicurezza reale è nelle policy RLS del database, non nel nascondere
// questi due valori.

export const SUPABASE_URL = 'https://fputmzmqupmlqxvuuypq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_UL7XwPvdFrCOy10ZJPFwEw_jts__-O2';

// Schema Postgres dedicato a FinSteady dentro al progetto Supabase condiviso dall'intera suite
// (vedi supabase/schema.sql): permette di riusare lo stesso progetto/account per più app senza
// far collidere le tabelle.
export const SUPABASE_SCHEMA = 'finsteady';

// A differenza di preventivi3d (una tabella per store, senza concetto di Profilo), FinSteady
// usa UNA sola tabella generica 'record_sync' per tutti gli store di dominio: ogni riga porta
// il nome dello store e l'intero record come JSONB, oltre a "profiloCloudId" per tenere
// separati i Profili sul cloud esattamente come lo sono in locale (database IndexedDB fisici
// distinti). Scelta deliberata: lo schema di FinSteady evolve spesso (vedi CHANGELOG, molte
// aggiunte additive di store/campi) — con una tabella tipizzata per store, come in preventivi3d,
// ogni nuovo campo o store richiederebbe una migrazione SQL parallela a quella IndexedDB. Con
// la tabella generica, aggiungere uno store in db-schema.js lo rende sincronizzabile da solo.
export { SYNCABLE_STORES } from '../db-schema.js';
