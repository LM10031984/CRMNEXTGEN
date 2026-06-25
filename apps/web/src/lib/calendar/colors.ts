/**
 * Codes couleur Google Calendar (colorId) pour les 3 types d'événements QualiOF.
 *
 * Les colorId Google sont des strings (cf. Events: colorId — palette par défaut) :
 *   - '7' = Paon (bleu)      → formation (la session elle-même)
 *   - '6' = Mandarine (orange) → rappel (convocation J-15 → J-1)
 *   - '3' = Raisin (violet)  → froid (satisfaction à froid 1m / 1m15j / 2m)
 *
 * Module pur, worker-safe (aucun import).
 */
export const CALENDAR_COLORS = {
  formation: '7',
  rappel: '6',
  froid: '3',
} as const;

export type CalendarColorKey = keyof typeof CALENDAR_COLORS;
