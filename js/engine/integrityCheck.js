// Verifica della coerenza patrimoniale (§5.20 FDD):
// Saldo di un Conto = Fondi del Conto + Liquidità non allocata
//
// Il Budget NON compare in questa formula, mai — decisione esplicita e definitiva dell'utente:
// "il Budget non è patrimonio". Anche con un Ciclo Budget aperto, il suo importo assegnato non
// entra nel conteggio: resta operatività, non patrimonio, finché non diventa esplicitamente un
// movimento reale. Solo a chiusura ciclo, se un avanzo (o una copertura di sforamento) genera un
// vero Trasferimento verso/da un Fondo, quell'importo entra allora nel conteggio — ma a quel
// punto è già un movimento tracciato su un Fondo, non più "Budget" nella formula.

// Tolleranza di arrotondamento: al di sotto di mezzo centesimo, un residuo di calcolo
// (dovuto ai limiti dell'aritmetica in virgola mobile, es. 100 - 33.33 - 33.33 - 33.34)
// viene considerato zero. Non è un'eccezione alla regola di unicità del denaro (§5.2):
// è la normale precisione dei numeri a virgola mobile applicata a valute arrotondate al centesimo.
const TOLLERANZA_ARROTONDAMENTO = 0.005;

function arrotondaACentesimo(valore) {
  const arrotondato = Math.round(valore * 100) / 100;
  // Normalizza -0 a 0: (-0).toLocaleString() in alcuni motori produce "-0,00 €",
  // fuorviante per l'utente pur essendo matematicamente equivalente a zero.
  return arrotondato === 0 ? 0 : arrotondato;
}

export function verificaIntegritaConto(conto, tuttiIFondi) {
  const fondiDelConto = tuttiIFondi.filter((f) => f.contoId === conto.id);
  const totaleFondi = fondiDelConto.reduce((somma, f) => somma + (Number(f.saldo) || 0), 0);

  const liquiditaGrezza = (Number(conto.saldoReale) || 0) - totaleFondi;
  const liquiditaNonAllocata = arrotondaACentesimo(liquiditaGrezza);

  return {
    totaleFondi: arrotondaACentesimo(totaleFondi),
    liquiditaNonAllocata,
    coerente: liquiditaNonAllocata >= -TOLLERANZA_ARROTONDAMENTO
  };
}

export function verificaIntegritaGlobale(conti, fondi) {
  return conti.map((conto) => ({
    conto,
    ...verificaIntegritaConto(conto, fondi)
  }));
}

// --- Verifica di Integrità Patrimoniale (evoluzione proposta dall'utente) ---
//
// Un "controllo di salute" complessivo dell'app: oltre alla coerenza Conto/Fondi già sopra,
// verifica anche fondi negativi, obiettivi che superano il proprio fondo, riferimenti rotti
// tra entità (movimenti orfani) e storni incoerenti. Funzione pura: riceve le collezioni già
// caricate e restituisce solo un elenco di problemi, senza mai accedere a IndexedDB.
export function eseguiVerificaIntegritaCompleta({
  conti, fondi, obiettivi, budget, budgetCicli = [], allocazioni, righeAllocazione, uscite, trasferimenti, rettifiche, storni
}) {
  const problemi = [];
  const aggiungi = (categoria, messaggio) => problemi.push({ categoria, messaggio });

  // 1. Saldo Conto = Fondi + Liquidità libera
  verificaIntegritaGlobale(conti, fondi)
    .filter((v) => !v.coerente)
    .forEach((v) => aggiungi('Saldo Conto', `Conto "${v.conto.nome}": liquidità non allocata ${v.liquiditaNonAllocata} (i Fondi superano il saldo reale).`));

  // 1b. Nessun Conto di tipo "Spesa" con saldo diverso da zero (decisione esplicita dell'utente:
  // un Conto Spesa deve sempre tornare a zero; se capita altrimenti va sempre segnalato).
  conti.forEach((c) => {
    if (c.tipologia === 'spesa' && Math.abs(Number(c.saldoReale) || 0) > TOLLERANZA_ARROTONDAMENTO) {
      aggiungi('Conto Spesa con saldo', `Il Conto "${c.nome}" è di tipo Spesa ma ha un saldo di ${c.saldoReale} invece di zero.`);
    }
  });

  // 2. Nessun Fondo con saldo negativo
  fondi.forEach((f) => {
    if (f.saldo < -TOLLERANZA_ARROTONDAMENTO) aggiungi('Fondo negativo', `Il Fondo "${f.nome}" ha saldo negativo (${f.saldo}).`);
  });

  // 3. Nessun Obiettivo con saldo superiore al Fondo
  fondi.forEach((f) => {
    const totaleObiettivi = obiettivi
      .filter((o) => o.fondoId === f.id)
      .reduce((s, o) => s + (Number(o.saldoAccumulato) || 0), 0);
    if (totaleObiettivi > f.saldo + TOLLERANZA_ARROTONDAMENTO) {
      aggiungi('Obiettivi vs Fondo', `Nel Fondo "${f.nome}" gli Obiettivi accumulano ${totaleObiettivi} ma il Fondo ha solo ${f.saldo}.`);
    }
  });

  // 4. Movimenti orfani: riferimenti a entità che non esistono più
  const idConti = new Set(conti.map((c) => c.id));
  const idFondi = new Set(fondi.map((f) => f.id));
  const idObiettivi = new Set(obiettivi.map((o) => o.id));
  const idAllocazioni = new Set(allocazioni.map((a) => a.id));

  fondi.forEach((f) => { if (!idConti.has(f.contoId)) aggiungi('Movimento orfano', `Il Fondo "${f.nome}" fa riferimento a un Conto inesistente.`); });
  obiettivi.forEach((o) => { if (!idFondi.has(o.fondoId)) aggiungi('Movimento orfano', `L'Obiettivo "${o.nome}" fa riferimento a un Fondo inesistente.`); });
  budget.forEach((b) => { if (!idConti.has(b.contoId)) aggiungi('Movimento orfano', `Il Budget "${b.nome}" fa riferimento a un Conto inesistente.`); });

  // Ciclo Budget orfano: il Budget a cui apparteneva è stato eliminato (poteva succedere prima
  // che eliminaBudget bloccasse la cancellazione in presenza di storico — segnalato dall'utente).
  const idBudgetEsistenti = new Set(budget.map((b) => b.id));
  budgetCicli.forEach((c) => {
    if (!idBudgetEsistenti.has(c.budgetId)) {
      aggiungi('Ciclo Budget orfano', `Un Ciclo Budget (${c.stato}) fa riferimento a un Budget inesistente.`);
    }
  });

  righeAllocazione.forEach((r) => {
    if (!idAllocazioni.has(r.allocazioneId)) aggiungi('Movimento orfano', 'Una riga di Allocazione fa riferimento a un\'Allocazione inesistente.');
    if (r.tipoDestinazione === 'fondo' && !idFondi.has(r.destinazioneId)) aggiungi('Movimento orfano', 'Una riga di Allocazione fa riferimento a un Fondo inesistente.');
    if (r.tipoDestinazione === 'obiettivo' && !idObiettivi.has(r.destinazioneId)) aggiungi('Movimento orfano', 'Una riga di Allocazione fa riferimento a un Obiettivo inesistente.');
  });

  uscite.forEach((u) => {
    if (!idFondi.has(u.fondoId)) aggiungi('Movimento orfano', 'Un\'Uscita fa riferimento a un Fondo inesistente.');
    if (u.obiettivoId && !idObiettivi.has(u.obiettivoId)) aggiungi('Movimento orfano', 'Un\'Uscita fa riferimento a un Obiettivo inesistente.');
  });

  rettifiche.forEach((r) => {
    const tipo = r.tipoEntita || 'conto'; // compatibilità con Rettifiche precedenti la generalizzazione
    const id = r.entitaId || r.contoId;
    const esiste = tipo === 'conto' ? idConti.has(id) : tipo === 'fondo' ? idFondi.has(id) : idObiettivi.has(id);
    if (!esiste) aggiungi('Movimento orfano', `Una Rettifica (${tipo}) fa riferimento a un elemento inesistente.`);
  });

  // 5. Nessun Trasferimento sbilanciato (origine o destinazione che puntano a entità inesistenti)
  // NOTA: un Trasferimento può avere tipoOrigine/tipoDestinazione 'budget' (movimenti di
  // chiusura Ciclo: avanzo trasferito a un Fondo, sforamento coperto da un Fondo) — mancava dal
  // controllo, causando un falso "l'origine non esiste più" per ogni chiusura con residuo.
  const idBudget = new Set(budget.map((b) => b.id));
  const esisteEntita = (tipo, id) => {
    if (tipo === 'conto') return idConti.has(id);
    if (tipo === 'fondo') return idFondi.has(id);
    if (tipo === 'budget') return idBudget.has(id);
    return idObiettivi.has(id);
  };
  trasferimenti.forEach((t) => {
    if (!esisteEntita(t.tipoOrigine, t.origineId)) aggiungi('Trasferimento sbilanciato', 'Un Trasferimento ha un\'origine che non esiste più.');
    if (!esisteEntita(t.tipoDestinazione, t.destinazioneId)) aggiungi('Trasferimento sbilanciato', 'Un Trasferimento ha una destinazione che non esiste più.');
  });

  // 6. Nessuna Allocazione (o Uscita/Trasferimento) stornata in modo incoerente: ogni riga
  // marcata "stornata" deve avere esattamente uno Storno collegato, e viceversa.
  const storniAllocazioneRiga = storni.filter((s) => s.tipoMovimento === 'allocazioneRiga');
  const idRigheConStorno = new Set(storniAllocazioneRiga.map((s) => s.movimentoId));
  const idRigheEsistenti = new Set(righeAllocazione.map((r) => r.id));

  righeAllocazione.filter((r) => r.stornata).forEach((r) => {
    if (!idRigheConStorno.has(r.id)) aggiungi('Storno incoerente', 'Una riga di Allocazione risulta stornata ma non ha un record di Storno collegato.');
  });
  storniAllocazioneRiga.forEach((s) => {
    if (!idRigheEsistenti.has(s.movimentoId)) aggiungi('Storno incoerente', 'Uno Storno fa riferimento a una riga di Allocazione inesistente.');
  });

  uscite.filter((u) => u.stornata).forEach((u) => {
    if (!storni.some((s) => s.tipoMovimento === 'uscita' && s.movimentoId === u.id)) {
      aggiungi('Storno incoerente', 'Un\'Uscita risulta stornata ma non ha un record di Storno collegato.');
    }
  });
  trasferimenti.filter((t) => t.stornata).forEach((t) => {
    if (!storni.some((s) => s.tipoMovimento === 'trasferimento' && s.movimentoId === t.id)) {
      aggiungi('Storno incoerente', 'Un Trasferimento risulta stornato ma non ha un record di Storno collegato.');
    }
  });

  rettifiche.filter((r) => r.stornata).forEach((r) => {
    if (!storni.some((s) => s.tipoMovimento === 'rettifica' && s.movimentoId === r.id)) {
      aggiungi('Storno incoerente', 'Una Rettifica risulta stornata ma non ha un record di Storno collegato.');
    }
  });

  return raggruppaProblemi(problemi);
}

// Molti problemi (soprattutto "Movimento orfano" e "Trasferimento sbilanciato") possono
// ripetersi identici decine di volte quando un Conto/Fondo eliminato viene referenziato da
// molti movimenti diversi. Mostrarli uno per uno è inutile e illeggibile: li raggruppiamo per
// testo identico, mostrando un conteggio invece di righe ripetute (es. "...(×12)").
function raggruppaProblemi(problemi) {
  const mappa = new Map();
  for (const p of problemi) {
    const chiave = `${p.categoria}|${p.messaggio}`;
    const esistente = mappa.get(chiave);
    if (esistente) esistente.conteggio += 1;
    else mappa.set(chiave, { categoria: p.categoria, messaggio: p.messaggio, conteggio: 1 });
  }
  return [...mappa.values()].map((p) => ({
    categoria: p.categoria,
    messaggio: p.conteggio > 1 ? `${p.messaggio} (×${p.conteggio})` : p.messaggio
  }));
}
