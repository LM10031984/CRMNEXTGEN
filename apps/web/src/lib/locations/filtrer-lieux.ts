/**
 * Recherche dans la liste des lieux de formation.
 *
 * 59 lieux en base au 11/09/2026 : le `<select>` natif de la fiche session
 * obligeait à dérouler toute la liste pour en retrouver un. Laurent a demandé
 * « la petite loupe ».
 *
 * On cherche un lieu par ce dont on se souvient — l'enseigne, la raison
 * sociale, la ville, parfois juste le département — donc la recherche balaie
 * TOUS les champs d'identification d'un coup, et non le seul nom affiché.
 *
 * MODULE PUR : aucun import React, aucune I/O. Voisin de `format-lieu.ts`,
 * qui compose le libellé ; celui-ci ne fait que filtrer.
 */

export interface LieuRecherchable {
  name: string;
  legalName?: string | null;
  address?: unknown;
}

/**
 * Forme de comparaison : minuscules, sans accents, ponctuation compactée —
 * « camelias » doit trouver « Camélias », « bd de Cessole » doit se laisser
 * trouver par « cessole ».
 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tout le texte identifiant un lieu, concaténé en une seule botte de foin. */
function botteDeFoin(lieu: LieuRecherchable): string {
  const morceaux: string[] = [lieu.name, lieu.legalName ?? ''];
  const addr = lieu.address;
  if (typeof addr === 'string') {
    morceaux.push(addr);
  } else if (addr && typeof addr === 'object') {
    for (const cle of ['street', 'postalCode', 'city'] as const) {
      const v = (addr as Record<string, unknown>)[cle];
      if (typeof v === 'string') morceaux.push(v);
    }
  }
  return normalize(morceaux.filter(Boolean).join(' '));
}

/**
 * Filtre les lieux sur une requête libre.
 *
 * Chaque mot de la requête doit se retrouver quelque part dans le lieu, sans
 * contrainte d'ordre ni de champ : « nice signature » trouve le lieu dont la
 * ville est Nice ET la raison sociale « L'Agence Signature ». Une requête vide
 * rend la liste intacte, dans son ordre d'origine.
 */
export function filtrerLieux<T extends LieuRecherchable>(lieux: T[], requete: string): T[] {
  const mots = normalize(requete).split(' ').filter(Boolean);
  if (mots.length === 0) return lieux;
  return lieux.filter((lieu) => {
    const foin = botteDeFoin(lieu);
    return mots.every((mot) => foin.includes(mot));
  });
}
