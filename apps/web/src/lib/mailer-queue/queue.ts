/**
 * Queue BullMQ "mailer" (Sprint 3 — Robustesse).
 *
 * Sort l'envoi de mail du chemin synchrone des Server Actions / Workers.
 * Avantages :
 *   - Action utilisateur ~10× plus rapide (~50ms au lieu de ~500ms-2s SMTP)
 *   - Retry automatique en cas de panne SMTP transitoire (5 tentatives,
 *     backoff exponentiel 30s → 1m → 2m → 4m → 8m)
 *   - Idempotence via `jobId` : un même `idempotencyKey` ne sera pas
 *     enqueué 2 fois (utile pour les reminders cron).
 *   - Le worker peut être scalé indépendamment du process Next.js.
 *
 * Fallback : si Redis est down ou injoignable, l'helper `enqueueMail`
 * (cf `./enqueue.ts`) bascule en envoi inline pour garantir la délivrance.
 */

import { Queue, type JobsOptions } from 'bullmq';
import { getQueueRedis } from '../closure/redis';
import type { SendMailInput } from '../mailer';
import { FAST_JOB_POLICY } from '@/lib/bullmq-policies';

export const MAILER_QUEUE_NAME = 'mailer-outbound';

export interface MailerJobPayload extends SendMailInput {
  /** Optionnel : clé d'idempotence (préfère un format stable type
   *  `lead-notif:lead-123:assigned:2026-06-09`). Si fourni, BullMQ
   *  dédupliquera les jobs avec le même `jobId`. */
  idempotencyKey?: string;
  /** Contexte de log (request-id, userId, etc.) propagé pour la corrélation. */
  context?: {
    requestId?: string;
    userId?: string;
    tenantId?: string;
  };
}

let _queue: Queue<MailerJobPayload> | null = null;

export function getMailerQueue(): Queue<MailerJobPayload> {
  if (_queue) return _queue;
  // Sprint 4 — Politique FAST partagée (cf lib/bullmq-policies.ts).
  // Identique au choix Sprint 3, mais centralisé pour cohérence cross-queue.
  _queue = new Queue<MailerJobPayload>(MAILER_QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: FAST_JOB_POLICY,
  });
  return _queue;
}

/**
 * Ajoute un job d'envoi de mail dans la queue.
 *
 * Le `idempotencyKey` est promu en `jobId` BullMQ : 2 appels avec la même
 * clé pendant que le 1er est encore en wait/active/delayed seront ignorés.
 * Une fois le job complété + son TTL expiré, une nouvelle insertion repasse.
 */
export async function enqueueMailerJob(
  payload: MailerJobPayload,
  opts?: JobsOptions,
): Promise<void> {
  const queue = getMailerQueue();
  const jobName = `mail:${payload.to.slice(0, 50)}`;
  await queue.add(jobName, payload, {
    jobId: payload.idempotencyKey,
    ...opts,
  });
}
