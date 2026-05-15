/**
 * Formate un IBAN avec un espace tous les 4 caractères.
 *
 * Ex: 'FR7612345678901234567890123' → 'FR76 1234 5678 9012 3456 7890 123'
 *
 * Caractéristiques :
 *  - Idempotent : les espaces déjà présents sont normalisés d'abord (cf. Test 3).
 *  - Tolérant : retourne '' pour `null`, `undefined`, ou chaîne vide (cf. Tests 2/4).
 *  - Insensible à la casse : force en MAJUSCULES (cohérent avec normalizeIban
 *    côté Zod, cf. packages/shared/src/schemas/tenant.ts).
 *
 * Utilisé en read mode dans la section "Coordonnées bancaires" de la page
 * Paramètres (Phase 7 Plan 07-04 — section RIB OF). Le stockage BDD reste
 * en forme compacte (sans espaces) ; les espaces sont purement cosmétiques.
 */
export function formatIban(s: string | null | undefined): string {
  if (!s) return '';
  const clean = s.replace(/\s/g, '').toUpperCase();
  if (!clean) return '';
  return clean.replace(/(.{4})/g, '$1 ').trim();
}
