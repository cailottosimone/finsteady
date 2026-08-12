// js/data/cloud.js — unico file che sa dell'esistenza di Supabase. Il resto dell'app (viste,
// domini, motore di calcolo) non lo importa mai direttamente: passa sempre da data/syncProfilo.js
// (per il Profilo attivo) o da domain/cloudProfili.js (per operazioni su Profili non attivi,
// come scaricare un Profilo cloud come nuovo Profilo locale). Se in futuro si cambiasse
// provider cloud, è questo l'unico file da riscrivere.
//
// Schema cloud (vedi supabase/schema.sql): due tabelle.
// - profili_cloud: un registro leggero, una riga per Profilo collegato al cloud (cloudId, nome,
//   quando aggiornato) — usato per mostrare la lista dei Profili disponibili da collegare/
//   scaricare, senza dover interrogare tutte le tabelle di dati.
// - record_sync: tutti i record di dominio di tutti i Profili, una riga per record, con lo
//   store di provenienza e il Profilo cloud di appartenenza (profiloCloudId) — vedi
//   js/data/config.js per il perché di questa scelta (tabella generica invece che una tabella
//   tipizzata per store come in preventivi3d).

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from './config.js';

let clientPromise = null;

/** Crea il client Supabase al primo utilizzo (import dinamico da CDN: nessuna dipendenza da
 * npm/build step). Se il caricamento fallisce (es. app aperta offline la primissima volta)
 * ritorna null: chi chiama deve trattarlo come "cloud non disponibile ora", mai come errore
 * fatale. */
export function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: SUPABASE_SCHEMA } });
    } catch (err) {
      console.warn('Client Supabase non disponibile (probabilmente offline):', err);
      clientPromise = null; // permette di riprovare al prossimo giro, non blocca per sempre
      return null;
    }
  })();
  return clientPromise;
}

/* ---------------------------------------------------------------------- */
/* record_sync — i dati dei singoli record, di dominio                     */
/* ---------------------------------------------------------------------- */

/** Invia (upsert) un singolo record verso 'record_sync'. Ritorna true se andato a buon fine,
 * false se va ritentato più tardi (errore di rete/temporaneo). */
export async function pushRecord(profiloCloudId, storeName, recordId, dati) {
  const client = await getClient();
  if (!client) return false;
  const { error } = await client
    .from('record_sync')
    .upsert(
      { profiloCloudId, store: storeName, recordId: String(recordId), dati },
      { onConflict: 'profiloCloudId,store,recordId' }
    );
  if (error) {
    console.warn(`Cloud Sync: push fallito per ${storeName}/${recordId}:`, error.message);
    return false;
  }
  return true;
}

/** Recupera dal cloud tutte le righe del Profilo (profiloCloudId) modificate dopo sinceISO
 * (null = da sempre, per il primo popolamento). RLS garantisce che tornino solo righe
 * dell'utente autenticato: nessun filtro per utente da scrivere qui. Il filtro per
 * profiloCloudId invece è ESSENZIALE e va scritto sempre: senza, righe di un altro Profilo
 * dello stesso account potrebbero mescolarsi con quelle del Profilo attivo, violando
 * l'isolamento totale tra Profili richiesto dal FDD. */
export async function pullChanges(profiloCloudId, sinceISO) {
  const client = await getClient();
  if (!client) return null; // null = "non disponibile ora", distinto da [] = "nessuna novità"
  let query = client
    .from('record_sync')
    .select('*')
    .eq('profiloCloudId', profiloCloudId)
    .order('updatedAt', { ascending: true });
  if (sinceISO) query = query.gt('updatedAt', sinceISO);
  const { data, error } = await query;
  if (error) {
    console.warn('Cloud Sync: pull fallito:', error.message);
    return null;
  }
  return data;
}

/* ---------------------------------------------------------------------- */
/* profili_cloud — registro leggero dei Profili collegati al cloud         */
/* ---------------------------------------------------------------------- */

/** Crea/aggiorna la riga di registro del Profilo cloud (nome corrente, quanti record ha).
 * Chiamata dopo ogni push riuscito, così la lista "Profili disponibili sul cloud" resta
 * aggiornata anche vista da altri dispositivi. */
export async function upsertProfiloCloud(cloudId, nome, numeroRecord) {
  const client = await getClient();
  if (!client) return false;
  const { error } = await client
    .from('profili_cloud')
    .upsert({ cloudId, nome, numeroRecord }, { onConflict: 'cloudId' });
  if (error) {
    console.warn('Cloud Sync: aggiornamento registro Profilo cloud fallito:', error.message);
    return false;
  }
  return true;
}

/** Elenco dei Profili cloud dell'utente autenticato (RLS li filtra già per userId). */
export async function elencoProfiliCloud() {
  const client = await getClient();
  if (!client) return null;
  const { data, error } = await client
    .from('profili_cloud')
    .select('*')
    .order('updatedAt', { ascending: false });
  if (error) {
    console.warn('Cloud Sync: lettura registro Profili cloud fallita:', error.message);
    return null;
  }
  return data;
}
