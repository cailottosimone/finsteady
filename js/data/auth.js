// js/data/auth.js — login/logout e stato della sessione Cloud Sync. Login con email + password:
// nessuna dipendenza dalla posta ad ogni accesso, la sessione resta salvata nel browser di ogni
// dispositivo dopo il primo login. Stessa architettura di preventivi3d.
//
// Non conosce IndexedDB né i moduli di dominio: espone solo lo stato dell'utente e degli eventi
// di login/logout, a cui js/data/syncProfilo.js si aggancia per avviare/fermare la
// sincronizzazione del Profilo attivo.

import { getClient } from './cloud.js';

const listeners = new Set();

/** @type {{id:string,email:string}|null} */
let currentUser = null;
let initPromise = null;

function notify() {
  for (const fn of listeners) fn(currentUser);
}

/** Va chiamata una volta all'avvio dell'app: recupera l'eventuale sessione già salvata nel
 * browser e si mette in ascolto di login/logout successivi. Idempotente. */
export function initAuth() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const client = await getClient();
    if (!client) return null; // rete assente al primo avvio: si riprova al prossimo giro utile

    const { data } = await client.auth.getSession();
    currentUser = data?.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null;

    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user ? { id: session.user.id, email: session.user.email } : null;
      notify();
    });

    return currentUser;
  })();
  return initPromise;
}

export function getCurrentUser() {
  return currentUser;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function signUp(email, password) {
  const client = await getClient();
  if (!client) throw new Error('Connessione al cloud non disponibile: verifica di essere online.');
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const client = await getClient();
  if (!client) throw new Error('Connessione al cloud non disponibile: verifica di essere online.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user ? { id: data.user.id, email: data.user.email } : null;
  notify();
  return data;
}

export async function signOut() {
  const client = await getClient();
  if (client) await client.auth.signOut();
  currentUser = null;
  notify();
}
