'use server';

import { createHash } from 'node:crypto';
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
  signature: string;
}) {
  const names = input.learnerNames.join(', ');
  const subject = input.individual
    ? `Documents de fin de formation — ${input.formationTitle}`
    : `Attestations de fin de formation — ${input.companyName ?? input.formationTitle}`;
  const detail = input.individual
    ? 'Vous trouverez en pièces jointes votre facture, votre certificat de réalisation et votre attestation de fin de formation.'
    : `Vous trouverez en pièces jointes une attestation individuelle pour chaque salarié concerné : ${names}.`;
  const text = `Bonjour ${input.recipientName},\n\n${detail}\n\nFormation : ${input.formationTitle} (${input.sessionCode}).\n\nCordialement,\n${input.signature}`;
  const html = `<p>Bonjour ${escapeEmailHtml(input.recipientName)},</p><p>${escapeEmailHtml(detail)}</p><p><strong>Formation :</strong> ${escapeEmailHtml(input.formationTitle)} (${escapeEmailHtml(input.sessionCode)}).</p><p>Cordialement,<br>${escapeEmailHtml(input.signature)}</p>`;
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
    return {
      ok: false,
      error: 'Cette session est annulée : aucun document de fin ne peut être envoyé.',
    };
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
      roleChezSponsor:
        legalLinkAtSession(participant.person.legalLinks, participant.sponsorOrgId, session)
          ?.role ?? null,
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
  const of = await loadOfConfig(tenantId);
  const signature = [of.contact?.prenom, of.contact?.nom].filter(Boolean).join(' ') || of.name;
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
    if (uncertain)
      return {
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
    if (exactSent)
      return {
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
      state: previous ? ('sent' as const) : ('ready' as const),
      sentAt: previous?.sentAt?.toISOString() ?? null,
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
      documents.filter(
        (doc) => doc.participantId === participantId && doc.type === 'CERTIFICAT_REALISATION',
      ),
      `Certificat de réalisation de ${learnerName}`,
      blockers,
    );
    const attestation = latestDocument(
      documents.filter(
        (doc) => doc.participantId === participantId && doc.type === 'ATTESTATION_FIN',
      ),
      `Attestation de fin de formation de ${learnerName}`,
      blockers,
    );
    const activeInvoicesConcerningLearner = invoices.filter((invoice) => {
      const grouped = Array.isArray(invoice.participantIds)
        ? (invoice.participantIds as string[])
        : [];
      return (
        ACTIVE_INVOICE_STATUSES.has(invoice.status) &&
        Boolean(invoice.pdfUrl) &&
        (invoice.participantId === participantId || grouped.includes(participantId))
      );
    });
    const unsafeGroupedInvoices = activeInvoicesConcerningLearner.filter((invoice) => {
      const grouped = Array.isArray(invoice.participantIds)
        ? (invoice.participantIds as string[])
        : [];
      const groupedShapeIsSafe =
        grouped.length === 0 || (grouped.length === 1 && grouped[0] === participantId);
      const sourceIdentifiesLearner =
        invoice.participantId === participantId ||
        (grouped.length === 1 && grouped[0] === participantId);
      const sessionIsSafe =
        invoice.sessionId === session.id ||
        (invoice.sessionId == null && invoice.participantId === participantId);
      return (
        !groupedShapeIsSafe ||
        !sourceIdentifiesLearner ||
        invoice.payerOrgId !== participant.sponsorOrgId ||
        !sessionIsSafe
      );
    });
    if (
      unsafeGroupedInvoices.some(
        (invoice) =>
          Array.isArray(invoice.participantIds) && (invoice.participantIds as string[]).length > 1,
      )
    ) {
      blockers.push(
        `Une facture groupée concernant plusieurs apprenants inclut ${learnerName}. Elle ne peut pas être jointe à un envoi individuel.`,
      );
    }
    if (
      unsafeGroupedInvoices.some(
        (invoice) =>
          !Array.isArray(invoice.participantIds) ||
          (invoice.participantIds as string[]).length <= 1,
      )
    ) {
      blockers.push(
        `Une facture concernant ${learnerName} ne correspond pas au payeur ou à la session de cette inscription.`,
      );
    }
    const matchingInvoices = activeInvoicesConcerningLearner.filter((invoice) => {
      const grouped = Array.isArray(invoice.participantIds)
        ? (invoice.participantIds as string[])
        : [];
      const groupedShapeIsSafe =
        grouped.length === 0 || (grouped.length === 1 && grouped[0] === participantId);
      const sourceIdentifiesLearner =
        invoice.participantId === participantId ||
        (grouped.length === 1 && grouped[0] === participantId);
      const sessionIsSafe =
        invoice.sessionId === session.id ||
        (invoice.sessionId == null && invoice.participantId === participantId);
      return (
        groupedShapeIsSafe &&
        sourceIdentifiesLearner &&
        invoice.payerOrgId === participant.sponsorOrgId &&
        sessionIsSafe
      );
    });
    if (matchingInvoices.length === 0)
      blockers.push(`Facture ordinaire émise manquante pour ${learnerName}.`);
    if (matchingInvoices.length > 1)
      blockers.push(
        `Plusieurs factures ordinaires actives concernent ${learnerName} : choisissez/corrigez la pièce comptable avant l’envoi.`,
      );
    const invoice = matchingInvoices.length === 1 ? matchingInvoices[0]! : null;

    const attachments: AfterTrainingAttachment[] = [];
    if (invoice?.pdfUrl) {
      // L'apprenant reçoit la facture ordinaire pour pouvoir la régler.
      // La facture acquittée reste réservée au dossier de solde AGEFICE.
      const sourceKey = invoice.pdfUrl;
      let sourceHash: string | null = null;
      try {
        sourceHash = createHash('sha256')
          .update(await downloadFile(DOCS_BUCKET, sourceKey))
          .digest('hex');
      } catch {
        blockers.push(
          'La facture ordinaire émise est illisible. Vérifiez son PDF depuis la fiche facture.',
        );
      }
      attachments.push({
        kind: 'invoice',
        id: invoice.id,
        label: `Facture ${invoice.number}`,
        filename: invoiceDownloadFilename(invoice),
        href: `/api/after-training/${sessionId}/attachments/invoice/${invoice.id}`,
        sourceKey,
        sourceHash,
      });
    }
    for (const { document, label } of [
      { document: certificate, label: `Certificat de réalisation — ${learnerName}` },
      { document: attestation, label: `Attestation de fin de formation — ${learnerName}` },
    ]) {
      if (!document) continue;
      const key = document.signedPdfUrl ?? document.pdfUrl;
      attachments.push({
        kind: 'document',
        id: document.id,
        label,
        filename: buildDownloadFilename({
          docType: document.type,
          firstName: participant.person.firstName,
          lastName: participant.person.lastName,
          sessionCode: session.code,
          ext: extFromStorageKey(key),
        }),
        href: `/api/after-training/${sessionId}/attachments/document/${document.id}`,
        sourceKey: key,
        sourceHash: document.hashSha256,
      });
    }
    const key = `individual:${participantId}`;
    const mail = emailContents({
      recipientName: learnerName,
      formationTitle: session.product.title,
      sessionCode: session.code,
      learnerNames: [learnerName],
      individual: true,
      signature,
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
      invoiceUrl: invoice ? `/app/factures/${invoice.id}` : undefined,
      from: `${of.name} <${of.emailFrom}>`,
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
    const members = group.participantIds.map(
      (id) => session.participants.find((item) => item.id === id)!,
    );
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
        documents.filter(
          (doc) => doc.participantId === member.id && doc.type === 'ATTESTATION_FIN',
        ),
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
    const learnerNames = members.map((member) =>
      `${member.person.firstName} ${member.person.lastName}`.trim(),
    );
    const mail = emailContents({
      recipientName,
      companyName: org.legalName,
      formationTitle: session.product.title,
      sessionCode: session.code,
      learnerNames,
      individual: false,
      signature,
    });
    const fingerprint = fingerprintAfterTrainingDelivery({
      sessionId,
      key,
      recipientEmail,
      subject: mail.subject,
      attachments,
      participantIds: group.participantIds,
    });
    deliveries.push({
      key,
      kind: 'company',
      from: `${of.name} <${of.emailFrom}>`,
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
  messageText?: string;
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
  if (!preview.sessionEnded)
    return { ok: false, error: 'L’envoi est disponible uniquement après la fin de la session.' };
  const delivery = preview.deliveries?.find((item) => item.key === input.deliveryKey);
  if (!delivery) return { ok: false, error: 'Envoi introuvable dans cette session.' };
  if (delivery.fingerprint !== input.fingerprint) {
    return {
      ok: false,
      error:
        'Le destinataire ou une pièce a changé depuis l’aperçu. Rechargez et contrôlez le nouvel aperçu.',
    };
  }
  if (delivery.blockers.length > 0 || !delivery.recipientEmail) {
    return { ok: false, error: delivery.blockers.join(' ') || 'Destinataire manquant.' };
  }
  if (delivery.state === 'sent')
    return { ok: false, error: 'Cet envoi a déjà été confirmé par le serveur SMTP.' };
  if (delivery.state === 'uncertain')
    return {
      ok: false,
      error:
        'Un envoi précédent est dans un état incertain. Vérifiez la boîte d’envoi avant toute reprise manuelle.',
    };
  if (input.messageText !== undefined) {
    if (!input.messageText.trim() || input.messageText.length > 10000)
      return { ok: false, error: 'Le message doit contenir entre 1 et 10 000 caractères.' };
    delivery.text = input.messageText.trim();
    delivery.html = delivery.text
      .split('\n\n')
      .map((p) => `<p>${escapeEmailHtml(p).replaceAll('\n', '<br>')}</p>`)
      .join('');
  }

  let attachments;
  try {
    attachments = await Promise.all(
      delivery.attachments.map(async (attachment) => {
        const content = await downloadFile(DOCS_BUCKET, attachment.sourceKey!);
        if (
          attachment.kind === 'invoice' &&
          createHash('sha256').update(content).digest('hex') !== attachment.sourceHash
        )
          throw new Error('La facture a changé. Contrôlez le nouvel aperçu.');
        return { filename: attachment.filename, content, contentType: 'application/pdf' };
      }),
    );
  } catch (error) {
    return {
      ok: false,
      error: `Une pièce n’est pas lisible dans le stockage : ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const relatedBase = afterTrainingRelatedEntity(input.sessionId, delivery.key);
  const relatedPrefix = `${relatedBase}:snapshot:`;
  const relatedEntity = afterTrainingRelatedEntity(
    input.sessionId,
    delivery.key,
    delivery.fingerprint,
  );
  const of = await loadOfConfig(user.tenantId);
  if (!of.emailFrom)
    return { ok: false, error: 'Renseignez l’expéditeur dans les paramètres de l’organisme.' };
  const from = `${of.name} <${of.emailFrom}>`;
  const claimed = await prisma.$transaction(async (tx) => {
    // PostgreSQL returns void for this lock: execute it without deserializing a result.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.tenantId}:${relatedBase}`}))`;
    const uncertain = await tx.emailMessage.findFirst({
      where: {
        tenantId: user.tenantId,
        relatedEntity: { startsWith: relatedPrefix },
        status: 'queued',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (uncertain) return null;
    const exactSent = await tx.emailMessage.findFirst({
      where: {
        tenantId: user.tenantId,
        relatedEntity: { startsWith: relatedPrefix },
        status: 'sent',
      },
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
          documentIds: delivery.attachments
            .filter((attachment) => attachment.kind === 'document')
            .map((attachment) => attachment.id),
        },
      },
    });
    return message;
  });
  if (!claimed)
    return { ok: false, error: 'Cet envoi est déjà parti ou en cours. Rechargez son état.' };

  // Re-read after the durable claim. Membership, destination and current files
  // must still be exactly the ones confirmed in the preview.
  const afterClaim = await resolveDeliveries(user.tenantId, input.sessionId);
  const claimedDelivery = afterClaim.deliveries?.find((item) => item.key === delivery.key);
  if (!claimedDelivery || claimedDelivery.fingerprint !== input.fingerprint) {
    await prisma.emailMessage.update({ where: { id: claimed.id }, data: { status: 'bounced' } });
    return {
      ok: false,
      error:
        'Le groupe, le destinataire ou une pièce a changé pendant la préparation. Aucun email n’a été envoyé ; rechargez l’aperçu.',
    };
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
      category: 'learner_documents',
      sessionId: input.sessionId,
      relatedEntity,
      // The claimed EmailMessage becomes the single durable trace after success.
      documentIds: [],
    },
  });
  if (result.dryRun || result.suppressed) {
    await prisma.emailMessage.update({ where: { id: claimed.id }, data: { status: 'bounced' } });
    return {
      ok: false,
      error: 'Envoi non effectué : SMTP est en mode test ou la catégorie d’email est désactivée.',
    };
  }
  if (!result.ok || !result.messageId) {
    // Keep queued: SMTP failures can be ambiguous after DATA; never retry automatically.
    return {
      ok: false,
      error:
        'Le résultat SMTP est incertain. Vérifiez la boîte d’envoi avant toute reprise manuelle.',
    };
  }

  const participantIds = delivery.participantIds ?? [];
  const documentIds = delivery.attachments
    .filter((attachment) => attachment.kind === 'document')
    .map((attachment) => attachment.id);
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
        where: {
          id: { in: participantIds },
          sessionId: input.sessionId,
          session: { tenantId: user.tenantId },
          enrollmentStatus: { not: 'CANCELLED' },
        },
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
    where: {
      tenantId: user.tenantId,
      relatedEntity: { startsWith: relatedPrefix },
      status: 'queued',
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!message) return { ok: false, error: 'Aucun envoi incertain à reprendre.' };
  if (Date.now() - message.createdAt.getTime() < UNCERTAIN_RECOVERY_DELAY_MS) {
    return {
      ok: false,
      error:
        'Attendez 10 minutes puis vérifiez la boîte d’envoi de l’organisme avant de libérer une nouvelle tentative.',
    };
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
  const participantIds = Array.isArray(diff.participantIds)
    ? diff.participantIds.filter((id): id is string => typeof id === 'string')
    : [];
  const documentIds = Array.isArray(diff.documentIds)
    ? diff.documentIds.filter((id): id is string => typeof id === 'string')
    : [];

  await prisma.$transaction(async (tx) => {
    const released = await tx.emailMessage.updateMany({
      where: { id: message.id, tenantId: user.tenantId, status: 'queued' },
      data:
        input.resolution === 'sent'
          ? { status: 'sent', sentAt: new Date(), documentIds }
          : { status: 'bounced' },
    });
    if (released.count === 0) return;
    if (input.resolution === 'sent' && participantIds.length > 0) {
      await tx.sessionParticipant.updateMany({
        where: {
          id: { in: participantIds },
          sessionId: input.sessionId,
          session: { tenantId: user.tenantId },
        },
        data: { closingDocsSent: true },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: input.sessionId,
        action:
          input.resolution === 'sent'
            ? 'after_training.uncertain_confirmed_sent'
            : 'after_training.uncertain_released',
        diff: {
          deliveryKey: input.deliveryKey,
          fingerprint,
          previousMessageId: message.id,
          checkedMailbox: true,
        },
      },
    });
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}
