/**
 * Éligibilité au questionnaire de satisfaction À FROID (Qualiopi indicateur 31).
 *
 * Règle métier : la satisfaction à froid se recueille 3 à 6 mois après la
 * formation pour mesurer l'impact réel. On la considère éligible dès qu'au
 * moins 90 jours calendaires séparent la fin de session de « maintenant ».
 * Générer ce document immédiatement après la formation casserait la valeur
 * de l'indicateur (audit témoin SES-0087, 2026-06-18).
 *
 * Calcul déterministe en jours entiers (pas de smart calc, pas de Date.now()
 * implicite — `now` est injecté pour des tests reproductibles).
 */

const MS_PER_DAY = 86_400_000;

/** `true` ssi (now - sessionEndDate) ≥ 90 jours calendaires. */
export function isFroidEligible(sessionEndDate: Date, now: Date): boolean {
  const days = Math.floor((now.getTime() - sessionEndDate.getTime()) / MS_PER_DAY);
  return days >= 90;
}
