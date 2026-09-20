'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError, UnauthorizedError } from '@/lib/rbac';
import { legalLinkAtSession } from '@/lib/persons/legal-link-period';
import { partitionByPayerRule } from '@/lib/sessions/payer-rule';
import {
  resoudreEmailRepresentant,
  resoudreRepresentantEntreprise,
} from '@/lib/signature/representant';
import { invoiceDownloadFilename } from '@/lib/docs/invoice-filename';
import { buildDownloadFilename, extFromStorageKey } from '@/lib/docs/download-filename';
import { DOCS_BUCKET, downloadFile } from '@/lib/storage';
import { loadOfConfig } from '@/lib/of-config';
import { sendMail } from '@/lib/mailer';
import {
  afterTrainingRelatedEntity,
  escapeEmailHtml,
  fingerprintAfterTrainingDelivery,
  isAfterTrainingEndDate,
  stripAfterTrainingStorageKeys,
  type AfterTrainingAttachment,
  type AfterTrainingDeliveryPreview,
} from '@/lib/post-formation/delivery';

type PreviewResult = {
  ok: boolean;
  error?: string;
  sessionCode?: string;
  sessionEnded?: boolean;
  deliveries?: AfterTrainingDeliveryPreview[];
};

const ACTIVE_INVOICE_STATUSES = new Set(['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE']);
const DELIVERY_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE'] as const;
const UNCERTAIN_RECOVERY_DELAY_MS = 10 * 60 * 1000;

function authError(error: unknown): PreviewResult | null {
  return error instanceof UnauthorizedError || error instanceof ForbiddenError
    ? { ok: false, error: error.message }
    : null;
}

function latestDocument<T extends { id: string; pdfUrl: string; signedPdfUrl?: string | null }>(
  docs: T[],
  label: string,
  blockers: string[],
): T | null {
  if (docs.length === 0) {
    blockers.push(`${label} manquant.`);
    return null;
  }
  const current = docs[0]!;
  if (!(current.signedPdfUrl ?? current.pdfUrl)?.trim()) {
    blockers.push(`${label} sans fichier consultable.`);
    return null;
  }
  return current;
}

function emailContents(input: {
  recipientName: string;
  formationTitle: string;
  sessionCode: string;
  learnerNames: string[];
  companyName?: string;
  individual: boolean;
}) {
  const names = input.learnerNames.join(', ');
  const subject = input.individual
    ? `Documents de fin de formation — ${input.formationTitle}`
    : `Attestations de fin de formation — ${input.companyName ?? input.formationTitle}`;
  const detail = input.individual
    ? 'Vous trouverez en pièces jointes votre facture ainsi que votre certificat de réalisation.'
    : `Vous trouverez en pièces jointes une attestation individuelle pour chaque salarié concerné : ${names}.`;
  const text = `Bonjour ${input.recipientName},\n\n${detail}\n\nFormation : ${input.formationTitle} (${input.sessionCode}).\n\nCordialement,\nL’équipe formation`;
  const html = `<p>Bonjour ${escapeEmailHtml(input.recipientName)},</p><p>${escapeEmailHtml(detail)}</p><p><strong>Formation :</strong> ${escapeEmailHtml(input.formationTitle)} (${escapeEmailHtml(input.sessionCode)}).</p><p>Cordialement,<br>L’équipe formation</p>`;
  return { subject, text, html };
}

async function resolveDeliveries(
  tenantId: string,
  sessionId: string,
  now = new Date(),
): Promise<PreviewResult & { deliveries?: AfterTrainingDeliveryPreview[] }> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId },
    select: {
      id: true,
      code: true,
      status: true,
      startDate: true,
      endDate: true,
      regime: true,
      product: { select: { title: true } },
      participants: {
        where: { enrollmentStatus: { not: 'CANCELLED' } },
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        select: {
          id: true,
          sponsorOrgId: true,
          person: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              legalLinks: {
                select: { organizationId: true, role: true, startDate: true, endDate: true },
              },
            },
          },
          sponsorOrg: {
            select: {
              id: true,
              legalName: true,
              brandName: true,
              legalForm: true,
              representative: true,
              contacts: {
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                select: { firstName: true, lastName: true, email: true, isPrimary: true },
              },
            },
          },
        },
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };
  if (session.status === 'CANCELLED') {
    return { ok: false, error: 'Cette session est annulée : aucun document de fin ne peut être envoyé.' };
  }

  // The whole end date belongs to the training. Paris calendar days avoid
  // opening delivery during the final day because the DB value is at midnight.
  // The action re-runs this check at send time.
  if (!isAfterTrainingEndDate(session.endDate, now)) {
    return {
      ok: true,
      sessionCode: session.code,
      sessionEnded: false,
      deliveries: [],
    };
  }

  let participantsWithRole;
  try {
    participantsWithRole = session.participants.map((participant) => ({
      participant,
      roleChezSponsor: legalLinkAtSession(
        participant.person.legalLinks,
        participant.sponsorOrgId,
        session,
      )?.role ?? null,
    }));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const partition = partitionByPayerRule(
    participantsWithRole.map(({ participant, roleChezSponsor }) => ({
      regime: session.regime,
      id: participant.id,
      sponsorOrgId: participant.sponsorOrgId,
      sponsorLegalForm: participant.sponsorOrg.legalForm,
      sponsorName: participant.sponsorOrg.legalName,
      roleChezSponsor,
    })),
  );
  const participantIds = session.participants.map((participant) => participant.id);
  const [documents, invoices, messageStates] = await Promise.all([
    prisma.document.findMany({
      where: {
        tenantId,
        sessionId,
        participantId: { in: participantIds },
        type: { in: ['CERTIFICAT_REALISATION', 'ATTESTATION_FIN'] },
      },
      select: {
        id: true,
        participantId: true,
        type: true,
        pdfUrl: true,
        signedPdfUrl: true,
        hashSha256: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.invoice.findMany({
      where: {
        tenantId,
        OR: [{ sessionId }, { participantId: { in: participantIds } }],
      },
      include: {
        payerOrg: { select: { brandName: true, legalName: true } },
        participant: { select: { person: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.emailMessage.findMany({
      where: { tenantId, relatedEntity: { startsWith: `after-training:${sessionId}:` } },
      select: { relatedEntity: true, status: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const stateFor = (key: string, fingerprint: string) => {
    const base = afterTrainingRelatedEntity(sessionId, key);
    const snapshotPrefix = `${base}:snapshot:`;
    const exact = afterTrainingRelatedEntity(sessionId, key, fingerprint);
    // An uncertain attempt blocks the whole logical delivery, even if members
    // or files have changed since: the old SMTP result must be reconciled first.
    const uncertain = messageStates.find(
      (message) => message.relatedEntity?.startsWith(snapshotPrefix) && message.status === 'queued',
    );
    if (uncertain) return {
      state: 'uncertain' as const,
      sentAt: null,
      uncertainSince: uncertain.createdAt.toISOString(),
      canRecover: false,
      changedSinceLastSend: false,
      previousSentAt: null,
    };
    const exactSent = messageStates.find(
      (message) => message.relatedEntity === exact && message.status === 'sent',
    );
    if (exactSent) return {
      state: 'sent' as const,
      sentAt: exactSent.sentAt?.toISOString() ?? null,
      uncertainSince: null,
      canRecover: false,
      changedSinceLastSend: false,
      previousSentAt: null,
    };
    const previous = messageStates.find(
      (message) => message.relatedEntity?.startsWith(snapshotPrefix) && message.status === 'sent',
    );
    return {
      state: 'ready' as const,
      sentAt: null,
      uncertainSince: null,
      canRecover: false,
      changedSinceLastSend: Boolean(previous),
      previousSentAt: previous?.sentAt?.toISOString() ?? null,
    };
  };

  const deliveries: AfterTrainingDeliveryPreview[] = [];

  for (const participantId of partition.individuels) {
    const participant = session.participants.find((item) => item.id === participantId)!;
    const learnerName = `${participant.person.firstName} ${participant.person.lastName}`.trim();
    const blockers: string[] = [];
    const recipientEmail = participant.person.email?.trim() || null;
    if (!recipientEmail) blockers.push(`Email manquant sur la fiche apprenant de ${learnerName}.`);

    const certificate = latestDocument(
      documents.filter((doc) => doc.participantId === participantId && doc.type === 'CERTIFICAT_REALISATION'),
      `Certificat de réalisation de ${learnerName}`,
      blockers,
    );
    const activeInvoicesConcerningLearner = invoices.filter((invoice) => {
      const grouped = Array.isArray(invoice.participantIds) ? (invoice.participantIds as string[]) : [];
      return (
        ACTIVE_INVOICE_STATUSES.has(invoice.status) &&
        Boolean(invoice.pdfUrl) &&
        (invoice.participantId === participantId || grouped.includes(participantId))
      );
    });
    const unsafeGroupedInvoices = activeInvoicesConcerningLearner.filter((invoice) => {
      const grouped = Array.isArray(invoice.participantIds) ? (invoice.participantIds as string[]) : [];
      return invoice.participantId !== participantId && (
        grouped.length !== 1 ||
        grouped[0] !== participantId ||
        invoice.payerOrgId !== participant.sponsorOrgId ||
        invoice.sessionId !== session.id
      );
    });
    if (unsafeGroupedInvoices.some((invoice) => Array.isArray(invoice.participantIds) && (invoice.participantIds as string[]).length > 1)) {
      blockers.push(`Une facture groupée concernant plusieurs apprenants inclut ${learnerName}. Elle ne peut pas être jointe à un envoi individuel.`);
    }
    if (unsafeGroupedInvoices.some((invoice) => !Array.isArray(invoice.participantIds) || (invoice.participantIds as string[]).length <= 1)) {
      blockers.push(`Une facture concernant ${learnerName} ne correspond pas au payeur ou à la session de cette inscription.`);
    }
    const matchingInvoices = activeInvoicesConcerningLearner.filter((invoice) => {
      if (invoice.participantId === participantId) return true;
      const grouped = Array.isArray(invoice.participantIds) ? (invoice.participantIds as string[]) : [];
      return grouped.length === 1 && grouped[0] === participantId &&
        invoice.payerOrgId === participant.sponsorOrgId && invoice.sessionId === session.id;
    });
    if (matchingInvoices.length === 0) blockers.push(`Facture ordinaire émise manquante pour ${learnerName}.`);
    if (matchingInvoices.length > 1) blockers.push(`Plusieurs factures ordinaires actives concernent ${learnerName} : choisissez/corrigez la pièce comptable avant l’envoi.`);
    const invoice = matchingInvoices.length === 1 ? matchingInvoices[0]! : null;

    const attachments: AfterTrainingAttachment[] = [];
    if (invoice?.pdfUrl) {
      attachments.push({
        kind: 'invoice',
        id: invoice.id,
        label: `Facture ${invoice.number} (édition ordinaire)`,
        filename: invoiceDownloadFilename(invoice),
        href: `/api/after-training/${sessionId}/attachments/invoice/${invoice.id}`,
        sourceKey: invoice.pdfUrl,
        sourceHash: invoice.hashSha256,
      });
    }
    if (certificate) {
      const key = certificate.signedPdfUrl ?? certificate.pdfUrl;
      attachments.push({
        kind: 'document',
        id: certificate.id,
        label: `Certificat de réalisation — ${learnerName}`,
        filename: buildDownloadFilename({
          docType: certificate.type,
          firstName: participant.person.firstName,
          lastName: participant.person.lastName,
          sessionCode: session.code,
          ext: extFromStorageKey(key),
        }),
        href: `/api/after-training/${sessionId}/attachments/document/${certificate.id}`,
        sourceKey: key,
        sourceHash: certificate.hashSha256,
      });
    }
    const key = `individual:${participantId}`;
    const mail = emailContents({
      recipientName: learnerName,
      formationTitle: session.product.title,
      sessionCode: session.code,
      learnerNames: [learnerName],
      individual: true,
    });
    const fingerprint = fingerprintAfterTrainingDelivery({
      sessionId,
      key,
      recipientEmail,
      subject: mail.subject,
      attachments,
      participantIds: [participantId],
    });
    deliveries.push({
      key,
      kind: 'individual',
      title: learnerName,
      recipientName: learnerName,
      recipientEmail,
      ...mail,
      attachments,
      blockers,
      fingerprint,
      participantIds: [participantId],
      ...stateFor(key, fingerprint),
    });
  }

  for (const group of partition.groups) {
    const members = group.participantIds.map((id) => session.participants.find((item) => item.id === id)!);
    const org = members[0]!.sponsorOrg;
    const blockers: string[] = [];
    const rep = resoudreRepresentantEntreprise(org);
    let recipientName = org.legalName;
    let recipientEmail: string | null = null;
    if (!rep.ok) {
      blockers.push(rep.error);
    } else {
      recipientName = rep.nom;
      const email = resoudreEmailRepresentant({ nom: rep.nom, source: rep.source, org });
      if (!email.ok) blockers.push(email.error);
      else recipientEmail = email.email;
    }
    const attachments: AfterTrainingAttachment[] = [];
    for (const member of members) {
      const learnerName = `${member.person.firstName} ${member.person.lastName}`.trim();
      const attestation = latestDocument(
        documents.filter((doc) => doc.participantId === member.id && doc.type === 'ATTESTATION_FIN'),
        `Attestation de fin de formation de ${learnerName}`,
        blockers,
      );
      if (!attestation) continue;
      const sourceKey = attestation.signedPdfUrl ?? attestation.pdfUrl;
      attachments.push({
        kind: 'document',
        id: attestation.id,
        label: `Attestation de fin — ${learnerName}`,
        filename: buildDownloadFilename({
          docType: attestation.type,
          firstName: member.person.firstName,
          lastName: member.person.lastName,
          sessionCode: session.code,
          ext: extFromStorageKey(sourceKey),
        }),
        href: `/api/after-training/${sessionId}/attachments/document/${attestation.id}`,
        sourceKey,
        sourceHash: attestation.hashSha256,
      });
    }
    const key = `company:${group.sponsorOrgId}`;
    const learnerNames = members.map((member) => `${member.person.firstName} ${member.person.lastName}`.trim());
    const mail = emailContents({
      recipientName,
      companyName: org.legalName,
      formationTitle: session.product.title,
      sessionCode: session.code,
      learnerNames,
      individual: false,
    });
    const fingerprint = fingerprintAfterTrainingDelivery({ sessionId, key, recipientEmail, subject: mail.subject, attachments, participantIds: group.participantIds });
    deliveries.push({
      key,
      kind: 'company',
      title: org.legalName,
      recipientName,
      recipientEmail,
      ...mail,
      attachments,
      blockers,
      fingerprint,
      participantIds: [...group.participantIds],
      ...stateFor(key, fingerprint),
    });
  }

  return { ok: true, sessionCode: session.code, sessionEnded: true, deliveries };
}

export async function getAfterTrainingPreview(sessionId: string): Promise<PreviewResult> {
  let user;
  try {
    user = await requireRole([...DELIVERY_ROLES]);
  } catch (error) {
    return authError(error) ?? Promise.reject(error);
  }
  const result = await resolveDeliveries(user.tenantId, sessionId);
  return result.deliveries
    ? {
        ...result,
        deliveries: result.deliveries.map((delivery) => ({
          ...stripAfterTrainingStorageKeys(delivery),
          canRecover: ['ADMIN', 'MANAGER'].includes(user.role) && delivery.state === 'uncertain',
        })),
      }
    : result;
}

export async function sendAfterTrainingDelivery(input: {
  sessionId: string;
  deliveryKey: string;
  fingerprint: string;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole([...DELIVERY_ROLES]);
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    throw error;
  }
  const preview = await resolveDeliveries(user.tenantId, input.sessionId);
  if (!preview.ok) return { ok: false, error: preview.error };
  if (!preview.sessionEnded) return { ok: false, error: 'L’envoi est disponible uniquement après la fin de la session.' };
  const delivery = preview.deliveries?.find((item) => item.key === input.deliveryKey);
  if (!delivery) return { ok: false, error: 'Envoi introuvable dans cette session.' };
  if (delivery.fingerprint !== input.fingerprint) {
    return { ok: false, error: 'Le destinataire ou une pièce a changé depuis l’aperçu. Rechargez et contrôlez le nouvel aperçu.' };
  }
  if (delivery.blockers.length > 0 || !delivery.recipientEmail) {
    return { ok: false, error: delivery.blockers.join(' ') || 'Destinataire manquant.' };
  }
  if (delivery.state === 'sent') return { ok: false, error: 'Cet envoi a déjà été confirmé par le serveur SMTP.' };
  if (delivery.state === 'uncertain') return { ok: false, error: 'Un envoi précédent est dans un état incertain. Vérifiez la boîte d’envoi avant toute reprise manuelle.' };

  let attachments;
  try {
    attachments = await Promise.all(
      delivery.attachments.map(async (attachment) => ({
        filename: attachment.filename,
        content: await downloadFile(DOCS_BUCKET, attachment.sourceKey!),
        contentType: 'application/pdf',
      })),
    );
  } catch (error) {
    return { ok: false, error: `Une pièce n’est pas lisible dans le stockage : ${error instanceof Error ? error.message : String(error)}` };
  }

  const relatedBase = afterTrainingRelatedEntity(input.sessionId, delivery.key);
  const relatedPrefix = `${relatedBase}:snapshot:`;
  const relatedEntity = afterTrainingRelatedEntity(input.sessionId, delivery.key, delivery.fingerprint);
  const of = await loadOfConfig(user.tenantId);
  const from = `${of.name} <formation@start-academy.fr>`;
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.tenantId}:${relatedBase}`}))`;
    const uncertain = await tx.emailMessage.findFirst({
      where: { tenantId: user.tenantId, relatedEntity: { startsWith: relatedPrefix }, status: 'queued' },
      orderBy: { createdAt: 'desc' },
    });
    if (uncertain) return null;
    const exactSent = await tx.emailMessage.findFirst({
      where: { tenantId: user.tenantId, relatedEntity, status: 'sent' },
      orderBy: { createdAt: 'desc' },
    });
    if (exactSent) return null;
    const message = await tx.emailMessage.create({
      data: {
        tenantId: user.tenantId,
        fromEmail: from,
        toEmails: [delivery.recipientEmail!],
        subject: delivery.subject,
        bodyHtml: delivery.html,
        status: 'queued',
        relatedEntity,
        // documentIds stays NULL until confirmed SMTP success: queued is never
        // evidence that a document left the organization.
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: input.sessionId,
        action: 'after_training.delivery_claimed',
        diff: {
          deliveryKey: delivery.key,
          fingerprint: delivery.fingerprint,
          participantIds: delivery.participantIds ?? [],
          attachmentIds: delivery.attachments.map((attachment) => attachment.id),
          documentIds: delivery.attachments.filter((attachment) => attachment.kind === 'document').map((attachment) => attachment.id),
        },
      },
    });
    return message;
  });
  if (!claimed) return { ok: false, error: 'Cet envoi est déjà parti ou en cours. Rechargez son état.' };

  // Re-read after the durable claim. Membership, destination and current files
  // must still be exactly the ones confirmed in the preview.
  const afterClaim = await resolveDeliveries(user.tenantId, input.sessionId);
  const claimedDelivery = afterClaim.deliveries?.find((item) => item.key === delivery.key);
  if (!claimedDelivery || claimedDelivery.fingerprint !== input.fingerprint) {
    await prisma.emailMessage.update({ where: { id: claimed.id }, data: { status: 'bounced' } });
    return { ok: false, error: 'Le groupe, le destinataire ou une pièce a changé pendant la préparation. Aucun email n’a été envoyé ; rechargez l’aperçu.' };
  }

  const result = await sendMail({
    from,
    to: delivery.recipientEmail,
    subject: delivery.subject,
    html: delivery.html,
    text: delivery.text,
    attachments,
    context: {
      tenantId: user.tenantId,
      category: 'opco_submission',
      sessionId: input.sessionId,
      relatedEntity,
      // The claimed EmailMessage becomes the single durable trace after success.
      documentIds: [],
    },
  });
  if (result.dryRun || result.suppressed) {
    await prisma.emailMessage.update({ where: { id: claimed.id }, data: { status: 'bounced' } });
    return { ok: false, error: 'Envoi non effectué : SMTP est en mode test ou la catégorie d’email est désactivée.' };
  }
  if (!result.ok || !result.messageId) {
    // Keep queued: SMTP failures can be ambiguous after DATA; never retry automatically.
    return { ok: false, error: 'Le résultat SMTP est incertain. Vérifiez la boîte d’envoi avant toute reprise manuelle.' };
  }

  const participantIds = delivery.participantIds ?? [];
  const documentIds = delivery.attachments.filter((attachment) => attachment.kind === 'document').map((attachment) => attachment.id);
  await prisma.$transaction(async (tx) => {
    await tx.emailMessage.update({
      where: { id: claimed.id },
      data: { status: 'sent', sentAt: new Date(), documentIds },
    });
    if (delivery.kind === 'individual') {
      await tx.sessionParticipant.updateMany({
        where: { id: { in: participantIds }, session: { tenantId: user.tenantId } },
        data: { closingDocsSent: true },
      });
    } else {
      await tx.sessionParticipant.updateMany({
        where: { id: { in: participantIds }, sessionId: input.sessionId, session: { tenantId: user.tenantId }, enrollmentStatus: { not: 'CANCELLED' } },
        data: { closingDocsSent: true },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: input.sessionId,
        action: 'after_training.delivery_sent',
        diff: {
          deliveryKey: delivery.key,
          recipient: delivery.recipientEmail,
          attachmentIds: delivery.attachments.map((attachment) => attachment.id),
          messageId: result.messageId,
          fingerprint: delivery.fingerprint,
        },
      },
    });
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}

export async function recoverUncertainAfterTrainingDelivery(input: {
  sessionId: string;
  deliveryKey: string;
  resolution: 'retry' | 'sent';
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    throw error;
  }
  const relatedEntity = afterTrainingRelatedEntity(input.sessionId, input.deliveryKey);
  const relatedPrefix = `${relatedEntity}:snapshot:`;
  const message = await prisma.emailMessage.findFirst({
    where: { tenantId: user.tenantId, relatedEntity: { startsWith: relatedPrefix }, status: 'queued' },
    orderBy: { createdAt: 'desc' },
  });
  if (!message) return { ok: false, error: 'Aucun envoi incertain à reprendre.' };
  if (Date.now() - message.createdAt.getTime() < UNCERTAIN_RECOVERY_DELAY_MS) {
    return { ok: false, error: 'Attendez 10 minutes puis vérifiez la boîte formation@ avant de libérer une nouvelle tentative.' };
  }
  const fingerprint = message.relatedEntity?.split(':snapshot:')[1] ?? null;
  const claimLogs = await prisma.auditLog.findMany({
    where: {
      tenantId: user.tenantId,
      entity: 'TrainingSession',
      entityId: input.sessionId,
      action: 'after_training.delivery_claimed',
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const claim = claimLogs.find((log) => {
    const diff = log.diff as Record<string, unknown> | null;
    return diff?.deliveryKey === input.deliveryKey && diff?.fingerprint === fingerprint;
  });
  const diff = (claim?.diff ?? {}) as Record<string, unknown>;
  const participantIds = Array.isArray(diff.participantIds) ? diff.participantIds.filter((id): id is string => typeof id === 'string') : [];
  const documentIds = Array.isArray(diff.documentIds) ? diff.documentIds.filter((id): id is string => typeof id === 'string') : [];

  await prisma.$transaction(async (tx) => {
    const released = await tx.emailMessage.updateMany({
      where: { id: message.id, tenantId: user.tenantId, status: 'queued' },
      data: input.resolution === 'sent'
        ? { status: 'sent', sentAt: new Date(), documentIds }
        : { status: 'bounced' },
    });
    if (released.count === 0) return;
    if (input.resolution === 'sent' && participantIds.length > 0) {
      await tx.sessionParticipant.updateMany({
        where: { id: { in: participantIds }, sessionId: input.sessionId, session: { tenantId: user.tenantId } },
        data: { closingDocsSent: true },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: input.sessionId,
        action: input.resolution === 'sent'
          ? 'after_training.uncertain_confirmed_sent'
          : 'after_training.uncertain_released',
        diff: { deliveryKey: input.deliveryKey, fingerprint, previousMessageId: message.id, checkedMailbox: true },
      },
    });
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}
