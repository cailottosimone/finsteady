// Dominio: Impostazioni Ciclo — un'unica impostazione globale per tutta l'app (decisione
// esplicita dell'utente), non configurabile per singolo Budget: mese solare oppure intervallo
// custom (es. dal 15 al 14 del mese successivo).

import { dbGet, dbPut } from '../storage.js';

const STORE = 'impostazioniCiclo';
const ID_DEFAULT = 'default';

export async function ottieniImpostazioniCiclo() {
  const esistente = await dbGet(STORE, ID_DEFAULT);
  if (esistente) return esistente;
  return { id: ID_DEFAULT, modalita: 'mese_solare', giornoInizioCustom: 15 };
}

export async function impostaImpostazioniCiclo(dati) {
  if (!['mese_solare', 'custom'].includes(dati.modalita)) {
    throw new Error('Modalità ciclo non valida: deve essere "mese_solare" o "custom".');
  }
  const giorno = Number(dati.giornoInizioCustom) || 15;
  if (giorno < 1 || giorno > 28) {
    throw new Error('Il giorno di inizio ciclo deve essere tra 1 e 28 (per evitare mesi troppo corti).');
  }
  const impostazioni = { id: ID_DEFAULT, modalita: dati.modalita, giornoInizioCustom: giorno };
  await dbPut(STORE, impostazioni);
  return impostazioni;
}
