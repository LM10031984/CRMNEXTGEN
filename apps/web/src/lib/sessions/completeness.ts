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

import { mentionsLieuManquantes } from '@/lib/locations/format-lieu';

export type SessionCompletenessBlockerKey =
  | 'no_primary_trainer'
  | 'no_price'
  | 'no_dates'
  | 'no_location'
  | 'location_incomplete'
  | 'no_program'
  | 'no_participants'
  | 'product_ai_unreviewed';

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
   *
   * `external: true` → ouvrir dans un nouvel onglet (préserve le contexte
   * session pour les fixes hors-page comme la validation IA produit).
   */
  fix: { href: string; label: string; external?: boolean };
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
  /**
   * Le lieu lui-même, pour vérifier qu'il porte les mentions exigées par
   * l'AGEFICE sur la feuille d'émargement (raison sociale, CP, ville).
   * Optionnel : les appelants qui ne le chargent pas ne déclenchent pas le
   * blocker `location_incomplete` (le blocker `no_location` reste actif).
   */
  location?: { legalName?: string | null; address?: unknown } | null;
  modality: string | null;
  trainers: { isPrimary: boolean }[];
  product: { programMd: string | null; aiDraftedAt?: Date | null } | null;
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
      // BUG-18 — pointe vers la nouvelle section "Lieu de formation"
      // (#section-lieu) qui est toujours rendue avec état vide actionnable.
      // SessionLogisticsEditor (section-logistique) ne traite que l'hébergement
      // formateur + accessibilité PSH, pas le Location de la session.
      fix: { href: '#section-lieu', label: 'Aller à la section Lieu' },
    });
  }

  // AGEFICE 2026-08-28 — un lieu rattaché ne suffit pas : sans raison sociale,
  // sans CP ou sans ville, la feuille d'émargement est refusée en prise en
  // charge (« Le document Feuille(s) d'émargement est incomplet : raison
  // sociale du lieu de formation »). On bloque donc AVANT de produire le pack
  // plutôt que de le découvrir au retour du financeur.
  //
  // Les lieux créés avant cette date ont presque tous `legalName` vide : le
  // blocker se déclenchera à la première génération et se corrige en une
  // saisie sur la fiche session (décision Laurent : pas de reprise en masse du
  // passé, on complète à la demande).
  if (!isDistanciel && s.locationId && s.location !== undefined) {
    const manquantes = mentionsLieuManquantes(s.location);
    if (manquantes.length > 0) {
      blockers.push({
        key: 'location_incomplete',
        label: `Lieu de formation incomplet (${manquantes.join(', ')})`,
        hint:
          'L’AGEFICE exige la raison sociale du lieu, son code postal et sa ville sur la feuille d’émargement',
        fix: { href: '#section-lieu', label: 'Compléter le lieu' },
      });
    }
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

  // BUG-P0-02 — produit auto-rempli par IA et pas encore validé humainement.
  // Bloque la génération du pack : un programme IA non revu peut contenir
  // du markdown brut, des sections Qualiopi manquantes, ou des verbes Bloom
  // absents — risque audit Qualiopi direct.
  if (s.product?.aiDraftedAt) {
    blockers.push({
      key: 'product_ai_unreviewed',
      label: 'Programme IA en attente de validation humaine',
      hint: 'Un humain doit relire et valider le programme avant de l\'utiliser pour des conventions Qualiopi',
      // Pointe sur l'inline validator de Step 1 — validation 1-clic sans
      // quitter la session (Laurent 2026-06-04).
      fix: { href: '#step-1', label: 'Valider depuis la session' },
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

  // 8 critères = 6 originaux + product_ai_unreviewed (BUG-P0-02)
  // + location_incomplete (AGEFICE 2026-08-28).
  // Le ratio reste cohérent : si tous les critères sont OK, ratio = 1.
  const totalCriteria = 8;
  const okCount = totalCriteria - blockers.length;
  const ratio = okCount / totalCriteria;

  return {
    ready: blockers.length === 0,
    blockers,
    ratio,
  };
}
