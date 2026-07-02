/**
 * Helpers PURS de parsing SIRENE (open data recherche-entreprises.api.gouv.fr).
 * Module NEUTRE (pas de `'use server'`) : les fonctions synchrones vivent ici
 * pour être testables et importables partout ; le server action `lookupSiret`
 * (server/actions/sirene-lookup.ts) les réutilise.
 */

export interface SireneCompany {
  siren: string;
  denomination: string | null;
  codeApe: string | null; // normalisé sans point : "6831Z"
  street: string | null;
  postalCode: string | null;
  city: string | null;
  cessee: boolean;
}

/** Normalise un code APE : retire point/espaces, majuscule ("46.19 b" → "4619B"). */
export function normalizeApe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return s || null;
}

/**
 * Parseur PUR d'un résultat `results[i]` de l'API recherche-entreprises.
 * Séparé pour être testable sans réseau. Renvoie null si le résultat est vide.
 */
export function parseSireneResult(r: any): SireneCompany | null {
  if (!r || typeof r.siren !== 'string') return null;
  const siege = r.siege ?? {};
  const codeApe = normalizeApe(siege.activite_principale ?? r.activite_principale ?? null);
  const postalCode: string | null = siege.code_postal ?? null;
  // `siege.adresse` = adresse complète "RUE ... CP VILLE" → on isole la rue et la
  // ville (l'API ne fournit pas de rue/ville structurées, seulement le code INSEE).
  let street: string | null = null;
  let city: string | null = null;
  const full: string | null = siege.adresse ?? null;
  if (full) {
    const m = full.match(/^(.*?)\s+(\d{5})\s+(.+)$/);
    if (m) {
      street = m[1]?.trim() || null;
      city = m[3]?.trim() || null;
    } else {
      street = full.trim() || null;
    }
  }
  return {
    siren: r.siren,
    denomination: r.nom_complet ?? r.nom_raison_sociale ?? null,
    codeApe,
    street,
    postalCode,
    city,
    cessee: siege.etat_administratif === 'F' || r.etat_administratif === 'F',
  };
}
