// Dominio: Allegati — ricevute o documenti opzionali collegati a un'Entrata (Allocazione) o a
// un'Uscita. Non obbligatorio, non modifica alcun saldo: è solo un riferimento aggiuntivo per
// ritrovare in futuro cosa giustificava un movimento reale già tracciato.
//
// Il file (se caricato) viene salvato come data URL (stringa base64) direttamente nel record:
// più semplice e robusto di un Blob con URL temporaneo, che smetterebbe di funzionare dopo un
// ricaricamento della pagina. Va usato solo per immagini/documenti di dimensioni ragionevoli
// (una ricevuta, non un video) — IndexedDB non ha un limite pratico stretto, ma un file enorme
// appesantirebbe comunque il database.

import { dbAdd, dbGet, dbGetAll, dbGetAllByIndex, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';

const STORE = 'allegati';

export async function elencoAllegatiPerMovimento(movimentoId) {
  return dbGetAllByIndex(STORE, 'movimentoId', movimentoId);
}

export async function elencoTuttiGliAllegati() {
  return dbGetAll(STORE);
}

// dati: { tipoMovimento: 'allocazione'|'uscita', movimentoId, nomeFile?, tipoMime?, contenuto?
//         (data URL), percorsoRiferimento?, note? } — tutti i campi descrittivi sono opzionali,
// ma va fornito almeno uno tra contenuto, percorsoRiferimento o note (altrimenti non c'è nulla
// da allegare).
export async function aggiungiAllegato(dati) {
  if (!dati.movimentoId) throw new Error('Allegato senza movimento collegato.');
  const percorso = dati.percorsoRiferimento ? dati.percorsoRiferimento.trim() : '';
  const note = dati.note ? dati.note.trim() : '';
  if (!dati.contenuto && !percorso && !note) {
    throw new Error('Aggiungi almeno un file, un percorso di riferimento o una nota per l\'allegato.');
  }

  const allegato = {
    id: generaId(),
    tipoMovimento: dati.tipoMovimento,
    movimentoId: dati.movimentoId,
    nomeFile: dati.nomeFile || null,
    tipoMime: dati.tipoMime || null,
    contenuto: dati.contenuto || null,
    percorsoRiferimento: percorso,
    note,
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE, allegato);
  return allegato;
}

export async function ottieniAllegato(id) {
  return dbGet(STORE, id);
}

export async function eliminaAllegato(id) {
  await dbDelete(STORE, id);
}
