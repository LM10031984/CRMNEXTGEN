/**
 * Formule countdown "dans X jours" pour les rappels quotidiens J-15 → veille.
 *
 * Module pur, worker-safe (aucun import externe, aucune dépendance réseau).
 * Le repo n'embarque aucune librairie de manipulation de dates (cf STACK.md) —
 * calcul natif via l'objet Date en UTC uniquement.
 *
 * Usage (Plan 14-04) : l'orchestrateur calcule `daysUntil` via `daysBetween`
 * entre la date du rappel et la date de début, puis interpole la phrase via
 * `countdownLabel`.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Phrase de compte à rebours, selon le nombre de jours restants :
 *   - 0 (ou négatif) → "aujourd'hui"
 *   - 1              → "demain"
 *   - n > 1          → "dans N jours"
 */
export function countdownLabel(daysUntil: number): string {
  const n = Math.max(0, Math.floor(daysUntil));
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  return `dans ${n} jours`;
}

/**
 * Différence en jours calendaires entiers entre deux dates, en UTC.
 * La composante horaire est ignorée : on tronque chaque date à minuit UTC
 * avant de soustraire (floor sur la différence en jours).
 *
 * Exemple : daysBetween(2026-06-01, 2026-06-16) → 15.
 */
export function daysBetween(from: Date, to: Date): number {
  const fromMidnight = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const toMidnight = Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate(),
  );
  return Math.floor((toMidnight - fromMidnight) / MS_PER_DAY);
}
