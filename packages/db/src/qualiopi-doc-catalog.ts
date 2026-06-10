/**
 * Phase 9.3 (plan 09.3-02) — référentiel QualiopiDocCatalog, source unique
 * consommée par le seed (`prisma/seed.ts`) et verrouillée par le test de
 * mapping (`src/__tests__/qualiopi-doc-catalog.test.ts`).
 *
 * Triage des 5 DocType fantômes (décisions actées, plan directeur Partie 1) :
 *  - SATISFACTION        → fusionné en SATISFACTION_CHAUD + SATISFACTION_FROID (ind. 30)
 *  - PRE_ACCORD_OPCO     → jalon OpcoSubmission, retiré du catalogue documents
 *  - VALIDATION_OPCO     → jalon OpcoSubmission, retiré du catalogue documents
 *  - SUPPORT_PEDAGOGIQUE → conservé, indicateur 19, upload manuel
 *  - CUSTOM              → conservé, upload libre (sans indicateur)
 *
 * CONVENTION : preuve transversale (ind. 5, 6, 9) ; document et transmission
 * contrôlés sous l'ind. 9 par la grille BCI → tag primaire « Indicateur 9 »
 * (D-09.3-08, dette (b) : la convention ne figure pas sous l'item ind. 1 de T7).
 */

export type QualiopiDocCatalogEntry = {
  type: string;
  name: string;
  phase: 'Pré-formation' | 'Formation' | 'Post-formation' | 'Administratif';
  qualiopiIndicator: string | null;
  isMandatory: boolean;
  description: string | null;
  recommendedDelay: string | null;
  responsible: string | null;
};

export const QUALIOPI_DOC_CATALOG: QualiopiDocCatalogEntry[] = [
  {
    type: 'CONVENTION',
    name: 'Convention de formation',
    phase: 'Pré-formation',
    qualiopiIndicator: 'Indicateur 9',
    isMandatory: true,
    description:
      "Convention signée entre l'organisme, l'apprenant et l'OPCO — preuve transversale (ind. 5, 6, 9), contrôlée sous l'indicateur 9",
    recommendedDelay: 'Avant le début de la formation',
    responsible: 'OF',
  },
  {
    type: 'PROGRAMME',
    name: 'Programme de formation',
    phase: 'Pré-formation',
    qualiopiIndicator: 'Indicateur 9',
    isMandatory: true,
    description: "Programme détaillé remis à l'apprenant avant la formation",
    recommendedDelay: 'Avant le début de la formation',
    responsible: 'OF',
  },
  {
    type: 'CONVOCATION',
    name: 'Convocation',
    phase: 'Pré-formation',
    qualiopiIndicator: null,
    isMandatory: false,
    description: "Convocation à la formation envoyée à l'apprenant",
    recommendedDelay: 'J-15 minimum',
    responsible: 'OF',
  },
  {
    type: 'AGEFICE',
    name: 'Demande de prise en charge AGEFICE',
    phase: 'Pré-formation',
    qualiopiIndicator: 'Indicateur 7',
    isMandatory: false,
    description:
      'Formulaire AGEFICE pré-rempli pour les apprenants en EI/auto-entreprise éligibles',
    recommendedDelay: 'Avant le début de la formation',
    responsible: 'OF',
  },
  {
    type: 'EMARGEMENT',
    name: "Feuille d'émargement",
    phase: 'Formation',
    qualiopiIndicator: 'Indicateur 12',
    isMandatory: true,
    description: "Feuille signée par l'apprenant pour chaque demi-journée de formation",
    recommendedDelay: 'À chaque demi-journée de formation',
    responsible: 'Formateur',
  },
  {
    type: 'SUPPORT_PEDAGOGIQUE',
    name: 'Supports pédagogiques',
    phase: 'Formation',
    qualiopiIndicator: 'Indicateur 19',
    isMandatory: true,
    description:
      'Supports de formation remis pendant ou après la formation — upload manuel (pas de générateur)',
    recommendedDelay: 'Pendant ou à la fin de la formation',
    responsible: 'Formateur',
  },
  {
    type: 'CERTIFICAT_REALISATION',
    name: 'Certificat de réalisation',
    phase: 'Formation',
    qualiopiIndicator: 'Légal Art. L6353-1',
    isMandatory: true,
    description:
      "Certificat obligatoire remis à l'apprenant à la fin de la formation (Art. L6353-1)",
    recommendedDelay: 'À la fin de la formation',
    responsible: 'OF',
  },
  {
    type: 'ASSIDUITE',
    name: "Feuille d'assiduité",
    phase: 'Post-formation',
    qualiopiIndicator: 'Indicateur 12',
    isMandatory: true,
    description: "Récapitulatif de présence de l'apprenant",
    recommendedDelay: 'À la fin de la formation',
    responsible: 'OF',
  },
  {
    type: 'EVALUATION_ACQUIS',
    name: 'Évaluation des acquis',
    phase: 'Post-formation',
    qualiopiIndicator: 'Indicateur 11',
    isMandatory: true,
    description: "Évaluation des compétences acquises par l'apprenant",
    recommendedDelay: 'À la fin de la formation',
    responsible: 'Formateur',
  },
  {
    type: 'ATTESTATION_FIN',
    name: 'Attestation de fin de formation',
    phase: 'Post-formation',
    qualiopiIndicator: 'Indicateur 11',
    isMandatory: false,
    description: 'Attestation complémentaire au certificat de réalisation',
    recommendedDelay: 'À la fin de la formation',
    responsible: 'OF',
  },
  {
    type: 'SATISFACTION_CHAUD',
    name: 'Questionnaire de satisfaction à chaud',
    phase: 'Post-formation',
    qualiopiIndicator: 'Indicateur 30',
    isMandatory: true,
    description: "Évaluation de la satisfaction de l'apprenant à l'issue de la formation (J+1)",
    recommendedDelay: 'À la fin de la formation (dans les 15 jours)',
    responsible: 'OF',
  },
  {
    type: 'SATISFACTION_FROID',
    name: 'Questionnaire de satisfaction à froid',
    phase: 'Post-formation',
    qualiopiIndicator: 'Indicateur 30',
    isMandatory: true,
    description: "Évaluation de la satisfaction de l'apprenant à distance de la formation (J+90)",
    recommendedDelay: 'Environ 3 mois après la formation',
    responsible: 'OF',
  },
  {
    type: 'FACTURE',
    name: 'Facture formation',
    phase: 'Administratif',
    qualiopiIndicator: 'Légal',
    isMandatory: true,
    description: "Facture de formation envoyée à l'apprenant ou l'OPCO",
    recommendedDelay: 'À la fin de la formation',
    responsible: 'OF',
  },
  {
    type: 'CUSTOM',
    name: 'Document personnalisé',
    phase: 'Administratif',
    qualiopiIndicator: null,
    isMandatory: false,
    description: 'Document libre téléversé manuellement (upload libre)',
    recommendedDelay: null,
    responsible: 'OF',
  },
];

/**
 * Types retirés du catalogue documents (purgés au re-seed) :
 * SATISFACTION fusionné chaud/froid ; PRE_ACCORD_OPCO et VALIDATION_OPCO
 * sont des jalons du workflow OpcoSubmission, pas des documents Qualiopi.
 */
export const RETIRED_DOC_CATALOG_TYPES = [
  'SATISFACTION',
  'PRE_ACCORD_OPCO',
  'VALIDATION_OPCO',
] as const;
