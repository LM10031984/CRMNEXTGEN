/**
 * Helpers de normalisation pour la dédup et le matching à l'import.
 */

/**
 * Normalise un champ texte optionnel destiné à la BDD : trim + convergence
 * des chaînes vides / whitespace-only vers `null` (P1.2).
 *
 * Use-cases côté Server Action (typiquement les édits dialog où l'utilisateur
 * peut effacer un champ) :
 *   - `null` / `undefined`     → `null`  (champ effacé)
 *   - `''`                     → `null`  (champ effacé)
 *   - `'   '` (espaces seuls)  → `null`  (champ effacé)
 *   - `'  foo  '`              → `'foo'` (trim conservé)
 *   - `'foo'`                  → `'foo'`
 *
 * Pourquoi centraliser : avant ce helper, plusieurs Server Actions
 * (sessions, factures, leads) implémentaient leur propre coercition
 * inline `=== null || === ''` — mais oubliaient le cas `'   '`, ce qui
 * laissait passer des chaînes de whitespace dans Postgres. Conséquence :
 * indexes textuels pollués + comparaisons `!== ''` qui ne matchent pas
 * un texte "vide" du point de vue utilisateur.
 */
export function normalizeNullableText(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
}

/** Normalise un nom/prénom : trim, lowercase, supprime accents et espaces multiples. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise un email : trim, lowercase, supprime espaces parasites. */
export function normalizeEmail(input: string | null | undefined): string {
  if (!input) return '';
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

/** Normalise un téléphone : ne garde que les chiffres et le +. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/[^\d+]/g, '');
}

/**
 * Clé naturelle pour dédup d'une Person.
 * On combine nom+prénom normalisés et l'email s'il est présent.
 * Si pas d'email, on combine avec date de naissance.
 */
export function personDedupKey(opts: {
  firstName: string;
  lastName: string;
  email?: string | null;
  birthDate?: Date | string | null;
}): string {
  const ln = normalizeName(opts.lastName);
  const fn = normalizeName(opts.firstName);
  const email = normalizeEmail(opts.email ?? '');
  if (email) return `email:${email}`;
  const birth =
    opts.birthDate instanceof Date
      ? opts.birthDate.toISOString().substring(0, 10)
      : (opts.birthDate ?? '');
  return `${ln}|${fn}|${birth}`;
}

/**
 * Heuristique : est-ce qu'une organisation porte le nom d'une personne ?
 * Utile pour détecter les EI où l'organisation = "BIANCO Pascal" ou "Pascal BIANCO".
 */
export function organizationLooksLikePerson(
  legalName: string,
  firstName: string,
  lastName: string,
): boolean {
  const norm = normalizeName(legalName);
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  if (!fn || !ln) return false;
  // Match si "BIANCO Pascal", "Pascal BIANCO", "BIANCO P." etc.
  return (
    (norm.includes(ln) && norm.includes(fn)) ||
    (norm.includes(`${ln} ${fn.charAt(0)}`)) ||
    (norm.includes(`${fn} ${ln}`)) ||
    (norm.includes(`${ln} ${fn}`))
  );
}
