// Autenticazione Sync Cloud — wrapper sottile su Supabase Auth (email/password). Un solo
// account reale per Profilo locale è il caso d'uso previsto (vedi note in syncEngine.js sul
// perché ogni record sincronizzato porta comunque anche l'id del Profilo locale).

import { supabase, SYNC_CONFIGURATO } from './supabaseClient.js';

export function syncDisponibile() {
  return SYNC_CONFIGURATO;
}

function richiediSupabase() {
  if (!supabase) {
    throw new Error('Sync Cloud non configurato: compila js/sync/config.js (vedi SETUP-SUPABASE.md).');
  }
}

export async function utenteCorrente() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

export async function registrati(email, password) {
  richiediSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function accedi(email, password) {
  richiediSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function esci() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// callback(utente|null) chiamato subito e a ogni cambio di stato (login/logout/refresh token).
// Ritorna una funzione per annullare l'iscrizione.
export function onCambioAuth(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evento, sessione) => {
    callback(sessione?.user || null);
  });
  return () => data.subscription.unsubscribe();
}
