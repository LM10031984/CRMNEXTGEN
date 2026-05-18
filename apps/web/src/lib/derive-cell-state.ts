/**
 * Phase 9.1 — Centralisation Qualiopi 360°.
 *
 * Pure function `deriveCellState` qui calcule l'état d'une cellule de la
 * matrice docs × stagiaires (fiche session).
 *
 * Cf. RESEARCH.md §"Decision A — deriveCellState" + CONTEXT.md D-07.
 *
 * IMPORTANT — Bug P0 anti-régression :
 *   Le PDF Programme est UNIQUE (Document.entityType='product') et partagé
 *   par tous les participants d'une même session. La matrice doit afficher
 *   N lignes Programme (1 par participant) mais chaque cellule lit ce SEUL
 *   pdfRef partagé via productDocs. Plus de duplication, plus de N "MISSING".
 */

import type { DocStatusMap } from '@qualiof/shared';

export type CellPdfRef = {
  kind: 'document' | 'asset' | 'productDoc' | 'sessionDoc';
  id: string;
};

export type CellState =
  | { state: 'GENERATED'; pdfRef: CellPdfRef }
  | { state: 'MANUAL_OK'; pdfRef?: CellPdfRef; warning?: 'no_proof' }
  | { state: 'MISSING' }
  | { state: 'NA' };

/**
 * Dérive l'état d'une cellule matrice à partir des sources documentaires.
 *
 * Priorité (D-07 + Bug P0 anti-régression) :
 *   1. participant.docStatus[docType] (manuel — wins toujours)
 *   2. participantDocs (Document.entityType='participant', personId match)
 *   3. pedagogicalAssets (PedagogicalAsset participant + kind)
 *   4. sessionDocs (Document.entityType='session')
 *   5. productDocs (Document.entityType='product' — PROGRAMME, etc.) ← Bug P0
 *   6. MISSING
 *
 * Cas dérogatoire D-01 : `MANUAL_OK + markedOkWithoutUpload=true` → warning='no_proof'.
 *
 * @param docType Le type de document (clé MATRIX_DOC_TYPES ou SESSION_ONLY_DOC_TYPES).
 * @param participant Objet portant le `docStatus` map (peut être null/undefined).
 * @param participantDocs Index DocType → Document pour ce participant.
 * @param productDocs Index DocType → Document pour le produit de cette session (Programme, etc.).
 * @param sessionDocs Index DocType → Document pour cette session (déroulé, grille, checklist).
 * @param pedagogicalAssets Index DocType → PedagogicalAsset pour ce participant.
 */
export function deriveCellState(
  docType: string,
  participant: { docStatus: DocStatusMap | null | undefined },
  participantDocs: Map<string, { id: string }>,
  productDocs: Map<string, { id: string }>,
  sessionDocs: Map<string, { id: string }>,
  pedagogicalAssets: Map<string, { id: string }>,
): CellState {
  const manual = participant.docStatus?.[docType];

  // Cas dérogatoire D-01 : coché OK sans upload → pastille orange "preuve manquante"
  if (manual?.state === 'MANUAL_OK' && manual.markedOkWithoutUpload) {
    return { state: 'MANUAL_OK', warning: 'no_proof' };
  }
  if (manual?.state === 'MANUAL_OK') {
    return { state: 'MANUAL_OK' };
  }

  const partDoc = participantDocs.get(docType);
  if (partDoc) return { state: 'GENERATED', pdfRef: { kind: 'document', id: partDoc.id } };

  const asset = pedagogicalAssets.get(docType);
  if (asset) return { state: 'GENERATED', pdfRef: { kind: 'asset', id: asset.id } };

  const sessDoc = sessionDocs.get(docType);
  if (sessDoc) return { state: 'GENERATED', pdfRef: { kind: 'sessionDoc', id: sessDoc.id } };

  // Bug P0 anti-régression : PROGRAMME a Document.entityType='product'
  // partagé entre tous les participants. La cellule lit ce ref partagé.
  const prodDoc = productDocs.get(docType);
  if (prodDoc) return { state: 'GENERATED', pdfRef: { kind: 'productDoc', id: prodDoc.id } };

  return { state: 'MISSING' };
}

/**
 * Helper qui construit les données nécessaires à la matrice complète d'une session :
 * pour chaque participant, l'état de chaque DocType.
 *
 * Garde-fou : cette fonction est volontairement isolée pour faciliter
 * une éventuelle évolution vers un caching/memoization. Wave 1 (Plan 02) sera
 * responsable de l'appeler depuis la page session avec les vraies maps.
 *
 * Le typage volontairement lâche (`Map<string, { id: string }>`) garde la fonction
 * réutilisable côté tests/UI sans coupler à des types Prisma précis.
 */
export function buildMatrixData(
  docTypes: readonly string[],
  participants: ReadonlyArray<{
    id: string;
    docStatus: DocStatusMap | null | undefined;
    participantDocs: Map<string, { id: string }>;
    pedagogicalAssets: Map<string, { id: string }>;
  }>,
  productDocs: Map<string, { id: string }>,
  sessionDocs: Map<string, { id: string }>,
): Array<{ participantId: string; cells: Record<string, CellState> }> {
  return participants.map((p) => {
    const cells: Record<string, CellState> = {};
    for (const docType of docTypes) {
      cells[docType] = deriveCellState(
        docType,
        { docStatus: p.docStatus },
        p.participantDocs,
        productDocs,
        sessionDocs,
        p.pedagogicalAssets,
      );
    }
    return { participantId: p.id, cells };
  });
}
