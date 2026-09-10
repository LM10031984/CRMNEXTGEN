import { z } from 'zod';

/**
 * Schémas de la proposition commerciale (spec §9.1) — source unique serveur ET
 * client, et contrat de ce que portent `Proposal.contentJson`, `pricingJson`
 * et `fundingJson`.
 *
 * Trois principes gouvernent ce fichier :
 *
 *  1. **Les heures conventionnées ne se saisissent JAMAIS.** Elles se
 *     dérivent des demi-journées et des règles de financement, partout, sans
 *     exception (ligne rouge §8.1). Aucun champ de ce schéma ne les porte comme
 *     une donnée éditable : elles sont calculées par le moteur de chiffrage.
 *  2. **La remise ne vit que sur le reste à charge** — jamais sur le coût
 *     pédagogique, qui est l'assiette des droits. D'où un objet `discount`
 *     séparé des lignes, et non une ligne négative parmi les autres.
 *  3. Rien de nominatif dans ce qui peut partir en lien public : les fiches
 *     équipe sont référencées par `participantIds`, jamais par leur nom.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Contenu narratif (§9.1 — « ce que nous avons entendu », axes, planning…)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un axe du parcours proposé.
 *
 * `why` est obligatoire et non vide : c'est la promesse d'ultra-personnalisation
 * de la proposition. Un axe qu'on ne sait pas relier à un signal du diagnostic
 * n'a rien à faire dans le document — c'est du catalogue, pas une réponse.
 */
/**
 * Un module retenu dans un axe (lot I-2, D-19).
 *
 * C'est la traçabilité qui rend la composition défendable : chaque module dit
 * de quel programme source il vient, à quel besoin il répond, et **par quelle
 * réponse du dirigeant il est entré**. Un contrôle OPCO regarde exactement cette
 * cohérence besoin ↔ programme ↔ durée.
 *
 * `durationMin` est une durée SUR SITE. Elle sert à savoir ce qui tient dans une
 * demi-journée, **jamais à chiffrer** : le volume vendu est un multiple du bloc
 * de 8 h conventionnées (D-20).
 */
export const ProposalModuleSchema = z.object({
  moduleId: z.string().min(1),
  title: z.string().min(1).max(300),
  /** Le programme d'origine — « composé depuis plusieurs programmes » se prouve ici. */
  sourceCode: z.string().max(40).default(''),
  sourceTitle: z.string().max(300).default(''),
  needLabel: z.string().max(200).default(''),
  durationMin: z.number().int().min(0).max(600).default(0),
  /** Les mots du dirigeant qui ont fait entrer ce module. */
  quotes: z.array(z.string().max(300)).max(6).default([]),
  /** Le signal du catalogue qui a fait le rapprochement, s'il y en a un. */
  signal: z.string().max(300).nullable().default(null),
  confidence: z.enum(['forte', 'faible']).default('faible'),
});
export type ProposalModule = z.infer<typeof ProposalModuleSchema>;

export const ProposalAxisSchema = z.object({
  id: z.string().min(1),
  /** Titre commercial de l'axe (« Axe 1 »… porté par `label`). */
  label: z.string().min(1, 'Un libellé est attendu').max(60),
  title: z.string().min(1, 'Un titre est attendu').max(300),
  /** Le produit du catalogue retenu — traçabilité, jamais un module fantôme. */
  productId: z.string().uuid().nullable().default(null),
  productCode: z.string().max(40).nullable().default(null),
  description: z.string().max(2000).default(''),
  /** « Pourquoi ce module » : relié à une priorité / un chapitre du diagnostic. */
  why: z.string().min(1, 'Chaque axe doit dire à quel constat il répond').max(600),
  halfDays: z.number().int().min(0).max(200),
  /** « sept. », « oct. » — un repère, pas une date ferme (elle vient du planning). */
  periodLabel: z.string().max(60).default(''),
  /** D'où sort la recommandation : signaux du catalogue, lexique, ou main humaine. */
  matchSource: z.enum(['signaux', 'lexique', 'manuel']).default('manuel'),
  /**
   * Les modules qui composent cet axe (lot I-2). Vide sur les propositions
   * antérieures à la composition — d'où le défaut : une proposition déjà
   * envoyée doit continuer à se relire telle qu'elle a été envoyée.
   */
  modules: z.array(ProposalModuleSchema).max(20).default([]),
});
export type ProposalAxis = z.infer<typeof ProposalAxisSchema>;

export const ProposalPlanningRowSchema = z.object({
  id: z.string().min(1),
  dateLabel: z.string().min(1).max(120),
  sessionLabel: z.string().min(1).max(300),
  participantsLabel: z.string().max(200).default(''),
});
export type ProposalPlanningRow = z.infer<typeof ProposalPlanningRowSchema>;

export const ProposalStepSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1).max(300),
  who: z.string().max(120).default(''),
  when: z.string().max(120).default(''),
});
export type ProposalStep = z.infer<typeof ProposalStepSchema>;

export const ProposalContentSchema = z.object({
  /** Sous-titre de couverture — l'activité et la ville, pas un slogan. */
  subtitle: z.string().max(300).default(''),
  /** À l'attention de — le dirigeant nommé, jamais « Madame, Monsieur ». */
  recipientLabel: z.string().max(200).default(''),
  contactLabel: z.string().max(200).default(''),
  /** §9.1-2 — chaque puce provient d'une réponse ou d'un ratio. */
  heard: z.array(z.string().min(1).max(600)).max(12).default([]),
  /** Phrase d'introduction des constats (date du diagnostic, renvoi à l'audit). */
  heardIntro: z.string().max(600).default(''),
  axes: z.array(ProposalAxisSchema).max(12).default([]),
  axesIntro: z.string().max(1200).default(''),
  planning: z.array(ProposalPlanningRowSchema).max(20).default([]),
  /** « pièces réunies au plus tard le … » — calculé (J−15), affiché tel quel. */
  piecesDeadlineNote: z.string().max(600).default(''),
  /** Encadré or « points clés » (indemnisation, ALUR, montage 100 %, zéro avance). */
  keyPoints: z.array(z.string().min(1).max(400)).max(8).default([]),
  nextSteps: z.array(ProposalStepSchema).max(12).default([]),
  /** Mention légale — jamais retirable (§9.1-9), d'où le `min(1)`. */
  legalMention: z.string().min(1).max(2000),
});
export type ProposalContent = z.infer<typeof ProposalContentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Chiffrage — les lignes PAR PAYEUR (§8.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une ligne de vente, exprimée PAR PARTICIPANT.
 *
 * `unitPriceHt` est le prix d'UNE demi-journée pour UN participant (336 € par
 * défaut, paramètre `PRICE_PER_HOUR_PER_PARTICIPANT` × `HALF_DAY_ONSITE_HOURS`).
 * Le total de la ligne vaut `participants × halfDays × unitPriceHt` — c'est le
 * moteur qui le calcule, jamais la saisie.
 */
export const PricingLineSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(400),
  halfDays: z.number().min(0).max(400),
  unitPriceHt: z.number().min(0).max(100000),
});
export type PricingLine = z.infer<typeof PricingLineSchema>;

/** Une prise en charge attendue, par financeur. Toujours ≥ 0, jamais > plafond. */
export const PricingCoverageSchema = z.object({
  funder: z.enum(['AGEFICE', 'OPCO_EP']),
  label: z.string().min(1).max(300),
  amount: z.number().min(0).max(10000000),
});
export type PricingCoverage = z.infer<typeof PricingCoverageSchema>;

/**
 * Un payeur — l'unité de facturation, et donc l'unité de devis.
 *
 * `groupLabel` n'est qu'un regroupement d'AFFICHAGE (le bandeau « Agents
 * commerciaux indépendants » de la maquette). Deux payeurs partageant un
 * bandeau restent deux payeurs, donc deux devis : la subrogation AGEFICE se
 * monte par personne, pas par bandeau.
 */
export const PricingPayerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['ENTREPRISE', 'INDEPENDANT']),
  name: z.string().min(1).max(300),
  siret: z.string().max(20).nullable().default(null),
  email: z.string().max(200).nullable().default(null),
  address: z.string().max(500).nullable().default(null),
  groupLabel: z.string().min(1).max(300),
  /** Note du bandeau (« dossiers individuels AGEFICE, subrogation, zéro avance »). */
  groupNote: z.string().max(400).default(''),
  /** Fiches équipe couvertes — des identifiants, jamais des noms. */
  participantIds: z.array(z.string().min(1)).default([]),
  participantCount: z.number().int().min(1).max(500),
  lines: z.array(PricingLineSchema).min(1),
  coverages: z.array(PricingCoverageSchema).default([]),
});
export type PricingPayer = z.infer<typeof PricingPayerSchema>;

/**
 * La remise commerciale.
 *
 * `kind` distingue le geste ordinaire de l'« arrondi de parcours » (D-11) : le
 * dépassement de quelques dizaines d'euros créé par l'arrondi supérieur du
 * dimensionnement, que l'éditeur propose d'offrir en un clic. Les deux sont
 * tracés de la même façon — un motif est toujours obligatoire.
 */
export const PricingDiscountSchema = z.object({
  amount: z.number().min(0).max(10000000),
  reason: z.string().min(3, 'Un motif est obligatoire').max(400),
  kind: z.enum(['COMMERCIALE', 'ARRONDI']).default('COMMERCIALE'),
});
export type PricingDiscount = z.infer<typeof PricingDiscountSchema>;

export const ProposalPricingSchema = z.object({
  payers: z.array(PricingPayerSchema).default([]),
  discount: PricingDiscountSchema.nullable().default(null),
  /** Modalité et nature du contenu — pilotent les taux du moteur financement. */
  modality: z.enum(['PRESENTIEL', 'DISTANCIEL']).default('PRESENTIEL'),
  fundingType: z.enum(['COEUR_METIER', 'REGLEMENTAIRE']).default('COEUR_METIER'),
});
export type ProposalPricing = z.infer<typeof ProposalPricingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Financement — le tableau « budget mobilisable » (§9.1-5)
// ─────────────────────────────────────────────────────────────────────────────

export const FundingRowSchema = z.object({
  funder: z.string().min(1).max(60),
  beneficiaries: z.string().min(1).max(400),
  basis: z.string().min(1).max(300),
  amount: z.number(),
  /** Une ligne de déduction s'affiche « − X € » et ne compte pas comme un droit. */
  isDeduction: z.boolean().default(false),
});
export type FundingRow = z.infer<typeof FundingRowSchema>;

export const ProposalFundingSchema = z.object({
  rows: z.array(FundingRowSchema).default([]),
  total: z.number(),
  /** « Potentiel complémentaire » — sous réserve, jamais compté dans le total. */
  potentialNote: z.string().max(600).default(''),
  /** Alertes présentables au dirigeant (§8.2), déjà filtrées `audience: client`. */
  clientAlerts: z.array(z.string().min(1).max(600)).default([]),
  /** Heures conventionnées du parcours — LA valeur de référence unique. */
  conventionedHoursPerParticipant: z.number().min(0),
  halfDays: z.number().min(0),
});
export type ProposalFunding = z.infer<typeof ProposalFundingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Entrées des server actions
// ─────────────────────────────────────────────────────────────────────────────

export const CreateProposalSchema = z.object({
  diagnosticId: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
});

export const UpdateProposalContentSchema = z.object({
  proposalId: z.string().uuid(),
  content: ProposalContentSchema,
});

export const UpdateProposalPricingSchema = z.object({
  proposalId: z.string().uuid(),
  pricing: ProposalPricingSchema,
});

export const SetProposalDiscountSchema = z.object({
  proposalId: z.string().uuid(),
  discount: PricingDiscountSchema.nullable(),
});
