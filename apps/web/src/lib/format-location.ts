/**
 * Helper partagé de formatage d'un lieu de formation.
 *
 * Objectifs (audit témoin SES-0087, 2026-06-18) :
 *  - COR-3 : ne JAMAIS dupliquer la ville (« Vitrolles — Nestenn — Vitrolles »).
 *  - COR-6 : titlecase léger sur la rue (« place de provence » → « Place De
 *    Provence ») SANS toucher au code postal numérique ni à la ville (déjà
 *    capitalisée en base).
 *
 * Helper PUR (aucun IO). Déterministe — pas de smart calc métier
 * (cf. feedback Laurent : pas de calcul « élégant » sur valeurs métier).
 *
 * `address` Prisma est un Json → typé souple `Record<string, unknown> | string | null`.
 */

export interface LocationInput {
  name?: string | null;
  address?: Record<string, unknown> | string | null;
}

/** Retire les diacritiques + minuscules — comparaison insensible casse/accents. */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Titlecase léger : capitalise l'initiale de chaque mot alphabétique.
 * Laisse intacts les tokens purement numériques (codes postaux, numéros).
 */
function titlecase(s: string): string {
  return s.replace(/\p{L}[\p{L}'-]*/gu, (word) => {
    // tokens purement numériques déjà exclus par le regex \p{L}, mais on
    // garde la garde défensive : ne pas toucher si pas de lettre.
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Formate un lieu en une forme unique propre.
 * @returns string formatée, ou `null` si la location n'a ni name ni address.
 */
export function formatLocation(location: LocationInput | null | undefined): string | null {
  if (!location) return null;

  const name = str(location.name);
  const address = location.address;

  // 1) address en string → titlecase léger.
  if (typeof address === 'string') {
    const addr = titlecase(address.trim());
    if (name) {
      // préfixer name seulement s'il n'est pas déjà inclus dans l'adresse.
      return normalizeForCompare(addr).includes(normalizeForCompare(name))
        ? addr
        : `${titlecase(name)} — ${addr}`;
    }
    return addr || null;
  }

  // 2) address structurée → "{street}, {postalCode} {city}".
  if (address && typeof address === 'object') {
    const street = str((address as Record<string, unknown>).street);
    const postalCode = str((address as Record<string, unknown>).postalCode);
    const city = str((address as Record<string, unknown>).city);

    // titlecase sur la rue uniquement (CP numérique + ville en base = intacts).
    const streetTc = street ? titlecase(street) : '';
    const cityLine = [postalCode, city].filter(Boolean).join(' ');
    const addrParts = [streetTc, cityLine].filter(Boolean);
    const addr = addrParts.join(', ');

    // anti-duplication COR-3 : ne préfixer le name QUE s'il ne contient pas
    // déjà la ville. Sinon le name fait doublon (« Vitrolles — Nestenn »).
    const nameContainsCity =
      !!city && !!name && normalizeForCompare(name).includes(normalizeForCompare(city));

    if (name && !nameContainsCity) {
      const nameTc = titlecase(name);
      return addr ? `${nameTc} — ${addr}` : nameTc;
    }
    // name contient la ville (ou pas de name) → on garde la forme adresse propre.
    if (addr) return addr;
    return name ? titlecase(name) : null;
  }

  // 3) pas d'address → name nettoyé (titlecase léger), pas de " — undefined".
  return name ? titlecase(name) : null;
}
