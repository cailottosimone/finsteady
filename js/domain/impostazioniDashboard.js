// Dominio: preferenze Dashboard — quali Azioni mostrare in evidenza (accanto a "Registra
// Entrata") invece che dentro il menu "Altre azioni". "Registra Entrata" è sempre in evidenza
// per definizione e non fa parte di questa lista personalizzabile.

import { dbGet, dbPut } from '../storage.js';

const STORE = 'impostazioniDashboard';
const CHIAVE = 'globale';

export async function ottieniAzioniInEvidenza() {
  const record = await dbGet(STORE, CHIAVE);
  return record ? record.azioniInEvidenza : [];
}

export async function impostaAzioniInEvidenza(azioniIds) {
  await dbPut(STORE, { id: CHIAVE, azioniInEvidenza: azioniIds });
}
