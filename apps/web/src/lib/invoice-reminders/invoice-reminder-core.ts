/**
 * Phase 20 Plan 20-05 — Cœur NEUTRE (sans auth, sans next/cache) de l'envoi de
 * relance facture, extrait pour le worker conteneurisé (3ᵉ hôte Railway).
 *
 * POURQUOI CE MODULE — règle projet « Worker jamais d'imports auth React » :
 * `@/server/actions/invoices` est un module `'use server'` qui importe au niveau
 * module `next/cache` (revalidatePath) et `@/lib/rbac` → `@/lib/auth` →
 * `import { cache } from 'react'`. En runtime worker (tsx/Node ESM brut, hors
 * bundler Next), `react` n'exporte pas `cache` → crash
 * `SyntaxError: The requested module 'react' does not provide an export named 'cache'`
 * (révélé au smoke conteneur pm2, 20-05). Le chemin CRON de `sendInvoiceReminder`
 * n'appelle JAMAIS requireRole ni revalidatePath — mais l'import de niveau module
 * suffit à casser le boot. On isole donc la logique cron dans ce module neutre,
 * qui n'importe QUE des libs worker-safe (prisma, mailer, audit, of-config,
 * template). La server action UI reste inchangée (parité stricte de la logique).
 *
 * Décisions préservées (identiques à sendInvoiceReminder, branche cron) :
 *  - D-13   : auto-stop si status ∈ {PAID, CANCELLED, CREDIT_NOTE, DRAFT}
 *  - D-13b  : idempotence 24h via lastReminderAt (cron)
 *  - D-13c  : AuditLog `invoices.reminder_sent` systématique (même dry-run/erreur email)
 *  - D-12   : niveau = clamp(reminderCount + 1, 1, invoiceReminderDays.length)
 *  - Mailer : dry-run automatique si SMTP_HOST vide (mailer.ts)
 *  - Recipient : payerOrg.emailBilling > payerOrg.email > participant.person.email
 */

import { prisma } from '@qualiof/db';
import { loadOfConfig } from '@/lib/of-config';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { sendMail } from '@/lib/mailer';
import { renderInvoiceReminderEmail } from '@/lib/mailer-templates/invoice-reminder';

const REMINDER_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function getReminderRecipientEmail(invoice: {
  payerOrg: { email: string | null; emailBilling: string | null } | null;
  participant: { person: { email: string | null } | null } | null;
}): string | null {
  return (
    invoice.payerOrg?.emailBilling ??
    invoice.payerOrg?.email ??
    invoice.participant?.person?.email ??
    null
  );
}

/**
 * Envoi cron d'une relance facture — version worker-safe (sans RBAC, sans
 * revalidatePath). Reproduit EXACTEMENT la branche `triggered_by='cron'` de
 * `sendInvoiceReminder`.
 */
export async function sendInvoiceReminderCron(input: {
  invoiceId: string;
}): Promise<
  | { ok: true; level: 1 | 2; dryRun: boolean }
  | { ok: false; error: string }
> {
  // Cron : pas d'utilisateur — on lit le tenantId depuis la facture
  const inv0 = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { tenantId: true },
  });
  if (!inv0) return { ok: false, error: 'Facture introuvable' };
  const tenantId = inv0.tenantId;
  const userId: string | null = null;

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenantId },
    include: {
      payerOrg: { select: { legalName: true, email: true, emailBilling: true } },
      participant: {
        include: {
          person: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };

  // Auto-stop D-13
  if (invoice.status === 'PAID') return { ok: false, error: 'Facture déjà payée' };
  if (invoice.status === 'CANCELLED') return { ok: false, error: 'Facture annulée' };
  if (invoice.status === 'CREDIT_NOTE') return { ok: false, error: 'Pas de relance sur un avoir' };
  if (invoice.status === 'DRAFT') return { ok: false, error: 'Facture en brouillon' };

  // Idempotence 24h (cron)
  if (invoice.lastReminderAt) {
    const since = Date.now() - invoice.lastReminderAt.getTime();
    if (since < REMINDER_DEDUP_WINDOW_MS) {
      return { ok: false, error: 'Idempotence 24h (cron)' };
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { invoiceReminderDays: true },
  });
  const reminderDays = tenant?.invoiceReminderDays ?? [30, 45];
  const maxLevel = reminderDays.length;

  if (invoice.reminderCount >= maxLevel) {
    return { ok: false, error: `Niveau maximum atteint (${maxLevel})` };
  }

  const level = Math.min(invoice.reminderCount + 1, maxLevel) as 1 | 2;

  const dueDate = invoice.dueDate ?? invoice.issueDate ?? new Date();
  const daysOverdue = Math.max(
    0,
    Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)),
  );

  const recipientEmail = getReminderRecipientEmail(invoice);
  if (!recipientEmail) {
    await logInvoiceEvent({
      tenantId,
      actorUserId: userId,
      targetInvoiceId: invoice.id,
      action: 'invoices.reminder_sent',
      diff: { level, triggered_by: 'cron', error: 'no_email_recipient' },
    });
    return { ok: false, error: 'Aucun email payeur configuré' };
  }

  const payerName =
    invoice.payerOrg?.legalName ??
    (invoice.participant?.person
      ? `${invoice.participant.person.firstName} ${invoice.participant.person.lastName}`
      : 'Cher client');

  const of = await loadOfConfig(tenantId);

  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  const invoiceUrl = `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/factures/${invoice.id}`;

  const { subject, html, text } = renderInvoiceReminderEmail(
    {
      level,
      invoiceNumber: invoice.number,
      issueDate: invoice.issueDate ?? new Date(),
      dueDate: new Date(dueDate),
      daysOverdue,
      amountTtc: remaining,
      payerName,
      invoiceUrl,
    },
    of,
  );

  const mailResult = await sendMail({
    to: recipientEmail,
    subject,
    html,
    text,
    context: {
      tenantId,
      category: 'invoice_reminder',
      // Facture groupée : sessionId au niveau facture, sinon celui du participant.
      sessionId: invoice.sessionId ?? invoice.participant?.sessionId ?? null,
    },
  });
  const dryRun = mailResult.dryRun === true;
  const suppressedBySettings = mailResult.suppressed === true;

  // Phase 22 Plan 22-11 (fermeture Pitfall 1) : le compteur de relance n'est
  // consommé QUE sur départ RÉEL d'email — ni dry-run env, ni suppression par
  // les réglages tenant, ni échec SMTP ne brûlent de niveau. Conséquence
  // assumée : tant que les réglages sont fermés, le cron re-tente chaque jour
  // (AuditLog quotidien par facture éligible) sans consommer de niveau.
  const counterConsumed = mailResult.ok && !dryRun;
  if (counterConsumed) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lastReminderAt: new Date(),
        reminderCount: { increment: 1 },
      },
    });
  }

  await logInvoiceEvent({
    tenantId,
    actorUserId: userId,
    targetInvoiceId: invoice.id,
    action: 'invoices.reminder_sent',
    diff: {
      level,
      channel: 'email',
      triggered_by: 'cron',
      dryRun,
      suppressedBySettings,
      counterConsumed,
      daysOverdue,
    },
  });

  return { ok: true, level, dryRun };
}
