// Genera un identificativo univoco per ogni record.
// Usa crypto.randomUUID se disponibile (browser moderni), altrimenti un fallback semplice.
export function generaId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
