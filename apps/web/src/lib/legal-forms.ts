/** Helpers sync sur les formes juridiques. Utilisable depuis composants client ET serveur. */

export const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] as const;

export function isSoloForm(legalForm: string): boolean {
  return (SOLO_FORMS as readonly string[]).includes(legalForm);
}

/**
 * Formes juridiques dont le payeur est une PERSONNE PHYSIQUE — régime du
 * **contrat de formation professionnelle** (L6353-3 : conclu à titre individuel
 * et à ses frais, délai de rétractation), et non de la convention.
 *
 * Règle métier figée par Laurent le 12/08/2026 : une convention là où le Code
 * du travail exige un contrat (ou l'inverse) est une non-conformité en audit.
 * Vrai même quand l'AGEFICE rembourse ensuite — le payeur reste la personne.
 *
 * = SOLO_FORMS + PARTICULIER. `SOLO_FORMS` répond à une autre question
 * (« l'apprenant est-il son propre employeur ? ») et n'inclut donc pas
 * PARTICULIER ; les deux notions se recouvrent sans être identiques.
 */
export const CONTRAT_INDIVIDUEL_FORMS = [...SOLO_FORMS, 'PARTICULIER'] as const;

/** true si ce commanditaire relève du contrat individuel, pas de la convention. */
export function requiresContratIndividuel(legalForm: string | null | undefined): boolean {
  if (!legalForm) return false;
  return (CONTRAT_INDIVIDUEL_FORMS as readonly string[]).includes(legalForm);
}
