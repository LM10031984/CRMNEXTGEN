/**
 * Helper pur — calcule l'état de complétude d'une session pour pouvoir
 * générer ses documents Qualiopi sans risque audit.
 *
 * Phase 11 BUG-5 : avant d'enqueuer un pack fin de formation, on vérifie
 * que les éléments légaux/business minimaux sont remplis. Sinon les docs
 * générés ont des trous (formateur absent, prix vide, etc.) → non-conforme.
 *
 * Utilisé :
 *  - Côté UI : <SessionCompletenessBadge> sur fiche session
 *  - Côté server : pré-validation dans `generateClosurePack` (bloque l'enqueue
 *    si la session est incomplète, avec message clair listant les blockers)
 */

export type SessionCompletenessBlockerKey =
  | 'no_primary_trainer'
  | 'no_price'
  | 'no_dates'
  | 'no_location'
  | 'no_program'
  | 'no_participants';

export type SessionCompletenessBlocker = {
  /** Identifiant stable pour cibler (analytics, deep link) */
  key: SessionCompletenessBlockerKey;
  /** Libellé affiché à l'utilisateur (français) */
  label: string;
  /** Hint : où corriger (URL anchor, modal, etc.) */
  hint: string;
  /**
   * Anchor #id ou URL complète à cliquer pour corriger directement.
   * BUG-5/BUG-17 — chaque blocker pointe vers le bon endroit :
   *  - no_program → URL absolue vers la fiche produit
   *  - autres → anchor #id de section sur la fiche session
   */
  fix: { href: string; label: string };
};

export interface SessionCompletenessInputWithProductId
  extends SessionCompletenessInput {
  /** Optionnel — utilisé pour générer le lien 'fix' du blocker no_program. */
  productId?: string | null;
}

export interface SessionCompletenessInput {
  startDate: Date | null;
  endDate: Date | null;
  pricePerLearner: { toNumber(): number } | number | null;
  locationId: string | null;
  modality: string | null;
  trainers: { isPrimary: boolean }[];
  product: { programMd: string | null } | null;
  participantsCount: number;
}

export interface SessionCompleteness {
  /** true si la session est prête à générer le pack fin de formation */
  ready: boolean;
  /** Liste des blockers à corriger (vide si ready) */
  blockers: SessionCompletenessBlocker[];
  /** Ratio 0-1 (pour barre de progression visuelle) */
  ratio: number;
}

/**
 * 6 critères vérifiés :
 *  1. Au moins 1 formateur isPrimary (Qualiopi indic 21 — formateur identifié)
 *  2. pricePerLearner > 0 (facture, devis, conformité fiscale)
 *  3. startDate + endDate non null (indic 9 — info déroulement prestation)
 *  4. Location (lieu de formation — indic 17 moyens techniques)
 *  5. product.programMd non vide (indic 6 — adaptation au public)
 *  6. Au moins 1 participant inscrit (sinon rien à générer)
 *
 * Modalité DISTANCIEL : la Location n'est PAS obligatoire (visio).
 */
export function getSessionCompleteness(
  s: SessionCompletenessInputWithProductId,
): SessionCompleteness {
  const blockers: SessionCompletenessBlocker[] = [];

  if (s.trainers.filter((t) => t.isPrimary).length === 0) {
    blockers.push({
      key: 'no_primary_trainer',
      label: 'Formateur principal manquant',
      hint: 'Ajouter un formateur avec rôle « principal » dans l’onglet Formateurs',
      fix: { href: '#section-formateurs', label: 'Aller à la section Formateurs' },
    });
  }

  const priceNum =
    typeof s.pricePerLearner === 'number'
      ? s.pricePerLearner
      : s.pricePerLearner?.toNumber?.() ?? 0;
  if (!priceNum || priceNum <= 0) {
    blockers.push({
      key: 'no_price',
      label: 'Tarif non renseigné',
      hint: 'Définir le prix HT par apprenant (champ Tarif sur la fiche session)',
      fix: { href: '#section-logistique', label: 'Aller à la logistique' },
    });
  }

  if (!s.startDate || !s.endDate) {
    blockers.push({
      key: 'no_dates',
      label: 'Dates de session incomplètes',
      hint: 'Renseigner les dates de début et de fin de session',
      fix: { href: '#section-logistique', label: 'Aller à la logistique' },
    });
  }

  // Distanciel : lieu non obligatoire (visio).
  const isDistanciel = s.modality === 'DISTANCIEL';
  if (!isDistanciel && !s.locationId) {
    blockers.push({
      key: 'no_location',
      label: 'Lieu de formation non défini',
      hint: 'Associer un lieu (Location) à la session',
      fix: { href: '#section-logistique', label: 'Aller à la logistique' },
    });
  }

  if (!s.product?.programMd || s.product.programMd.trim().length < 20) {
    blockers.push({
      key: 'no_program',
      label: 'Programme du produit absent ou trop court',
      hint: 'Compléter le programme markdown sur le produit de formation',
      fix: s.productId
        ? { href: `/app/produits/${s.productId}`, label: 'Éditer le produit' }
        : { href: '#section-produit', label: 'Voir le produit' },
    });
  }

  if (s.participantsCount === 0) {
    blockers.push({
      key: 'no_participants',
      label: 'Aucun apprenant inscrit',
      hint: 'Ajouter au moins un apprenant à la session',
      fix: { href: '#section-participants', label: 'Ajouter un apprenant' },
    });
  }

  const totalCriteria = 6;
  const okCount = totalCriteria - blockers.length;
  const ratio = okCount / totalCriteria;

  return {
    ready: blockers.length === 0,
    blockers,
    ratio,
  };
}
