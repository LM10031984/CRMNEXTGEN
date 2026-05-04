/**
 * Types partagés du pack fin de formation (palier 4).
 *
 * Le worker BullMQ et les server actions partagent les mêmes structures
 * pour décrire un job de génération.
 */

import type { ClosureDocKind } from '@qualiof/db';

export type { ClosureDocKind };

export const CLOSURE_DOC_KINDS = [
  'ATTESTATION',
  'CERTIFICAT',
  'QCM',
  'GRILLE_OBS',
  'ANALYSE_BESOIN',
  'POSITIONNEMENT',
  'SATISFACTION_CHAUD',
  'SATISFACTION_FROID',
  'DEROULE_PEDA',
  'EMARGEMENT',
] as const satisfies readonly ClosureDocKind[];

export const CLOSURE_DOC_KIND_LABELS: Record<ClosureDocKind, string> = {
  ATTESTATION: 'Attestation de fin de formation',
  CERTIFICAT: 'Certificat de réalisation',
  QCM: 'QCM final',
  GRILLE_OBS: "Grille d'observation",
  ANALYSE_BESOIN: 'Analyse des besoins',
  POSITIONNEMENT: 'Questionnaire de positionnement',
  SATISFACTION_CHAUD: 'Évaluation de satisfaction à chaud',
  SATISFACTION_FROID: 'Évaluation de satisfaction à froid',
  DEROULE_PEDA: 'Déroulé pédagogique',
  EMARGEMENT: "Fiche d'émargement",
};

export interface ClosureJobPayload {
  jobId: string;
  batchId: string;
  tenantId: string;
  sessionId: string;
  participantId: string;
  kind: ClosureDocKind;
}

/**
 * Résultat retourné par un renderer (mock ou réel) — buffer du PDF + clé MinIO finale.
 * Le renderer peut aussi renvoyer du JSON brut (cas QCM/grille d'observation) à stocker
 * dans `PedagogicalAsset.rawJson` à côté du PDF.
 *
 * `usedStub: true` signale que l'IA a échoué et qu'on a fallback sur le contenu
 * générique de stub-content.ts — le doc DOIT être régénéré avant un audit
 * Qualiopi car son contenu n'est pas personnalisé.
 */
export interface ClosureRenderResult {
  pdfBuffer: Buffer;
  rawJson?: unknown;
  usedStub?: boolean;
}
