'use server';

/**
 * Relances email automatiques pour les pré-inscriptions PENDING_FORM.
 *
 * Règles métier :
 *   - 1ère relance après 7 jours sans soumission
 *   - 2ème relance après 14 jours
 *   - 3ème (dernière) après 21 jours
 *   - Au-delà de 30 jours sans soumission → marquer EXPIRED (séparé)
 *
 * Pas de relance si :
 *   - Statut ≠ PENDING_FORM (déjà soumis / converti / rejeté)
 *   - Pas d'email destinataire (pre.sentTo null)
 *   - Lien expiré (pre.expiresAt < now)
 *   - reminderCount ≥ 3 (limite atteinte)
 *   - lastReminderSentAt < 6 jours (anti-spam — au moins 6j entre 2 relances)
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { sendMail } from '@/lib/mailer';
import { renderReminderHtml } from '@/lib/preinscription-reminder-template';
import { loadOfConfig } from '@/lib/of-config';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const DAYS_BETWEEN_REMINDERS = 6;
const MAX_REMINDERS = 3;

function buildPublicUrl(token: string): string {
  return `${APP_BASE_URL.replace(/\/$/, '')}/preinscription/${token}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

interface ReminderResult {
  ok: boolean;
  preEnrollmentId: string;
  to: string | null;
  reminderNumber?: number;
  dryRun?: boolean;
  skippedReason?: string;
  error?: string;
}

/**
 * Envoie une relance pour 1 PreEnrollment précis. Idempotent (anti-spam 6j).
 * Met à jour reminderCount + lastReminderSentAt.
 */
export async function sendPreEnrollmentReminder(
  preEnrollmentId: string,
  opts: { force?: boolean } = {},
): Promise<ReminderResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, preEnrollmentId, to: null, error: 'Non authentifié' };

  const pre = await prisma.preEnrollment.findFirst({
    where: { id: preEnrollmentId, tenantId: user.tenantId },
    include: { intendedSession: { include: { product: { select: { title: true } } } } },
  });
  if (!pre) return { ok: false, preEnrollmentId, to: null, error: 'Pré-inscription introuvable' };

  const recipient = pre.email?.trim() || pre.sentTo?.trim() || null;
  if (!recipient) {
    return { ok: false, preEnrollmentId, to: null, skippedReason: 'no-email' };
  }
  if (pre.status !== 'PENDING_FORM') {
    return { ok: false, preEnrollmentId, to: recipient, skippedReason: 'not-pending' };
  }
  if (pre.expiresAt < new Date()) {
    return { ok: false, preEnrollmentId, to: recipient, skippedReason: 'expired' };
  }
  if (!opts.force) {
    if (pre.reminderCount >= MAX_REMINDERS) {
      return { ok: false, preEnrollmentId, to: recipient, skippedReason: 'max-reminders' };
    }
    if (
      pre.lastReminderSentAt &&
      daysBetween(new Date(), pre.lastReminderSentAt) < DAYS_BETWEEN_REMINDERS
    ) {
      return { ok: false, preEnrollmentId, to: recipient, skippedReason: 'cooldown' };
    }
  }

  const reminderNumber = pre.reminderCount + 1;
  const sentAtRef = pre.sentAt ?? pre.createdAt;
  const daysSinceSent = Math.max(1, daysBetween(new Date(), sentAtRef));
  const formationTitre = pre.intendedSession?.product?.title ?? null;

  const of = await loadOfConfig(user.tenantId);
  const { subject, html, text } = renderReminderHtml(
    {
      firstName: pre.firstName,
      lastName: pre.lastName,
      publicUrl: buildPublicUrl(pre.token),
      reminderNumber,
      daysSinceSent,
      formationTitre,
    },
    of,
  );

  const r = await sendMail({ to: recipient, subject, html, text });
  if (!r.ok) {
    return { ok: false, preEnrollmentId, to: recipient, error: r.error };
  }

  await prisma.preEnrollment.update({
    where: { id: preEnrollmentId },
    data: {
      reminderCount: { increment: 1 },
      lastReminderSentAt: new Date(),
    },
  });

  revalidatePath('/app/preinscriptions');
  revalidatePath(`/app/preinscriptions/${preEnrollmentId}`);

  return {
    ok: true,
    preEnrollmentId,
    to: recipient,
    reminderNumber,
    dryRun: r.dryRun,
  };
}

export interface BulkRemindersResult {
  ok: boolean;
  totalCandidates: number;
  sent: number;
  skipped: number;
  errors: number;
  details: ReminderResult[];
  dryRun: boolean;
}

/**
 * Envoie en bulk les relances pour TOUTES les pré-inscriptions PENDING_FORM
 * éligibles (selon les règles définies en haut). Utilisée par le bouton manuel
 * sur /app/preinscriptions et par le scheduler BullMQ quotidien.
 */
export async function sendBulkPreEnrollmentReminders(): Promise<BulkRemindersResult> {
  const { user } = await validateRequest();
  if (!user) {
    return { ok: false, totalCandidates: 0, sent: 0, skipped: 0, errors: 0, details: [], dryRun: false };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const cooldownDate = new Date(now.getTime() - DAYS_BETWEEN_REMINDERS * 86400000);

  // Candidats : PENDING_FORM, créées il y a > 7j, pas expirées, pas atteint la
  // limite de relances, dernière relance > 6j (ou jamais).
  const candidates = await prisma.preEnrollment.findMany({
    where: {
      tenantId: user.tenantId,
      status: 'PENDING_FORM',
      createdAt: { lt: sevenDaysAgo },
      expiresAt: { gt: now },
      reminderCount: { lt: MAX_REMINDERS },
      OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lt: cooldownDate } }],
    },
    select: { id: true },
    take: 200, // safety cap
  });

  const details: ReminderResult[] = [];
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let anyDryRun = false;

  for (const c of candidates) {
    const r = await sendPreEnrollmentReminder(c.id);
    details.push(r);
    if (r.dryRun) anyDryRun = true;
    if (r.ok) sent++;
    else if (r.skippedReason) skipped++;
    else errors++;
  }

  return {
    ok: true,
    totalCandidates: candidates.length,
    sent,
    skipped,
    errors,
    details,
    dryRun: anyDryRun,
  };
}
