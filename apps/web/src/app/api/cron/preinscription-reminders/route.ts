/**
 * Endpoint cron pour les relances pré-inscriptions automatiques.
 *
 * À appeler quotidiennement via cron externe (cron-job.org, GitHub Actions,
 * ou launchd/macOS). Protégé par un secret partagé `CRON_SECRET`.
 *
 * Usage :
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://qualiof.example.com/api/cron/preinscription-reminders
 *
 * NB : ce endpoint contourne la session Lucia (multi-tenant non supporté).
 * Pour Start Academy mono-tenant ça suffit. Si on devient multi-tenant, il
 * faudra itérer sur tous les tenants.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';
import { renderReminderHtml } from '@/lib/preinscription-reminder-template';
import { loadOfConfig } from '@/lib/of-config';

export const dynamic = 'force-dynamic';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const DAYS_BETWEEN_REMINDERS = 6;
const MAX_REMINDERS = 3;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function buildPublicUrl(token: string): string {
  return `${APP_BASE_URL.replace(/\/$/, '')}/preinscription/${token}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new NextResponse('CRON_SECRET non configuré', { status: 503 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (authHeader !== expected) return unauthorized();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const cooldownDate = new Date(now.getTime() - DAYS_BETWEEN_REMINDERS * 86400000);

  // Tous tenants confondus (cron global)
  const candidates = await prisma.preEnrollment.findMany({
    where: {
      status: 'PENDING_FORM',
      createdAt: { lt: sevenDaysAgo },
      expiresAt: { gt: now },
      reminderCount: { lt: MAX_REMINDERS },
      OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lt: cooldownDate } }],
    },
    include: {
      intendedSession: { include: { product: { select: { title: true } } } },
    },
    take: 500,
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Phase 7 — cache OfConfig par tenant (cron multi-tenant)
  const ofByTenant = new Map<string, Awaited<ReturnType<typeof loadOfConfig>>>();

  for (const pre of candidates) {
    const recipient = pre.email?.trim() || pre.sentTo?.trim() || null;
    if (!recipient) {
      skipped++;
      continue;
    }
    const reminderNumber = pre.reminderCount + 1;
    const sentAtRef = pre.sentAt ?? pre.createdAt;
    const daysSinceSent = Math.max(1, daysBetween(now, sentAtRef));
    const formationTitre = pre.intendedSession?.product?.title ?? null;

    let of = ofByTenant.get(pre.tenantId);
    if (!of) {
      of = await loadOfConfig(pre.tenantId);
      ofByTenant.set(pre.tenantId, of);
    }

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

    const r = await sendMail({
      to: recipient,
      subject,
      html,
      text,
      context: {
        tenantId: pre.tenantId,
        category: 'preinscription_reminder',
        sessionId: pre.intendedSessionId ?? null,
      },
    });
    if (!r.ok) {
      errors++;
      continue;
    }

    // Phase 22 Plan 22-11 (fermeture Pitfall 1) : compteur consommé UNIQUEMENT
    // sur départ réel — dry-run env ou suppression réglages = skipped.
    if (r.dryRun) {
      skipped++;
      continue;
    }

    await prisma.preEnrollment.update({
      where: { id: pre.id },
      data: { reminderCount: { increment: 1 }, lastReminderSentAt: now },
    });
    sent++;
  }

  return NextResponse.json({
    ok: true,
    totalCandidates: candidates.length,
    sent,
    skipped,
    errors,
    runAt: now.toISOString(),
  });
}
