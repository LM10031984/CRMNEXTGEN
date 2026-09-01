/**
 * Driver "Queue Postgres" — remplace BullMQ + Redis pour les ClosureJob.
 *
 * Principe :
 *   - La table `ClosureJob` est déjà la source de vérité (status QUEUED |
 *     PROCESSING | DONE | ERROR + attempts).
 *   - L'enqueue = INSERT ClosureJob (déjà fait par closure-pack.ts).
 *   - Le claim atomique = `UPDATE ... WHERE id IN (SELECT FOR UPDATE SKIP LOCKED)`
 *     → garantit qu'un seul worker prend un job donné, même avec N workers
 *     concurrents (équivalent BullMQ concurrency).
 *   - Le retry est géré côté processClosureJobPayload (remet QUEUED si pas
 *     final).
 *
 * Comparaison avec BullMQ :
 *   ✓ Pas de Redis à payer / monitorer (1 service en moins)
 *   ✓ Pas de désynchro Redis ↔ Postgres (le bug 03/06 matin des 3 jobs fantômes)
 *   ✓ État de la queue queryable en SQL (debug, dashboard)
 *   ✗ Pas de delayed jobs natif (peu utilisé chez nous)
 *   ✗ Polling > push (latence ~3s acceptable pour notre volume 10-50 PDFs/jour)
 *
 * Migration cloud v6 (2026-06-04).
 */

import { prisma, type ClosureDocKind } from '@qualiof/db';
import { processClosureJobPayload } from './worker';
import type { ClosureJobPayload } from './types';

const MAX_ATTEMPTS = 3;
// Jobs PROCESSING > 15 min → re-claim.
// Le `::int` de la requête n'est pas décoratif : Prisma passe ce nombre en
// paramètre typé bigint, et `make_interval(mins => bigint)` N'EXISTE PAS en
// Postgres (il attend un int). Sans le cast, la boucle du worker closure
// meurt à chaque tour sur `42883 function make_interval(mins => bigint) does
// not exist` — plus aucun pack de fin de formation n'est produit.
const STALL_RECLAIM_AFTER_MIN = 15;

/**
 * Nom logique de la file (conservé pour compat / logs). Il n'y a plus de
 * broker externe : la file EST la table `ClosureJob`.
 */
export const CLOSURE_QUEUE_NAME = 'closure-generation';

/**
 * « Enqueue » d'un job closure dans la file Postgres.
 *
 * Depuis la bascule cloud v6 (Redis viré), l'enfilement réel = l'INSERT de la
 * ligne `ClosureJob` (fait par closure-pack.ts / prepare-training.ts /
 * dispatch-generate-doc.ts). Cette fonction est donc IDEMPOTENTE : elle garantit
 * simplement que le job existe en statut `QUEUED` (reset propre d'un job déjà
 * inséré, ou d'un orphelin en PROCESSING/ERROR relancé). Le worker
 * `closure-worker-postgres.ts` le récupérera au prochain poll via
 * `FOR UPDATE SKIP LOCKED`. AUCUNE connexion Redis n'est ouverte.
 */
export async function enqueueClosureJob(payload: ClosureJobPayload): Promise<void> {
  await prisma.closureJob.update({
    where: { id: payload.jobId },
    data: {
      status: 'QUEUED',
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    },
  });
}

/**
 * Claim atomique : passe `limit` jobs en PROCESSING et retourne leurs payloads.
 * `FOR UPDATE SKIP LOCKED` garantit qu'un autre worker ne prendra pas les
 * mêmes jobs, même si on lance la query en parallèle.
 */
async function claimJobs(limit: number): Promise<ClosureJobPayload[]> {
  // Récupère N ids QUEUED + ids PROCESSING stalled (worker mort en chemin).
  // Note Prisma : on utilise $queryRaw pour FOR UPDATE SKIP LOCKED (pas
  // supporté en API typée).
  const claimed = await prisma.$queryRaw<
    Array<{
      id: string;
      batchId: string;
      participantId: string;
      kind: ClosureDocKind;
      tenantId: string;
      sessionId: string;
      attempts: number;
    }>
  >`
    WITH selected AS (
      SELECT cj.id
      FROM "ClosureJob" cj
      JOIN "ClosureBatch" cb ON cb.id = cj."batchId"
      WHERE cj.status = 'QUEUED'
         OR (cj.status = 'PROCESSING' AND cj."startedAt" < NOW() - make_interval(mins => ${STALL_RECLAIM_AFTER_MIN}::int))
      ORDER BY cj."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE OF cj SKIP LOCKED
    )
    UPDATE "ClosureJob" cj
    SET status = 'PROCESSING',
        attempts = cj.attempts + 1,
        "startedAt" = NOW(),
        "errorMessage" = NULL,
        "updatedAt" = NOW()
    FROM selected, "ClosureBatch" cb
    WHERE cj.id = selected.id
      AND cb.id = cj."batchId"
    RETURNING cj.id, cj."batchId", cj."participantId", cj.kind, cb."tenantId", cb."sessionId", cj.attempts
  `;

  return claimed.map((c) => ({
    jobId: c.id,
    batchId: c.batchId,
    tenantId: c.tenantId,
    sessionId: c.sessionId,
    participantId: c.participantId,
    kind: c.kind as ClosureDocKind,
  }));
}

/**
 * Traite jusqu'à `maxJobs` jobs QUEUED en parallèle. Retourne le nombre traités.
 * À appeler depuis :
 *   - Worker local (boucle while + sleep) → scripts/closure-worker-postgres.ts
 *   - Vercel Cron endpoint → app/api/cron/closure-worker/route.ts
 */
export async function processNextClosureJobs(maxJobs = 3): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const payloads = await claimJobs(maxJobs);
  if (payloads.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    payloads.map(async (p) => {
      try {
        // Le claim a déjà incrémenté attempts → on lit la valeur courante pour
        // décider du final attempt (côté processClosureJobPayload).
        const current = await prisma.closureJob.findUnique({
          where: { id: p.jobId },
          select: { attempts: true },
        });
        const attemptsMade = (current?.attempts ?? 1) - 1; // -1 car déjà incrémenté
        await processClosureJobPayload(p, {
          attemptsMade,
          maxAttempts: MAX_ATTEMPTS,
          markProcessing: false, // déjà fait dans claim
        });
        succeeded++;
      } catch (e: any) {
        failed++;
        console.error(
          `[queue-postgres] job ${p.jobId.slice(0, 8)}… (${p.kind}) failed : ${e.message?.slice(0, 200)}`,
        );
      }
    }),
  );

  return { processed: payloads.length, succeeded, failed };
}
