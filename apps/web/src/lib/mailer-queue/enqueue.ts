/**
 * Helper unifié pour envoyer un mail — privilégie la queue, retombe sur
 * l'envoi inline si Redis est down.
 *
 * Usage cible côté Server Actions / Workers :
 *
 *   await enqueueMail({
 *     to: 'alice@example.com',
 *     subject: '…',
 *     html: '…',
 *     text: '…',
 *     idempotencyKey: `lead-assigned:${leadId}:${assigneeId}`,
 *   });
 *
 * Retour :
 *   - `{ ok: true, mode: 'queued', jobId }` si push en queue réussi
 *   - `{ ok: true, mode: 'inline' }` si fallback inline avec succès
 *   - `{ ok: true, mode: 'dry-run' }` si SMTP non configuré (mode dev)
 *   - `{ ok: false, error }` si même l'inline a échoué
 *
 * Note : on logge automatiquement le contexte (requestId, userId) via le
 * AsyncLocalStorage du logger.
 */

import { sendMail, type SendMailInput } from '../mailer';
import { childLogger, getContext } from '../logger';
import { enqueueMailerJob, type MailerJobPayload } from './queue';

const log = childLogger('mailer-enqueue');

export interface EnqueueMailResult {
  ok: boolean;
  mode?: 'queued' | 'inline' | 'dry-run';
  jobId?: string;
  error?: string;
}

export interface EnqueueMailInput extends SendMailInput {
  idempotencyKey?: string;
}

export async function enqueueMail(input: EnqueueMailInput): Promise<EnqueueMailResult> {
  const ctx = getContext();
  const payload: MailerJobPayload = {
    ...input,
    context: ctx
      ? {
          requestId: ctx.requestId,
          userId: ctx.userId,
          tenantId: ctx.tenantId,
        }
      : undefined,
  };

  // Tente la queue d'abord
  try {
    await enqueueMailerJob(payload);
    log.info(
      { to: input.to, idempotencyKey: input.idempotencyKey },
      'mail.queued',
    );
    return { ok: true, mode: 'queued', jobId: input.idempotencyKey };
  } catch (queueErr) {
    log.warn(
      {
        to: input.to,
        err: { message: (queueErr as Error).message },
      },
      'mail.queue.failed.fallback-inline',
    );
    // Fallback inline
    const r = await sendMail(input);
    if (r.ok) {
      return { ok: true, mode: r.dryRun ? 'dry-run' : 'inline' };
    }
    return { ok: false, error: r.error ?? 'Échec envoi mail' };
  }
}
