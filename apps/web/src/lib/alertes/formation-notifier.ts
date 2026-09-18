import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';

export const FORMATION_ALERT_RECIPIENT = 'formation@start-academy.fr';
const PREFIX = 'formation-alert:';
type QueueDb = Pick<Prisma.TransactionClient, 'emailMessage'>;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/** The queue insert belongs in the business transaction: no lost event on crash. */
export async function queueFormationAlert(
  input: {
    tenantId: string;
    key: string;
    sessionId?: string | null;
    subject: string;
    lines: string[];
    path: string;
  },
  db: QueueDb = prisma,
): Promise<string> {
  const id = PREFIX + createHash('sha256').update(`${input.tenantId}:${input.key}`).digest('hex');
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const url = `${base.replace(/\/$/, '')}${input.path}`;
  const bodyHtml =
    input.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') +
    `<p><a href="${escapeHtml(url)}">Ouvrir dans Qualiof</a></p>`;
  await db.emailMessage.upsert({
    where: { id },
    update: {},
    create: {
      id,
      tenantId: input.tenantId,
      fromEmail: process.env.MAIL_FROM ?? FORMATION_ALERT_RECIPIENT,
      toEmails: [FORMATION_ALERT_RECIPIENT],
      subject: input.subject,
      bodyHtml,
      status: 'queued',
      relatedEntity: JSON.stringify({
        kind: input.key.split(':')[0],
        sessionId: input.sessionId ?? null,
        key: input.key,
      }),
    },
  });
  // Refresh unsent reminders after documents have been uploaded.
  await db.emailMessage.updateMany({
    where: { id, status: 'queued' },
    data: { bodyHtml, subject: input.subject },
  });
  return id;
}

/** Atomic claim; ambiguous SMTP outcome remains uncertain, never automatically resent. */
export async function deliverFormationAlert(id: string): Promise<void> {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base || !/^https?:\/\//.test(base)) return; // durable queue waits for URL configuration
  const claim = await prisma.emailMessage.updateMany({
    where: { id, status: 'queued' },
    data: { status: 'sending' },
  });
  if (!claim.count) return;
  const mail = await prisma.emailMessage.findUniqueOrThrow({ where: { id } });
  try {
    const metadata = JSON.parse(mail.relatedEntity ?? '{}') as { sessionId?: string };
    const result = await sendMail({
      to: FORMATION_ALERT_RECIPIENT,
      subject: mail.subject,
      html: mail.bodyHtml.replace(
        'href="/app/',
        `href="${escapeHtml(base.replace(/\/$/, ''))}/app/`,
      ),
      context: {
        tenantId: mail.tenantId,
        category: 'internal_notification',
        sessionId: metadata.sessionId,
      },
    });
    await prisma.emailMessage.update({
      where: { id },
      data:
        result.dryRun || result.suppressed
          ? { status: 'queued', sentAt: null }
          : result.ok
            ? { status: 'sent', sentAt: new Date() }
            : { status: 'uncertain' },
    });
    if (!result.ok)
      console.error('[formation-alert] résultat SMTP incertain, contrôle manuel requis', id);
  } catch {
    // Includes a crash after SMTP acceptance: do not risk a duplicate.
    await prisma.emailMessage.update({ where: { id }, data: { status: 'uncertain' } });
    console.error('[formation-alert] livraison interrompue, contrôle manuel requis', id);
  }
}

export async function flushFormationEventAlerts(): Promise<void> {
  const pending = await prisma.emailMessage.findMany({
    where: {
      id: { startsWith: PREFIX },
      status: 'queued',
      NOT: { relatedEntity: { contains: '"kind":"missing"' } },
    },
    select: { id: true, relatedEntity: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const row of pending) {
    if (JSON.parse(row.relatedEntity ?? '{}').kind !== 'missing')
      await deliverFormationAlert(row.id);
  }
}

export async function queueSessionCreatedAlert(
  db: QueueDb,
  session: {
    id: string;
    tenantId: string;
    name: string | null;
    code?: string;
    startDate: Date;
    endDate: Date;
  },
): Promise<void> {
  const name = session.name ?? session.code ?? session.id;
  await queueFormationAlert(
    {
      tenantId: session.tenantId,
      key: `session:${session.id}`,
      sessionId: session.id,
      subject: `Nouvelle session : ${name}`,
      lines: [
        name,
        `Du ${session.startDate.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${session.endDate.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`,
      ],
      path: `/app/sessions/${session.id}`,
    },
    db,
  );
}

export async function queueEnrollmentSubmittedAlert(
  db: QueueDb,
  pe: {
    id: string;
    tenantId: string;
    firstName: string | null;
    lastName: string | null;
    intendedSessionId: string | null;
  },
): Promise<void> {
  const name = `${pe.firstName ?? ''} ${pe.lastName ?? ''}`.trim();
  await queueFormationAlert(
    {
      tenantId: pe.tenantId,
      key: `enrollment:${pe.id}`,
      sessionId: pe.intendedSessionId,
      subject: `Inscription reçue : ${name}`,
      lines: [
        `Une inscription a été reçue pour ${name}.`,
        'Le dossier attend sa validation dans Qualiof.',
      ],
      path: `/app/inscriptions/${pe.id}`,
    },
    db,
  );
}
