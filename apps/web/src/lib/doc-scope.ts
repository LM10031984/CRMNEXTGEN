/**
 * Phase 9.1 — Centralisation Qualiopi 360°.
 *
 * Table figée D-04 (CONTEXT.md) : 14 DocTypes affichés dans la matrice
 * participants + 3 DocTypes session-only. Ordre = ordre d'affichage colonnes
 * matrice (UI-SPEC §Surface 1 column header glyph legend).
 *
 * AGEFICE est inclus dans DOC_TYPE_LABELS mais affiché conditionnellement
 * (NA si sponsorOrg.opcoCode !== 'AGEFICE' — voir UI-SPEC §Edge Cases),
 * d'où son absence de MATRIX_DOC_TYPES (la liste core).
 *
 * Satisfaction chaud + froid = 2 lignes distinctes (UI-SPEC Open Question 1
 * résolue : 2 docs Qualiopi distincts J+1 vs J+90).
 */

export const MATRIX_DOC_TYPES = [
  'PROGRAMME',
  'CONVENTION',
  'CONVOCATION',
  // D-09.3-07 : PRE_ACCORD_OPCO + VALIDATION_OPCO = jalons workflow OpcoSubmission,
  // hors matrice docs par-participant (plus de cellule MISSING permanente injustifiée).
  // SATISFACTION nu = remplacé par SATISFACTION_CHAUD/FROID. CUSTOM = upload libre, hors matrice.
  'SUPPORT_PEDAGOGIQUE',
  'EMARGEMENT',
  'CERTIFICAT_REALISATION',
  'ATTESTATION_FIN',
  'EVALUATION_ACQUIS',
  'ASSIDUITE',
  'SATISFACTION_CHAUD',
  'SATISFACTION_FROID',
  'POSITIONNEMENT',
  'ANALYSE_BESOIN',
  // AGEFICE conditionnel — ajouté côté UI si applicable, hors core list.
] as const;
export type MatrixDocType = (typeof MATRIX_DOC_TYPES)[number];

export const SESSION_ONLY_DOC_TYPES = [
  'DEROULE_PEDAGOGIQUE',
  'GRILLE_OBS_SESSION',
  'CHECKLIST_FORMATION',
] as const;
export type SessionOnlyDocType = (typeof SESSION_ONLY_DOC_TYPES)[number];

/**
 * D-09.3-08 — Mapping cible figé `DocType → qualiopiIndicator` du seed
 * `QualiopiDocCatalog` (`packages/db/prisma/seed.ts`), recoupé sur le RNQ V9
 * (plan §1) + la grille des 2 rapports d'audit BCI précédents.
 *
 * Source de vérité de la recette « 0 drift » (NAV-05) : le test
 * `seed-catalog.test.ts` lit le seed réel et asserte qu'il correspond
 * exactement à ce mapping. La valeur racine erronée `Indicateur 7` (constante
 * maison QUALIOPI_INDICATORS, non-V9) ne doit JAMAIS apparaître ici.
 *
 * `null` = doc administratif/financement sans indicateur Qualiopi.
 * `'Légal …'` = obligation légale (hors numérotation RNQ).
 */
export const QUALIOPI_DOC_CATALOG_INDICATORS: Record<string, string | null> = {
  CONVENTION: 'Indicateur 9',
  PRE_ACCORD_OPCO: null,
  PROGRAMME: 'Indicateur 1',
  CONVOCATION: 'Indicateur 9',
  EMARGEMENT: 'Indicateur 12',
  SUPPORT_PEDAGOGIQUE: 'Indicateur 19',
  CERTIFICAT_REALISATION: 'Légal Art. L6353-1',
  ASSIDUITE: 'Indicateur 12',
  EVALUATION_ACQUIS: 'Indicateur 11',
  ATTESTATION_FIN: 'Indicateur 11',
  VALIDATION_OPCO: null,
  FACTURE: 'Légal',
  AGEFICE: null,
};

/** Labels FR — short = 2-3 chars header (UI-SPEC glyph legend), long = aria-label/tooltip. */
export const DOC_TYPE_LABELS: Record<string, { short: string; long: string }> = {
  PROGRAMME: { short: 'Pg', long: 'Programme de formation' },
  CONVENTION: { short: 'Cv', long: 'Convention de formation' },
  CONVOCATION: { short: 'Cn', long: 'Convocation' },
  PRE_ACCORD_OPCO: { short: 'Op', long: 'Pré-accord OPCO' },
  SUPPORT_PEDAGOGIQUE: { short: 'Sp', long: 'Supports pédagogiques' },
  EMARGEMENT: { short: 'Em', long: 'Émargement' },
  CERTIFICAT_REALISATION: { short: 'Ce', long: 'Certificat de réalisation' },
  ATTESTATION_FIN: { short: 'At', long: 'Attestation' },
  EVALUATION_ACQUIS: { short: 'QC', long: 'Évaluation des acquis (QCM)' },
  ASSIDUITE: { short: 'As', long: 'Assiduité' },
  SATISFACTION_CHAUD: { short: 'Sc', long: 'Satisfaction (à chaud)' },
  SATISFACTION_FROID: { short: 'Sf', long: 'Satisfaction (à froid)' },
  POSITIONNEMENT: { short: 'Po', long: 'Positionnement' },
  ANALYSE_BESOIN: { short: 'An', long: 'Analyse des besoins' },
  AGEFICE: { short: 'Ag', long: 'Fiche AGEFICE' },
  DEROULE_PEDAGOGIQUE: { short: 'Dp', long: 'Déroulé pédagogique' },
  GRILLE_OBS_SESSION: { short: 'Go', long: "Grille d'observation formateur" },
  CHECKLIST_FORMATION: { short: 'Ck', long: 'Checklist formation' },
};

/**
 * Map MatrixDocType → ClosureDocKind (worker BullMQ).
 * `null` = pas de generator BullMQ (generator synchrone dédié ou upload manuel only).
 */
export const DOC_TYPE_TO_CLOSURE_KIND: Record<string, string | null> = {
  CERTIFICAT_REALISATION: 'CERTIFICAT',
  ATTESTATION_FIN: 'ATTESTATION',
  EVALUATION_ACQUIS: 'QCM',
  EMARGEMENT: 'EMARGEMENT',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
  POSITIONNEMENT: 'POSITIONNEMENT',
  SATISFACTION_CHAUD: 'SATISFACTION_CHAUD',
  SATISFACTION_FROID: 'SATISFACTION_FROID',
  ASSIDUITE: null, // upload manuel only (UI-SPEC Open Question 2 résolue)
  PROGRAMME: null, // generator dédié produit-level
  CONVENTION: null, // generator dédié synchrone
  CONVOCATION: null, // generator dédié synchrone
  PRE_ACCORD_OPCO: null,
  SUPPORT_PEDAGOGIQUE: null,
  AGEFICE: null, // generator dédié synchrone
};

/** Map MatrixDocType → PedagogicalKind (lecture asset). */
export const DOC_TYPE_TO_PED_KIND: Record<string, string | null> = {
  EVALUATION_ACQUIS: 'QCM',
  EMARGEMENT: 'EMARGEMENT',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
  POSITIONNEMENT: 'POSITIONNEMENT',
  SATISFACTION_CHAUD: 'SATISFACTION_CHAUD',
  SATISFACTION_FROID: 'SATISFACTION_FROID',
  GRILLE_OBS_SESSION: 'GRILLE_OBS',
  DEROULE_PEDAGOGIQUE: 'DEROULE',
};
