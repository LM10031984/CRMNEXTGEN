/** Helpers sync sur les formes juridiques. Utilisable depuis composants client ET serveur. */

export const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] as const;

export function isSoloForm(legalForm: string): boolean {
  return (SOLO_FORMS as readonly string[]).includes(legalForm);
}
