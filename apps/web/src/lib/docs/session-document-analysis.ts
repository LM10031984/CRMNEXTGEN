/**
 * Lot 0 — état documentaire d'une session, en une seule lecture.
 *
 * La fiche session a besoin de trois informations qui portent toutes sur les
 * MÊMES documents :
 *  · périmé      (0.2) — une donnée rendue a bougé depuis la génération ;
 *  · non vérifiable (0.2) — type couvert par l'empreinte, mais sans empreinte
 *    (produit avant le 02/09/2026) : on ne peut rien affirmer, et le dire est
 *    plus honnête qu'un vert de complaisance ;
 *  · engagé      (0.2) — le document est PROUVÉ sorti (email tracé, dossier
 *    financeur parti, signature).
 *
 * Les charger séparément relirait trois fois la même table. Ce module lit les
 * documents une fois et délègue chaque verdict à son module d'origine — la
 * logique reste là où elle est testée.
 */

import { prisma } from '@qualiof/db';
import {
  findSessionDocumentVerdicts,
  DOCUMENT_VERDICT_SELECT,
  type SessionDocumentVerdicts,
} from './document-source';
import { findEngagedDocumentIds } from './document-engagement';

export interface SessionDocumentAnalysis extends SessionDocumentVerdicts {
  /** Documents dont la sortie de la maison est établie (pas supposée). */
  engaged: Set<string>;
}

const VIDE: SessionDocumentAnalysis = {
  stale: new Set(),
  unverifiable: new Set(),
  engaged: new Set(),
};

export async function analyzeSessionDocuments(
  tenantId: string,
  sessionId: string,
  productId: string | null,
): Promise<SessionDocumentAnalysis> {
  try {
    const documents = await prisma.document.findMany({
      where: {
        tenantId,
        OR: [
          { sessionId },
          ...(productId ? [{ entityType: 'product', entityId: productId }] : []),
        ],
      },
      select: { ...DOCUMENT_VERDICT_SELECT, createdAt: true, pdfUrl: true },
    });
    if (documents.length === 0) return { stale: new Set(), unverifiable: new Set(), engaged: new Set() };

    const [verdicts, engaged] = await Promise.all([
      findSessionDocumentVerdicts(tenantId, sessionId, documents),
      findEngagedDocumentIds(tenantId, documents),
    ]);

    return { ...verdicts, engaged };
  } catch (e) {
    console.warn(
      '[session-document-analysis] état documentaire indisponible :',
      e instanceof Error ? e.message : e,
    );
    return { stale: new Set(VIDE.stale), unverifiable: new Set(), engaged: new Set() };
  }
}
