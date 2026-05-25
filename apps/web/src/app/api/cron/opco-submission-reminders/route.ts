/**
 * Cron : relances auto sur les dossiers OPCO envoyés sans réponse (US-4 étape E).
 *
 * À appeler quotidiennement via cron externe :
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://qualiof.example.com/api/cron/opco-submission-reminders
 *
 * Règle : relance les OpcoSubmission status=SENT dont sentAt > 30j et pas de
 * relance dans les 14 derniers jours, max 3 relances.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const FIRST_REMINDER_AFTER_DAYS = 30;
const DAYS_BETWEEN_REMINDERS = 14;
const MAX_REMINDERS = 3;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return unauthorized();
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return unauthorized();

  const now = new Date();
  const candidates = await prisma.opcoSubmission.findMany({
    where: {
      status: 'SENT',
      sentAt: { not: null },
      reminderCount: { lt: MAX_REMINDERS },
    },
    include: {
      participant: {
        include: {
          person: { select: { firstName: true, lastName: true } },
          session: { select: { code: true, product: { select: { title: true } } } },
        },
      },
      sponsorOrg: { select: { legalName: true, opcoCode: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let dryRunCount = 0;

  for (const sub of candidates) {
    if (!sub.sentAt || !sub.recipientEmail) {
      skipped++;
      continue;
    }
    // 1ère relance ≥ 30j après envoi initial
    const sinceSent = daysBetween(now, sub.sentAt);
    if (sinceSent < FIRST_REMINDER_AFTER_DAYS) {
      skipped++;
      continue;
    }
    // Suivantes : ≥ 14j depuis la dernière
    if (sub.lastReminderSentAt) {
      const sinceLast = daysBetween(now, sub.lastReminderSentAt);
      if (sinceLast < DAYS_BETWEEN_REMINDERS) {
        skipped++;
        continue;
      }
    }

    const apprenant = `${sub.participant.person.firstName} ${sub.participant.person.lastName.toUpperCase()}`;
    const formation = sub.participant.session.product.title;
    const code = sub.participant.session.code ?? '—';
    const subjectRel = `Relance — Dossier ${sub.sponsorOrg.opcoCode ?? 'OPCO'} ${apprenant} (envoyé le ${sub.sentAt.toLocaleDateString('fr-FR')})`;
    const html = `<p>Bonjour,</p>
<p>Sans nouvelle de votre part concernant le dossier de prise en charge envoyé le <strong>${sub.sentAt.toLocaleDateString('fr-FR')}</strong> pour :</p>
<ul>
  <li><strong>Stagiaire :</strong> ${apprenant}</li>
  <li><strong>Formation :</strong> ${formation}</li>
  <li><strong>Session :</strong> ${code}</li>
</ul>
<p>Pourriez-vous m'indiquer où en est l'instruction de ce dossier ?</p>
<p>Relance n°${sub.reminderCount + 1} — sans réponse, je me permettrai de revenir vers vous.</p>
<p>Bien cordialement,<br/>Start Academy</p>`;

    const r = await sendMail({
      to: sub.recipientEmail,
      subject: subjectRel,
      html,
    });
    if (!r.ok) {
      errors++;
      continue;
    }
    if (r.dryRun) dryRunCount++;
    sent++;

    await prisma.opcoSubmission.update({
      where: { id: sub.id },
      data: {
        reminderCount: { increment: 1 },
        lastReminderSentAt: now,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    skipped,
    errors,
    dryRun: dryRunCount > 0,
  });
}
