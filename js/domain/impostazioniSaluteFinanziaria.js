// Dominio: preferenze Salute Finanziaria — quale Fondo è designato come Fondo Emergenza (il
// modello non ha un flag apposito su Fondo: l'utente lo designa esplicitamente qui), il periodo
// scelto per Crescita patrimoniale/Tasso di risparmio (3, 6 o 12 mesi), e come si compone la
// "spesa mensile stimata" usata per i Mesi di autonomia — configurabile, non solo la somma dei
// Budget attivi:
// - budgetBundleAttivo: la voce di default "tutti i Budget attivi", con una spunta per toglierla;
// - vociAutonomia[]: voci aggiuntive, di tre tipi:
//   - 'budgetSingolo' (budgetId): un Budget specifico non già coperto dal bundle di default;
//   - 'risparmioAnnuale' (fondoId): importo mensile = obiettivo complessivo del Fondo ÷ 12 — un
//     Fondo che accumula per le spese dell'anno prossimo va alimentato un dodicesimo alla
//     volta; disponibile solo per Fondi con Obiettivi (l'obiettivo complessivo è calcolabile
//     solo da quelli, coerentemente con calcolaDatiFondo);
//   - 'risparmioMensile' (fondoId, importo): importo mensile inserito a mano, per qualunque Fondo.

import { dbGet, dbPut } from '../storage.js';
import { generaId } from '../utils/uuid.js';

const STORE = 'impostazioniSaluteFinanziaria';
const CHIAVE = 'globale';

const DEFAULT = { id: CHIAVE, fondoEmergenzaId: null, periodoMesi: 12, budgetBundleAttivo: true, vociAutonomia: [] };

export async function ottieniImpostazioniSaluteFinanziaria() {
  const record = await dbGet(STORE, CHIAVE);
  if (!record) return DEFAULT;
  // Compatibilità con record salvati prima dell'introduzione delle voci configurabili.
  return { ...DEFAULT, ...record, vociAutonomia: record.vociAutonomia || [] };
}

export async function impostaFondoEmergenza(fondoId) {
  const attuale = await ottieniImpostazioniSaluteFinanziaria();
  await dbPut(STORE, { ...attuale, fondoEmergenzaId: fondoId || null });
}

export async function impostaPeriodoSaluteFinanziaria(periodoMesi) {
  if (![3, 6, 12].includes(Number(periodoMesi))) throw new Error('Periodo non valido: scegli 3, 6 o 12 mesi.');
  const attuale = await ottieniImpostazioniSaluteFinanziaria();
  await dbPut(STORE, { ...attuale, periodoMesi: Number(periodoMesi) });
}

export async function impostaBudgetBundleAttivo(attivo) {
  const attuale = await ottieniImpostazioniSaluteFinanziaria();
  await dbPut(STORE, { ...attuale, budgetBundleAttivo: !!attivo });
}

export async function aggiungiVoceAutonomia(voce) {
  if (!['budgetSingolo', 'risparmioAnnuale', 'risparmioMensile'].includes(voce.tipo)) {
    throw new Error('Tipo di voce non valido.');
  }
  if (voce.tipo === 'budgetSingolo' && !voce.budgetId) throw new Error('Seleziona un Budget.');
  if (voce.tipo === 'risparmioAnnuale' && !voce.fondoId) throw new Error('Seleziona un Fondo con Obiettivi.');
  if (voce.tipo === 'risparmioMensile') {
    if (!voce.fondoId) throw new Error('Seleziona un Fondo.');
    if (!voce.importo || Number(voce.importo) <= 0) throw new Error('Indica un importo mensile maggiore di zero.');
  }
  const attuale = await ottieniImpostazioniSaluteFinanziaria();
  const nuova = { id: generaId(), ...voce };
  await dbPut(STORE, { ...attuale, vociAutonomia: [...attuale.vociAutonomia, nuova] });
  return nuova;
}

export async function rimuoviVoceAutonomia(voceId) {
  const attuale = await ottieniImpostazioniSaluteFinanziaria();
  await dbPut(STORE, { ...attuale, vociAutonomia: attuale.vociAutonomia.filter((v) => v.id !== voceId) });
}
