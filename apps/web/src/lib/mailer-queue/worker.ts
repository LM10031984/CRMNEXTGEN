/**
 * Worker BullMQ pour la queue `mailer-outbound` (Sprint 3 — Robustesse).
 *
 * Process indépendant lancé via :
 *   pnpm --filter @qualiof/web worker:mailer
 *
 * Concurrence : 5 mails en parallèle (suffisant pour la plupart des
 * SMTP, ajustable via env `MAILER_CONCURRENCY`).
 *
 * Le worker délègue à `sendMail()` (mailer.ts) pour la logique SMTP
 * réelle. En cas d'échec, BullMQ retry selon la backoff policy de
 * la queue (cf queue.ts).
 */

import { Worker } from 'bullmq';
import { sendMail } from '../mailer';
import { childLogger, runWithContext } from '../logger';
import { getWorkerRedis } from '../closure/redis';
import { MAILER_QUEUE_NAME, type MailerJobPayload } from './queue';

const log = childLogger('mailer-worker');
const CONCURRENCY = Number(process.env.MAILER_CONCURRENCY ?? 5);

export function startMailerWorker(): Worker<MailerJobPayload> {
  const worker = new Worker<MailerJobPayload>(
    MAILER_QUEUE_NAME,
    async (job) => {
      const { context, idempotencyKey, ...sendInput } = job.data;
      // Restaure le contexte de log de la requête originale pour la corrélation.
      return runWithContext(
        {
          requestId: context?.requestId ?? `mailer-job:${job.id ?? 'unknown'}`,
          userId: context?.userId,
          tenantId: context?.tenantId,
          jobId: job.id,
          queueName: MAILER_QUEUE_NAME,
        },
        async () => {
          const r = await sendMail(sendInput);
          if (!r.ok) {
            // Throw pour que BullMQ déclenche la retry policy.
            throw new Error(r.error ?? 'sendMail failed');
          }
          return r;
        },
      );
    },
    {
      connection: getWorkerRedis(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    log.info(
      { jobId: job.id, to: job.data.to, attempts: job.attemptsMade + 1 },
      'mail.sent',
    );
  });
  worker.on('failed', (job, err) => {
    log.error(
      {
        jobId: job?.id,
        to: job?.data?.to,
        attempts: job?.attemptsMade,
        err: { message: err.message, stack: err.stack },
      },
      'mail.failed',
    );
  });
  worker.on('error', (err) => {
    log.error(
      { err: { message: err.message, stack: err.stack } },
      'worker.error',
    );
  });

  log.info({ concurrency: CONCURRENCY, queueName: MAILER_QUEUE_NAME }, 'worker.started');
  return worker;
}
