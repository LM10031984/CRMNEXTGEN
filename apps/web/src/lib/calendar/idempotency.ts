/**
 * Idempotence des événements Google Calendar QualiOF.
 *
 * Module pur, worker-safe (aucun import). Chaque événement reçoit une clé
 * déterministe par (session, type, jour) — aucune date/horodatage dans la clé,
 * sinon un re-run créerait des doublons.
 *
 * Usage en double côté orchestrateur (Plan 14-04) :
 *   (a) écrite à l'insert dans `extendedProperties.private.qualiof_key`
 *   (b) requêtée via `events.list({ privateExtendedProperty: 'qualiof_key=<clé>' })`
 *       pour décider insert vs update vs skip.
 */

export type CalendarEventType = 'formation' | 'rappel' | 'froid';

/**
 * Nom de la propriété posée sous `extendedProperties.private` qui porte la clé
 * d'idempotence. L'orchestrateur l'écrit à l'insert et la requête au re-run.
 */
export const QUALIOF_KEY_PROP = 'qualiof_key';

/**
 * Construit une clé déterministe et stable pour un événement.
 *
 * - formation : appeler SANS dayIndex → `qualiof_<code>_formation` (unique/session)
 * - rappel/froid : avec dayIndex → `qualiof_<code>_<type>_<dayIndex>`
 *
 * Le code session est mis en minuscules ; la clé ne contient que [a-z0-9_-]
 * (compatible `extendedProperties.private`).
 */
export function buildEventKey(
  sessionCode: string,
  type: CalendarEventType,
  dayIndex?: number,
): string {
  const base = `qualiof_${sessionCode.toLowerCase()}_${type}`;
  return dayIndex !== undefined ? `${base}_${dayIndex}` : base;
}
