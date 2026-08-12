// Dominio: Storno — decisione esplicita dell'utente: le Allocazioni (e più in generale ogni
// movimento: righe di Allocazione, Uscite, Trasferimenti) sono eventi storici immutabili.
// Una volta registrati non si modificano né si eliminano. Se un movimento è errato, il sistema
// genera automaticamente un movimento inverso (lo Storno) che ne annulla l'effetto sul saldo,
// preservando integralmente lo storico (§5.12 "ogni modifica reversibile", §5.19 storicizzazione).
//
// La riallocazione dell'importo stornato NON è obbligatoria: l'utente potrà, in un secondo
// momento, decidere se creare un nuovo movimento verso un'altra destinazione.

import { dbAdd, dbGetAll, dbGetAllByIndex, dbDelete } from '../storage.js';
import { generaId } from '../utils/uuid.js';
import { oggiISO } from '../utils/dateUtils.js';

const STORE = 'storni';

export async function registraStorno({ tipoMovimento, movimentoId, descrizione }) {
  const storno = {
    id: generaId(),
    tipoMovimento, // 'allocazioneRiga' | 'uscita' | 'trasferimento'
    movimentoId,
    descrizione: descrizione || '',
    dataCreazione: oggiISO()
  };
  await dbAdd(STORE, storno);
  return storno;
}

export async function elencoStorni() {
  return dbGetAll(STORE);
}

export async function elencoStorniPerMovimento(movimentoId) {
  return dbGetAllByIndex(STORE, 'movimentoId', movimentoId);
}

// Elimina ogni Storno collegato ad un movimento: da chiamare SEMPRE prima di un'eliminazione
// diretta di un movimento (riga/Uscita/Trasferimento/Rettifica), altrimenti lo Storno
// resterebbe a puntare a un movimento non più esistente ("Storno incoerente").
export async function eliminaStorniPerMovimento(movimentoId) {
  const storni = await elencoStorniPerMovimento(movimentoId);
  for (const s of storni) {
    await dbDelete(STORE, s.id);
  }
}
