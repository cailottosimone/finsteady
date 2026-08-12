// Dominio: Riparazione — ripulisce automaticamente i movimenti e gli Storni ormai orfani
// (riferiti a Conti/Fondi/Obiettivi/Allocazioni che non esistono più), esattamente le stesse
// categorie di problemi rilevate da engine/integrityCheck.js ("Movimento orfano",
// "Trasferimento sbilanciato", "Storno incoerente").
//
// Perché può succedere: eliminare un Fondo/Conto/Obiettivo (o un movimento tramite "Elimina"
// nel Registro) lascia orfano tutto ciò che lo referenziava, se non viene ripulito a cascata.
// Questa funzione è il rimedio per i casi già esistenti nel database; le eliminazioni più
// recenti (vedi domain/fondi.js, conti.js, obiettivi.js) puliscono già a cascata, per evitare
// che il problema si ripresenti in futuro.
//
// Azione distruttiva e irreversibile sui record orfani stessi (che comunque non hanno più
// alcun significato, puntando a entità inesistenti): la UI deve chiedere conferma esplicita.

import { dbGetAll, dbDelete } from '../storage.js';

export async function ripulisciTuttoOrfano() {
  const [conti, fondi, obiettivi, budget, budgetCicli, allocazioni, righe, uscite, trasferimenti, rettifiche, storni] = await Promise.all([
    dbGetAll('conti'), dbGetAll('fondi'), dbGetAll('obiettivi'), dbGetAll('budget'), dbGetAll('budgetCicli'),
    dbGetAll('allocazioni'), dbGetAll('allocazioniRighe'), dbGetAll('uscite'), dbGetAll('trasferimenti'),
    dbGetAll('rettifiche'), dbGetAll('storni')
  ]);

  const idConti = new Set(conti.map((c) => c.id));
  const idFondi = new Set(fondi.map((f) => f.id));
  const idObiettivi = new Set(obiettivi.map((o) => o.id));
  const idBudget = new Set(budget.map((b) => b.id));
  const idAllocazioni = new Set(allocazioni.map((a) => a.id));
  // 'budget' mancava: un Trasferimento generato in chiusura Ciclo ha tipoOrigine/tipoDestinazione
  // 'budget' — senza questo caso, veniva scambiato per orfano e cancellato per errore anche
  // quando il Budget esisteva ancora.
  const esisteEntita = (tipo, id) => {
    if (tipo === 'conto') return idConti.has(id);
    if (tipo === 'fondo') return idFondi.has(id);
    if (tipo === 'budget') return idBudget.has(id);
    return idObiettivi.has(id);
  };

  const rimossi = { righe: 0, uscite: 0, trasferimenti: 0, rettifiche: 0, storni: 0, cicliBudget: 0 };

  // Cicli Budget orfani: il Budget a cui appartenevano è stato eliminato (poteva succedere
  // prima che eliminaBudget bloccasse la cancellazione in presenza di storico).
  const cicliDaRimuovere = budgetCicli.filter((c) => !idBudget.has(c.budgetId));
  for (const c of cicliDaRimuovere) { await dbDelete('budgetCicli', c.id); rimossi.cicliBudget++; }

  const righeDaRimuovere = righe.filter((r) =>
    !idAllocazioni.has(r.allocazioneId) ||
    (r.tipoDestinazione === 'fondo' && !idFondi.has(r.destinazioneId)) ||
    (r.tipoDestinazione === 'obiettivo' && !idObiettivi.has(r.destinazioneId))
  );
  for (const r of righeDaRimuovere) { await dbDelete('allocazioniRighe', r.id); rimossi.righe++; }

  const usciteDaRimuovere = uscite.filter((u) => !idFondi.has(u.fondoId) || (u.obiettivoId && !idObiettivi.has(u.obiettivoId)));
  for (const u of usciteDaRimuovere) { await dbDelete('uscite', u.id); rimossi.uscite++; }

  const trasferimentiDaRimuovere = trasferimenti.filter((t) =>
    !esisteEntita(t.tipoOrigine, t.origineId) || !esisteEntita(t.tipoDestinazione, t.destinazioneId)
  );
  for (const t of trasferimentiDaRimuovere) { await dbDelete('trasferimenti', t.id); rimossi.trasferimenti++; }

  const rettificheDaRimuovere = rettifiche.filter((r) => {
    const tipo = r.tipoEntita || 'conto'; // compatibilità con Rettifiche precedenti la generalizzazione
    const id = r.entitaId || r.contoId;
    return !esisteEntita(tipo, id);
  });
  for (const r of rettificheDaRimuovere) { await dbDelete('rettifiche', r.id); rimossi.rettifiche++; }

  // Storni: sia quelli già orfani in partenza, sia quelli dei movimenti appena rimossi sopra.
  const idRigheEliminate = new Set(righeDaRimuovere.map((r) => r.id));
  const idUsciteEliminate = new Set(usciteDaRimuovere.map((u) => u.id));
  const idTrasferimentiEliminati = new Set(trasferimentiDaRimuovere.map((t) => t.id));
  const idRettificheEliminate = new Set(rettificheDaRimuovere.map((r) => r.id));

  const idRigheValide = new Set(righe.map((r) => r.id).filter((id) => !idRigheEliminate.has(id)));
  const idUsciteValide = new Set(uscite.map((u) => u.id).filter((id) => !idUsciteEliminate.has(id)));
  const idTrasferimentiValidi = new Set(trasferimenti.map((t) => t.id).filter((id) => !idTrasferimentiEliminati.has(id)));
  const idRettificheValide = new Set(rettifiche.map((r) => r.id).filter((id) => !idRettificheEliminate.has(id)));

  for (const s of storni) {
    const esiste =
      (s.tipoMovimento === 'allocazioneRiga' && idRigheValide.has(s.movimentoId)) ||
      (s.tipoMovimento === 'uscita' && idUsciteValide.has(s.movimentoId)) ||
      (s.tipoMovimento === 'trasferimento' && idTrasferimentiValidi.has(s.movimentoId)) ||
      (s.tipoMovimento === 'rettifica' && idRettificheValide.has(s.movimentoId));
    if (!esiste) { await dbDelete('storni', s.id); rimossi.storni++; }
  }

  return rimossi;
}
