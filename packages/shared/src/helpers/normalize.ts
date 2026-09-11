/**
 * Helpers de normalisation pour la dédup et le matching à l'import.
 */

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

/**
 * La clé d'égalité d'un TITRE de catalogue — programme, rayon, produit vendu.
 *
 * Distincte de `normalizeName`, qui sert à dédupliquer des PERSONNES et des
 * ORGANISATIONS : un nom propre se compare tel quel, un titre de programme
 * arrive de trois chaînes de production différentes et porte leurs scories.
 *
 * Ce qu'elle neutralise, et pourquoi chaque cas a été vu en vrai (11/09/2026) :
 *
 *   • **les accents, y compris décomposés.** macOS écrit les noms de dossier en
 *     NFD : le Drive livre `activite\u0301` là où QualiOF a `activité`. Sans
 *     décomposition préalable, ce sont deux chaînes différentes.
 *   • **l'apostrophe typographique.** `L’Intelligence` (U+2019) contre
 *     `L'Intelligence` (U+0027) : c'est ce seul caractère qui a fait rater le
 *     doublon `BIB-D073` ↔ `PROD-0673`, alors que D-19 bis aurait dû l'écarter.
 *   • **la ponctuation et les tirets**, typographiques ou non, et les espaces
 *     insécables — ramenés à une simple espace.
 *
 * Volontairement plus agressive que `normalizeName` : elle ne sert qu'à dire
 * « ces deux titres désignent le même programme », jamais à afficher.
 */
export function catalogueTitleKey(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .toLowerCase()
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
