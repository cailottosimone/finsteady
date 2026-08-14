// Dominio: preferenze Registra Entrata — dove instradare automaticamente l'eccesso quando si
// usa un Piano che non copre l'intera entrata. Di default resta "disponibilità
// residua" sul Conto di arrivo (comportamento storico); qui si può designare invece un Fondo
// specifico dove farlo confluire automaticamente — allocato direttamente come riga della stessa
// Entrata, non un'operazione separata dopo la conferma.
//
// Rimossa l'opzione "Conto diverso da quello di arrivo" (bug segnalato dall'utente): richiedeva
// un Trasferimento separato DOPO la conferma dell'Entrata, che poteva fallire in casi limite
// (es. Conto di arrivo di tipo "Spesa", che non accredita mai saldoReale) lasciando l'Entrata
// già registrata ma l'app in uno stato confuso, con un errore che non rifletteva la realtà.

import { dbGet, dbPut } from '../storage.js';

const STORE = 'impostazioniAllocazione';
const CHIAVE = 'globale';

const DEFAULT = { id: CHIAVE, destinazioneEccessoTipo: null, destinazioneEccessoId: null };

export async function ottieniImpostazioniAllocazione() {
  const record = await dbGet(STORE, CHIAVE);
  return record || DEFAULT;
}

export async function impostaDestinazioneEccesso(tipo, id) {
  if (tipo && tipo !== 'fondo') throw new Error('Tipo non valido: solo Fondo è supportato.');
  await dbPut(STORE, {
    id: CHIAVE,
    destinazioneEccessoTipo: tipo || null,
    destinazioneEccessoId: tipo ? id : null
  });
}
