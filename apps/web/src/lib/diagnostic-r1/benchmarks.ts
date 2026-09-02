/**
 * Repères métier du diagnostic (D-2 de la spec).
 *
 * Sortis dans leur propre module parce qu'ils servent maintenant à deux
 * moteurs : la synthèse pipeline montrée en rendez-vous et le moteur ratios du
 * rapport d'audit. Les laisser dans l'un des deux ferait dépendre l'autre d'un
 * module dont il n'a pas besoin.
 *
 * Valeurs de départ : celles du référentiel v1.0 du repo diag, à recalibrer sur
 * les trois premiers audits réels puis à figer et versionner (D-2 / D-9).
 */
export const DEFAULT_BENCHMARKS = {
  /** Contacts vendeurs → RDV estimation, en %. */
  contactsToRdvPercent: 20,
  /** RDV estimation → mandat rentré, en %. */
  rdvToMandatPercent: 40,
  /** Part de l'exclusivité dans les rentrées, en %. */
  exclusivityPercent: 30,
  /** Visites → offres, en %. */
  visitesToOffresPercent: 25,
  /** Offres → compromis, en %. */
  offresToCompromisPercent: 60,
  /** Compromis → acte, en %. Chaque point perdu ici est une vente déjà gagnée. */
  compromisToActePercent: 85,
  /** Nombre de visites nécessaires pour une vente — au-delà, c'est du temps perdu. */
  visitsPerActe: 15,
  /** Avis en ligne rapportés aux ventes de l'année, en %. */
  reviewsPerVentePercent: 30,
  /** Sous ce taux de consommation 24 mois, le levier « droits sous-utilisés ». */
  consumptionLeverPercent: 30,
  /** Sous ce %, le diagnostic reste utile mais ses repères sont à relativiser. */
  transactionAncienMinPercent: 50,
} as const;

/** Le jeu de repères effectivement appliqué — valeurs `number`, pas les
 * littéraux figés par `as const`. C'est ce type que les moteurs manipulent. */
export type Benchmarks = Record<keyof typeof DEFAULT_BENCHMARKS, number>;

/** Surcharges partielles passées aux moteurs. */
export type BenchmarksOverride = Partial<Benchmarks>;
