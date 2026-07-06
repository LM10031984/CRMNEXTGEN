/**
 * Phase 20 WORK-04 — Entry-point worker OCR pré-inscription.
 *
 * Remplace le fire-and-forget serverless mort sur Vercel : poll les
 * PreEnrollment en statut SUBMITTED et exécute extractPreEnrollmentDocuments
 * sur le 3ᵉ hôte (qui possède pdftoppm/poppler).
 *
 * Lancé via : pnpm --filter @qualiof/web worker:ocr
 * Calqué sur closure-worker-postgres.ts (poll loop + SIGINT/SIGTERM + env fail-loud).
 */

import '@qualiof/shared/env';
import { processNextPreEnrollmentOcr } from '../src/lib/preinscription-ocr-queue';

const POLL_INTERVAL_MS = Number(process.env.OCR_POLL_INTERVAL_MS ?? 5000);
const CONCURRENCY = Number(process.env.OCR_CONCURRENCY ?? 2);
let stopped = false;

async function loop() {
  console.log(`[ocr-worker] started — concurrency=${CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms`);
  while (!stopped) {
    try {
      const r = await processNextPreEnrollmentOcr(CONCURRENCY);
      if (r.processed > 0)
        console.log(`[ocr-worker] processed=${r.processed} ok=${r.succeeded} fail=${r.failed}`);
    } catch (e: any) {
      console.error('[ocr-worker] loop error:', e.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.log('[ocr-worker] stopped');
}
const shutdown = (signal: string) => {
  console.log(`[ocr-worker] received ${signal}, draining…`);
  stopped = true;
  setTimeout(() => process.exit(0), 2000);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
loop().catch((e) => {
  console.error('[ocr-worker] fatal:', e);
  process.exit(1);
});
