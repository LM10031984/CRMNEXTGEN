/**
 * Normalisation "champ texte vidé" — SOURCE UNIQUE pour TOUS les chemins
 * d'écriture sur les champs nullable string (TrainingSession.name,
 * .internalNotes, etc.) :
 *   - modale bulk (EditSessionDetailsDialog → updateSessionDetails)
 *   - éditeurs inline (EditableField → updateSessionDetails)
 *   - futur SettingsDrawer (commit ui-e3)
 *
 * Tous convergent ici. Pas de duplication par-wrapper.
 *
 * Garde-fou Laurent ui-e2 2026-06-08 :
 *   "Remonter la normalisation '' → null (et le trim) dans la server action,
 *   pas dans chaque wrapper client. Sinon c'est exactement le pattern
 *   'layering ≠ refactoring' qui revient — tu dupliques la logique de vide
 *   à chaque nouveau point d'entrée."
 *
 * Helper PUR — pas d'I/O. Stratégie :
 *   undefined → null   (rien à mettre à jour côté wrapper inline qui efface)
 *   null      → null
 *   '   '     → null   (trim + détection de chaîne vide)
 *   '  ab  '  → 'ab'   (trim conservé pour propreté DB)
 */

export function normalizeNullableText(
  raw: string | null | undefined,
): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}
