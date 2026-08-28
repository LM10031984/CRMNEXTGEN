/**
 * Droits de formation AGEFICE déduits de la contribution CFP versée.
 *
 * Règle métier donnée par Laurent le 28/08/2026, lue sur l'attestation URSSAF
 * (« Vous avez acquitté un versement de X euros ») :
 *
 *   contribution ≥ 7 €        → 3 000 € de droits
 *   contribution > 0 et < 7 € →   500 € de droits
 *   contribution = 0          →     aucun droit
 *
 * Bornes retenues, à confirmer : 7 € pile ouvre les droits pleins, et tout
 * versement non nul sous 7 € (y compris inférieur à 1 €) ouvre les droits
 * partiels. Aucun arrondi n'est appliqué au montant lu.
 *
 * Le résultat n'est PAS stocké : il se dérive du montant à chaque affichage,
 * pour qu'une correction du montant ne laisse jamais un droit périmé derrière
 * elle.
 *
 * MODULE PUR : ni base, ni I/O.
 */

export const SEUIL_DROITS_PLEINS_EUROS = 7;
export const DROITS_PLEINS_EUROS = 3000;
export const DROITS_PARTIELS_EUROS = 500;

export type NiveauDroits = 'inconnu' | 'aucun' | 'partiel' | 'plein';

export interface DroitsAgefice {
  niveau: NiveauDroits;
  /** Montant de droits en euros ; null tant que la contribution est inconnue. */
  montantEuros: number | null;
  libelle: string;
}

export function ageficeRights(contributionAmount: number | null | undefined): DroitsAgefice {
  if (contributionAmount === null || contributionAmount === undefined || Number.isNaN(contributionAmount)) {
    return {
      niveau: 'inconnu',
      montantEuros: null,
      libelle: 'Contribution CFP non lue — droits à vérifier',
    };
  }
  if (contributionAmount <= 0) {
    return { niveau: 'aucun', montantEuros: 0, libelle: 'Aucun droit — contribution nulle' };
  }
  if (contributionAmount < SEUIL_DROITS_PLEINS_EUROS) {
    return {
      niveau: 'partiel',
      montantEuros: DROITS_PARTIELS_EUROS,
      libelle: `${DROITS_PARTIELS_EUROS} € de droits`,
    };
  }
  return {
    niveau: 'plein',
    montantEuros: DROITS_PLEINS_EUROS,
    libelle: `${DROITS_PLEINS_EUROS} € de droits`,
  };
}

/** Montant de contribution lu dans `PreEnrollment.extractedData`, si présent. */
export function contributionFromExtractedData(extractedData: unknown): number | null {
  if (!extractedData || typeof extractedData !== 'object') return null;
  const cfp = (extractedData as Record<string, unknown>).cfp;
  if (!cfp || typeof cfp !== 'object') return null;
  const brut = (cfp as Record<string, unknown>).contributionAmount;
  if (typeof brut === 'number' && Number.isFinite(brut)) return brut;
  if (typeof brut === 'string') {
    const n = Number(brut.replace(',', '.').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
