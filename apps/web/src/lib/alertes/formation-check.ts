import { prisma, type Prisma } from '@qualiof/db';
import { estEligibleAgefice } from '@/lib/agefice/eligibilite';
import { groupConventionAnyShapeWhere } from '@/lib/docs/convention-coverage';
import { isCompanyDossier, selectDossierConvention } from '@/lib/opco/company-dossier';
import { manualSignedKey } from '@/lib/opco/manual-signed-key';
import { resolveProgrammeDocument } from '@/lib/opco/programme';
import {
  companyDepositState,
  isSuccessfulInitialSubmission,
} from '@/lib/opco/session-funding-status';
import {
  missingFormationDocuments,
  missingReimbursementDocuments,
  parisDay,
  shouldAlertFormation,
  shouldAlertReimbursement,
} from './formation-rules';
import { deliverFormationAlert, queueFormationAlert } from './formation-notifier';

type LoadedSession = Awaited<ReturnType<typeof loadSessions>>[number];
type LoadedParticipant = LoadedSession['participants'][number];

const participantSelect = {
  id: true,
  sponsorOrgId: true,
  participantType: true,
  financingMode: true,
  enrollmentStatus: true,
  opcoDepositedAt: true,
  opcoDepositedByEmail: true,
  docStatus: true,
  person: {
    select: {
      firstName: true,
      lastName: true,
      ribKey: true,
      sensitiveData: { select: { idDocumentUrl: true } },
      legalLinks: {
        select: {
          organizationId: true,
          role: true,
          startDate: true,
          endDate: true,
          organization: {
            select: {
              id: true,
              ageficeProfile: { select: { cfpAttestationKey: true } },
            },
          },
        },
      },
    },
  },
  sponsorOrg: {
    select: {
      legalName: true,
      opcoCode: true,
      ageficeProfile: { select: { cfpAttestationKey: true } },
    },
  },
  opcoSubmissions: {
    select: {
      id: true,
      stage: true,
      status: true,
      deliveryState: true,
      sentAt: true,
      recipientEmail: true,
    },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.SessionParticipantSelect;

async function loadSessions(where: Prisma.TrainingSessionWhereInput) {
  return prisma.trainingSession.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      productId: true,
      name: true,
      status: true,
      regime: true,
      startDate: true,
      endDate: true,
      participants: {
        where: { enrollmentStatus: { not: 'CANCELLED' } },
        select: participantSelect,
      },
    },
  });
}

function participantName(participant: LoadedParticipant): string {
  return `${participant.person.firstName} ${participant.person.lastName}`.trim();
}

function signedDocument(
  participant: LoadedParticipant,
  type: 'CONVENTION' | 'AGEFICE' | 'EMARGEMENT' | 'ASSIDUITE',
  document?: { signedPdfUrl?: string | null; createdAt?: Date },
): boolean {
  return Boolean(
    document?.signedPdfUrl?.trim() ||
    manualSignedKey(participant.docStatus, type, document?.createdAt),
  );
}

function ageficeProfile(participant: LoadedParticipant, session: LoadedSession) {
  if (participant.sponsorOrg.ageficeProfile) return participant.sponsorOrg.ageficeProfile;
  const profiles = participant.person.legalLinks.filter(
    (link) =>
      ['EI_SELF', 'AGENT_COMMERCIAL'].includes(link.role) &&
      link.organization.ageficeProfile &&
      (!link.startDate || link.startDate <= session.endDate) &&
      (!link.endDate || link.endDate >= session.startDate),
  );
  return profiles.length === 1 ? profiles[0]!.organization.ageficeProfile : null;
}

async function previousDelivery(tenantId: string, key: string) {
  return prisma.emailMessage.findFirst({
    where: {
      tenantId,
      status: 'sent',
      relatedEntity: { contains: key },
      id: { startsWith: 'formation-alert:' },
    },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
}

async function emitCurrentAlert(input: {
  tenantId: string;
  sessionId: string;
  key: string;
  subject: string;
  lines: string[];
  path: string;
  previousSentAt: Date | null;
}) {
  const id = await queueFormationAlert({
    tenantId: input.tenantId,
    key: `${input.key}:${input.previousSentAt?.toISOString() ?? 'first'}`,
    sessionId: input.sessionId,
    subject: input.subject,
    lines: input.lines,
    path: input.path,
  });
  await deliverFormationAlert(id);
}

/** Recalcule pièces et dépôt à chaque passage ; aucune relance en attente n'est envoyée à l'aveugle. */
export async function checkFormationDocuments(
  now = new Date(),
  onlySessionId?: string,
): Promise<number> {
  const sessions = await loadSessions({
    ...(onlySessionId ? { id: onlySessionId } : {}),
    status: { notIn: ['CANCELLED', 'COMPLETED'] },
    startDate: {
      gte: new Date(now.getTime() - 86_400_000),
      lte: new Date(now.getTime() + 22 * 86_400_000),
    },
  });
  let examined = 0;
  for (const session of sessions) {
    if (!shouldAlertFormation(session.startDate, session.status, now)) continue;
    const companyGroups = new Map<string, LoadedParticipant[]>();
    for (const participant of session.participants) {
      if (isCompanyDossier({ ...participant, session })) {
        const group = companyGroups.get(participant.sponsorOrgId) ?? [];
        group.push(participant);
        companyGroups.set(participant.sponsorOrgId, group);
        continue;
      }
      if (!estEligibleAgefice({ ...participant, session })) continue;
      examined++;
      const conventions = await prisma.document.findMany({
        where: {
          tenantId: session.tenantId,
          type: 'CONVENTION',
          OR: [
            { participantId: participant.id },
            groupConventionAnyShapeWhere(session.tenantId, session.id, participant.sponsorOrgId),
          ],
        },
        select: {
          id: true,
          participantId: true,
          entityType: true,
          entityId: true,
          signedPdfUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      const convention = selectDossierConvention(
        conventions,
        participant.id,
        participant.sponsorOrgId,
        false,
      );
      const ageficeForms = await prisma.document.findMany({
        where: {
          tenantId: session.tenantId,
          participantId: participant.id,
          type: 'AGEFICE',
        },
        select: { id: true, signedPdfUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      const programme = await resolveProgrammeDocument({
        tenantId: session.tenantId,
        sessionId: session.id,
        productId: session.productId,
        participantId: participant.id,
        sponsorOrgId: participant.sponsorOrgId,
      });
      const missing = missingFormationDocuments({
        cni: Boolean(participant.person.sensitiveData?.idDocumentUrl),
        rib: Boolean(participant.person.ribKey),
        cfp: Boolean(ageficeProfile(participant, session)?.cfpAttestationKey),
        convention: signedDocument(participant, 'CONVENTION', convention),
        ageficeForm: signedDocument(participant, 'AGEFICE', ageficeForms[0]),
        programme: Boolean(programme),
      });
      const deposited = participant.opcoSubmissions.some(isSuccessfulInitialSubmission);
      if (!missing.length && deposited) continue;
      const kind = missing.length ? 'missing' : 'not-deposited';
      const key = `${kind}:${session.id}:${participant.id}:${parisDay(session.startDate)}`;
      const previous = await previousDelivery(session.tenantId, key);
      if (!shouldAlertFormation(session.startDate, session.status, now, previous?.sentAt)) continue;
      const name = participantName(participant);
      await emitCurrentAlert({
        tenantId: session.tenantId,
        sessionId: session.id,
        key,
        previousSentAt: previous?.sentAt ?? null,
        subject: missing.length
          ? `Dossier incomplet : ${name} — ${session.name}`
          : `Dossier complet non déposé : ${name} — ${session.name}`,
        lines: [
          `${name} — ${session.name}`,
          `Début de formation : ${session.startDate.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`,
          missing.length
            ? `Pièces à compléter : ${missing.join(', ')}.`
            : 'Le dossier est complet ; un envoi AGEFICE initial confirmé reste à effectuer.',
        ],
        path: `/app/sessions/${session.id}`,
      });
    }

    for (const [sponsorOrgId, members] of companyGroups) {
      examined++;
      const representative = members[0]!;
      const conventions = await prisma.document.findMany({
        where: {
          tenantId: session.tenantId,
          type: 'CONVENTION',
          OR: [
            ...members.map((member) => ({ participantId: member.id })),
            groupConventionAnyShapeWhere(session.tenantId, session.id, sponsorOrgId),
          ],
        },
        select: {
          id: true,
          participantId: true,
          entityType: true,
          entityId: true,
          signedPdfUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      const missingByMember: string[] = [];
      for (const member of members) {
        const convention = selectDossierConvention(conventions, member.id, sponsorOrgId, true);
        const programme = await resolveProgrammeDocument({
          tenantId: session.tenantId,
          sessionId: session.id,
          productId: session.productId,
          participantId: member.id,
          sponsorOrgId,
        });
        const missing = missingFormationDocuments({
          cni: true,
          rib: true,
          cfp: true,
          convention: signedDocument(member, 'CONVENTION', convention),
          company: true,
          programme: Boolean(programme),
        });
        if (missing.length)
          missingByMember.push(`${participantName(member)} : ${missing.join(', ')}`);
      }
      const deposited = companyDepositState(members) === 'success';
      if (!missingByMember.length && deposited) continue;
      const kind = missingByMember.length ? 'missing-company' : 'not-deposited-company';
      const key = `${kind}:${session.id}:${sponsorOrgId}:${parisDay(session.startDate)}`;
      const previous = await previousDelivery(session.tenantId, key);
      if (!shouldAlertFormation(session.startDate, session.status, now, previous?.sentAt)) continue;
      const employer = representative.sponsorOrg.legalName;
      await emitCurrentAlert({
        tenantId: session.tenantId,
        sessionId: session.id,
        key,
        previousSentAt: previous?.sentAt ?? null,
        subject: missingByMember.length
          ? `Dossier entreprise incomplet : ${employer} — ${session.name}`
          : `Dossier entreprise complet non déposé : ${employer} — ${session.name}`,
        lines: [
          `${employer} — ${members.length} apprenant${members.length > 1 ? 's' : ''} — ${session.name}`,
          missingByMember.length
            ? `Pièces à compléter : ${missingByMember.join(' ; ')}.`
            : 'Le dossier est complet ; la déclaration de dépôt par un déposant habilité reste à terminer pour tous les apprenants actifs.',
        ],
        path: `/app/sessions/${session.id}`,
      });
    }
  }
  return examined;
}

function paidInvoice(invoice: {
  status: string;
  paidAt: Date | null;
  amountPaid: unknown;
  amountTTC: unknown;
  creditNotes: { id: string }[];
  payments: { source: string }[];
}): boolean {
  return (
    invoice.status === 'PAID' &&
    Boolean(invoice.paidAt) &&
    Number(invoice.amountPaid) >= Number(invoice.amountTTC) &&
    invoice.creditNotes.length === 0 &&
    !invoice.payments.some((payment) => payment.source === 'OPCO_SYNC')
  );
}

/** Rappelle à l'admin de préparer le remboursement, vers le destinataire réellement utilisé à l'initial. */
export async function checkReimbursementReminders(
  now = new Date(),
  onlySessionId?: string,
): Promise<number> {
  const sessions = await loadSessions({
    ...(onlySessionId ? { id: onlySessionId } : {}),
    status: { not: 'CANCELLED' },
    endDate: { lt: now },
  });
  let examined = 0;
  for (const session of sessions) {
    if (!shouldAlertReimbursement(session.endDate, now)) continue;
    for (const participant of session.participants) {
      if (isCompanyDossier({ ...participant, session })) continue;
      if (!estEligibleAgefice({ ...participant, session })) continue;
      const initial = participant.opcoSubmissions.find(isSuccessfulInitialSubmission);
      if (!initial?.recipientEmail) continue;
      if (
        participant.opcoSubmissions.some(
          (submission) =>
            submission.stage === 'FIN_FORMATION' &&
            submission.deliveryState === 'READY' &&
            submission.sentAt !== null &&
            ['SENT', 'ACK_RECEIVED', 'APPROVED', 'REIMBURSED'].includes(submission.status),
        )
      )
        continue;
      examined++;
      const docs = await prisma.document.findMany({
        where: {
          tenantId: session.tenantId,
          participantId: participant.id,
          type: { in: ['EMARGEMENT', 'ASSIDUITE'] },
        },
        select: { type: true, signedPdfUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const attendance = docs.find((doc) => doc.type === 'EMARGEMENT');
      const assiduity = docs.find((doc) => doc.type === 'ASSIDUITE');
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: session.tenantId,
          status: { notIn: ['DRAFT', 'CANCELLED', 'CREDIT_NOTE'] },
          OR: [
            { participantId: participant.id },
            {
              sessionId: session.id,
              payerOrgId: participant.sponsorOrgId,
              participantIds: { array_contains: [participant.id] },
            },
          ],
        },
        select: {
          status: true,
          paidAt: true,
          amountPaid: true,
          amountTTC: true,
          payments: { select: { source: true } },
          creditNotes: { select: { id: true } },
        },
      });
      const missing = missingReimbursementDocuments({
        rib: Boolean(participant.person.ribKey),
        attendance: signedDocument(participant, 'EMARGEMENT', attendance),
        assiduity: signedDocument(participant, 'ASSIDUITE', assiduity),
        paidInvoice: invoices.length === 1 && paidInvoice(invoices[0]!),
      });
      const key = `reimbursement:${session.id}:${participant.id}:${parisDay(session.endDate)}`;
      const previous = await previousDelivery(session.tenantId, key);
      if (!shouldAlertReimbursement(session.endDate, now, previous?.sentAt)) continue;
      const name = participantName(participant);
      await emitCurrentAlert({
        tenantId: session.tenantId,
        sessionId: session.id,
        key,
        previousSentAt: previous?.sentAt ?? null,
        subject: `Remboursement AGEFICE à préparer : ${name} — ${session.name}`,
        lines: [
          `${name} — ${session.name}`,
          `Destinataire confirmé lors de l’envoi initial : ${initial.recipientEmail}.`,
          missing.length
            ? `Pièces à préparer : ${missing.join(', ')}.`
            : 'Le RIB et les pièces signées sont prêts ; éditez la facture acquittée puis préparez l’envoi explicite.',
        ],
        path: `/app/sessions/${session.id}`,
      });
    }
  }
  return examined;
}
