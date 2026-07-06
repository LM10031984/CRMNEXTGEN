/**
 * Phase 20 WORK-04 — Driver de poll OCR pré-inscription (remplace le
 * fire-and-forget serverless mort sur Vercel).
 * Réutilise le statut PreEnrollment.SUBMITTED comme file d'attente (pas de
 * nouvelle table). Claim atomique FOR UPDATE SKIP LOCKED → EXTRACTING →
 * extractPreEnrollmentDocuments (qui gère EXTRACTED / échec explicite D-06).
 * Worker-safe : aucun import React/auth.
 */
import { prisma } from '@qualiof/db';
import { extractPreEnrollmentDocuments } from './preinscription-extractor';

export async function processNextPreEnrollmentOcr(maxJobs = 3): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  // 1. Claim atomique : passe SUBMITTED → EXTRACTING et RETURNING les ids
  //    FOR UPDATE SKIP LOCKED évite qu'un 2e worker prenne la même row.
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "PreEnrollment"
    SET "status" = 'EXTRACTING', "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "PreEnrollment"
      WHERE "status" = 'SUBMITTED'
      ORDER BY "submittedAt" ASC NULLS LAST
      LIMIT ${maxJobs}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"
  `;
  if (claimed.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  // Séquentiel (convention projet : jamais de runs parallèles massifs → deadlocks)
  for (const row of claimed) {
    try {
      // extractPreEnrollmentDocuments repasse EXTRACTING (idempotent) →
      // EXTRACTED en succès, ou SUBMITTED + aiErrorMsg en échec (D-06 anti-dégradation).
      await extractPreEnrollmentDocuments(row.id);
      succeeded++;
    } catch (e: any) {
      failed++;
      // Filet : si l'extractor a jeté sans repasser SUBMITTED, on le repasse
      // SUBMITTED + message (jamais laisser bloqué EXTRACTING silencieux — D-06).
      await prisma.preEnrollment
        .update({
          where: { id: row.id },
          data: {
            status: 'SUBMITTED',
            aiErrorMsg: `OCR worker error: ${e?.message ?? String(e)}`,
          },
        })
        .catch(() => {});
      console.error(
        `[ocr-queue] preenrollment ${row.id.slice(0, 8)}… failed: ${e?.message?.slice(0, 200)}`,
      );
    }
  }
  return { processed: claimed.length, succeeded, failed };
}
