/**
 * Wrappers d'observabilité (Sprint 2 — Observabilité).
 *
 * Permettent de propager automatiquement le request-id (lu depuis le header
 * `X-Request-Id` injecté par middleware.ts) dans les logs émis pendant
 * l'exécution du handler.
 *
 * Trois variantes selon le contexte d'exécution :
 *   - `withApiLogging` : pour les Route Handlers `/api/*`
 *   - `withWorkerLogging` : pour les Workers BullMQ
 *   - `withServerActionLogging` : pour les Server Actions (optionnel, l'usage
 *     reste manuel — voir doc/SPRINT-2-OBSERVABILITE.md)
 *
 * Tous loggent automatiquement le début + la fin (avec durée) et capturent
 * les exceptions.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { logger, runWithContext, type LogContext } from './logger';

type ApiHandler = (req: NextRequest, ctx: unknown) => Promise<Response>;

/**
 * Wrap un Route Handler API pour :
 *   - lire le request-id du header (injecté par middleware.ts)
 *   - démarrer le contexte AsyncLocalStorage pour la durée du handler
 *   - logger l'entrée + sortie avec durée + status
 *   - capturer les exceptions non gérées
 *
 * Usage :
 *
 *   // apps/web/src/app/api/foo/route.ts
 *   import { withApiLogging } from '@/lib/with-logging';
 *
 *   export const GET = withApiLogging(async (req) => {
 *     // ... votre code, peut appeler logger.info(...) qui sera enrichi
 *     return NextResponse.json({ ok: true });
 *   });
 */
export function withApiLogging(handler: ApiHandler): ApiHandler {
  return async (req, ctx) => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const logCtx: LogContext = { requestId };
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;
    const start = Date.now();

    return runWithContext(logCtx, async () => {
      logger.info({ method, path }, 'api.start');
      try {
        const res = await handler(req, ctx);
        const durationMs = Date.now() - start;
        logger.info(
          { method, path, status: res.status, durationMs },
          'api.end',
        );
        // Propager le request-id en réponse (utile si le middleware ne l'a pas
        // déjà mis — ex: route exclue du matcher).
        if (!res.headers.get('x-request-id')) {
          res.headers.set('x-request-id', requestId);
        }
        return res;
      } catch (err) {
        const durationMs = Date.now() - start;
        logger.error(
          { method, path, durationMs, err: serializeError(err) },
          'api.error',
        );
        // On laisse Next gérer la réponse 500 — mais on garde le request-id.
        return new NextResponse(
          JSON.stringify({ ok: false, error: 'Internal server error', requestId }),
          {
            status: 500,
            headers: {
              'content-type': 'application/json',
              'x-request-id': requestId,
            },
          },
        );
      }
    });
  };
}

/**
 * Wrap un processeur de job BullMQ pour le même bénéfice côté worker.
 * Le request-id est ici remplacé par le jobId BullMQ (qui sert d'ID de trace).
 *
 * Usage :
 *
 *   const worker = new Worker('closure', withWorkerLogging('closure', async (job) => {
 *     // ... votre code
 *   }), { connection });
 */
export function withWorkerLogging<T = unknown, R = unknown>(
  queueName: string,
  processor: (job: { id?: string; name?: string; data: T }) => Promise<R>,
): (job: { id?: string; name?: string; data: T }) => Promise<R> {
  return async (job) => {
    const jobId = job.id ?? crypto.randomUUID();
    const logCtx: LogContext = {
      requestId: `worker:${queueName}:${jobId}`,
      jobId,
      queueName,
    };
    const start = Date.now();

    return runWithContext(logCtx, async () => {
      logger.info({ jobName: job.name }, 'worker.start');
      try {
        const result = await processor(job);
        const durationMs = Date.now() - start;
        logger.info({ jobName: job.name, durationMs }, 'worker.end');
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        logger.error(
          { jobName: job.name, durationMs, err: serializeError(err) },
          'worker.error',
        );
        // On relance pour que BullMQ gère le retry policy.
        throw err;
      }
    });
  };
}

/**
 * Sérialise une exception en objet loguable (pino sérialise automatiquement
 * via son `serializers.err` mais on s'assure que stack est inclus).
 */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { value: String(err) };
}
