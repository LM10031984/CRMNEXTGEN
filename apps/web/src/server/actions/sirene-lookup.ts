'use server';

/**
 * Recherche SIRENE via l'API publique gratuite recherche-entreprises.api.gouv.fr
 * (open data, sans clé ni crédit). Auto-remplit le code APE + adresse d'une
 * auto-entreprise à partir de son SIRET, à la création d'un apprenant ou en
 * édition de la fiche entreprise. Remplace Pappers (payant) pour ce besoin.
 *
 * Les helpers purs (parsing/normalisation) vivent dans `@/lib/sirene` (module
 * neutre) : un fichier `'use server'` ne peut exporter que des fonctions async.
 */

import { parseSireneResult, type SireneCompany } from '@/lib/sirene';

export interface SireneLookupResult {
  ok: boolean;
  error?: string;
  company?: SireneCompany;
}

/** Recherche une entreprise par SIRET (14 chiffres) via son SIREN (9 premiers). */
export async function lookupSiret(siretRaw: string): Promise<SireneLookupResult> {
  const siret = (siretRaw ?? '').replace(/\s/g, '');
  if (!/^\d{14}$/.test(siret)) {
    return { ok: false, error: 'SIRET invalide (14 chiffres attendus).' };
  }
  const siren = siret.slice(0, 9);
  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`,
      { cache: 'no-store' },
    );
    if (!res.ok) return { ok: false, error: `Service SIRENE indisponible (${res.status}).` };
    const json: any = await res.json();
    const company = parseSireneResult(json?.results?.[0]);
    if (!company || company.siren !== siren) {
      return { ok: false, error: 'Aucune entreprise trouvée pour ce SIRET.' };
    }
    return { ok: true, company };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de la recherche SIRENE.' };
  }
}
