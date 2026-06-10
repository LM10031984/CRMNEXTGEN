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
  // CORRECTION 2 (Kaïna audit blanc) : le certificat de réalisation se range
  // dans l'ind. 11. Stockage au plus simple : qualiopiIndicator = 'Indicateur 11',
  // la mention légale Art. L6353-1 reste consignée dans le champ description du
  // seed (et affichée en composite « Indicateur 11 · Légal Art. L6353-1 »).
  CERTIFICAT_REALISATION: 'Indicateur 11',
  // CORRECTION 1 (tranché Laurent V9) : l'assiduité AGEFICE n'est PAS une preuve
  // Qualiopi — la preuve ind. 12 c'est l'ÉMARGEMENT. L'assiduité est un dérivé
  // administratif financeur, même logique que PRE_ACCORD_OPCO/VALIDATION_OPCO.
  ASSIDUITE: null,
  EVALUATION_ACQUIS: 'Indicateur 11',
  // CORRECTION 2 (swap) : l'attestation de fin devient « Légal » pur — le 11
  // passe au certificat de réalisation ci-dessus.
  ATTESTATION_FIN: 'Légal Art. L6353-1',
  VALIDATION_OPCO: null,
  FACTURE: 'Légal',
  AGEFICE: null,
};

/**
 * 09.3-03-fix CORRECTION 1 — SOURCE UNIQUE des indicateurs pour `resolveDocs`.
 *
 * `QUALIOPI_DOC_CATALOG_INDICATORS` ci-dessus est le MIROIR strict du seed
 * `QualiopiDocCatalog` (recette 0-drift `seed-catalog.test.ts`) : il ne contient
 * QUE des `DocType` du seed. Mais `resolveDocs` émet aussi `docType = pa.kind`
 * (enum PedagogicalKind brut : QCM, GRILLE_OBS, DEROULE, POSITIONNEMENT,
 * ANALYSE_BESOIN, SATISFACTION_CHAUD/FROID…) et les pseudo-types identité/légal
 * (CNI/RIB/CFP/CGV/REGLEMENT_INTERIEUR). `DOC_INDICATORS` ÉTEND le catalogue avec
 * ces clés SANS polluer le miroir du seed (sinon le test 0-drift casse). C'est
 * l'unique table lue par le résolveur — toujours zéro mapping local.
 */
export const DOC_INDICATORS: Record<string, string | null> = {
  ...QUALIOPI_DOC_CATALOG_INDICATORS,
  // Kinds PedagogicalAsset bruts (docType = pa.kind dans resolveDocs).
  QCM: 'Indicateur 11', // évaluation des acquis
  GRILLE_OBS: 'Indicateur 11', // grille d'observation formateur
  ANALYSE_BESOIN: 'Indicateur 4', // analyse du besoin
  POSITIONNEMENT: 'Indicateur 8', // positionnement entrée
  SATISFACTION_CHAUD: 'Indicateur 30',
  SATISFACTION_FROID: 'Indicateur 30',
  DEROULE: 'Indicateur 6', // déroulé pédagogique (kind)
  COMPETENCES: 'Indicateur 11', // référentiel de compétences
  // DocType session-only non présents dans le seed catalog.
  DEROULE_PEDAGOGIQUE: 'Indicateur 6',
  GRILLE_OBS_SESSION: 'Indicateur 11',
  CHECKLIST_FORMATION: 'Indicateur 17',
  SATISFACTION: 'Indicateur 30',
  SATISFACTION_SESSION: 'Indicateur 30',
  // Sources identité / légales : pas d'indicateur Qualiopi.
  CNI: null,
  RIB: null,
  CFP: null,
  CGV: null,
  REGLEMENT_INTERIEUR: null,
  CUSTOM: null,
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
  // ── 09.3-03-fix CORRECTION 1 — libellés HUMAINS pour les kinds PedagogicalAsset
  //    bruts émis par `resolveDocs` (docType = pa.kind enum) + sources identité/légal.
  //    Sans ça l'UI affichait la CLÉ brute (« GRILLE_OBS », « QCM »…) — interdit.
  QCM: { short: 'QC', long: "QCM d'évaluation" },
  GRILLE_OBS: { short: 'Go', long: "Grille d'observation" },
  DEROULE: { short: 'Dp', long: 'Déroulé pédagogique' },
  COMPETENCES: { short: 'Cp', long: 'Référentiel de compétences' },
  SATISFACTION: { short: 'Sa', long: 'Évaluation de satisfaction' },
  SATISFACTION_SESSION: { short: 'Ss', long: 'Bilan satisfaction session' },
  CNI: { short: 'Id', long: "Pièce d'identité (CNI)" },
  RIB: { short: 'Ri', long: 'RIB' },
  CFP: { short: 'Cf', long: 'Attestation CFP (AGEFICE)' },
  CGV: { short: 'Cg', long: 'Conditions générales de vente' },
  REGLEMENT_INTERIEUR: { short: 'RI', long: 'Règlement intérieur' },
  CUSTOM: { short: 'Do', long: 'Document personnalisé' },
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
