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
  formationAlertsStartDate,
  reimbursementReminderClosed,
} from './formation-rules';
import { deliverFormationAlert, queueFormationAlert } from './formation-notifier';

type LoadedSession = Awaited<ReturnType<typeof loadSessions>>[number];
type LoadedParticipant = LoadedSession['participants'][number];

const participantSelect = {
  id: true,
  sponsorOrgId: true,
  participantType: true,
  financingMode: true,
  financingStatus: true,
  opcoApproved: true,
  opcoReimbursed: true,
  validationOpco: true,
  remboursementOpco: true,
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
      preEnrollments: {
        where: { convertedAt: null, status: { in: ['SUBMITTED', 'EXTRACTED', 'VALIDATED'] } },
        select: { firstName: true, lastName: true },
      },
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

export type FormationAlertMetrics = { sent: number; errors: number };

async function sendSessionDigest(
  session: LoadedSession,
  now: Date,
  lines: string[],
  metrics?: FormationAlertMetrics,
) {
  if (!lines.length) return;
  const id = await queueFormationAlert({
    tenantId: session.tenantId,
    sessionId: session.id,
    key: `digest:${session.id}:${parisDay(now)}`,
    subject: `Suivi formation : ${session.name} — ${parisDay(now)}`,
    lines,
    path: `/app/sessions/${session.id}`,
  });
  if (await deliverFormationAlert(id)) {
    if (metrics) metrics.sent++;
  }
}

/** Recalcule pièces et dépôt à chaque passage ; aucune relance en attente n'est envoyée à l'aveugle. */
export async function checkFormationDocuments(
  now = new Date(),
  onlySessionId?: string,
  metrics?: FormationAlertMetrics,
): Promise<number> {
  const sessions = await loadSessions({
    ...(onlySessionId ? { id: onlySessionId } : {}),
    status: { notIn: ['CANCELLED', 'COMPLETED'] },
    startDate: {
      gte: new Date(
        Math.max(Date.parse(formationAlertsStartDate()) - 86_400_000, now.getTime() - 86_400_000),
      ),
      lte: new Date(now.getTime() + 22 * 86_400_000),
    },
  });
  let examined = 0;
  for (const session of sessions) {
    try {
      const lines: string[] = [];
      if (!shouldAlertFormation(session.startDate, session.status, now)) continue;
      const companyGroups = new Map<string, LoadedParticipant[]>();
      for (const participant of session.participants) {
        if (isCompanyDossier({ ...participant, session })) {
          const group = companyGroups.get(participant.sponsorOrgId) ?? [];
          group.push(participant);
          companyGroups.set(participant.sponsorOrgId, group);
          continue;
        }
        const agefice = estEligibleAgefice({ ...participant, session });
        // Un dépôt confirmé clôt le rappel initial, même si les pièces ont été archivées ailleurs.
        if (
          agefice &&
          (participant.opcoSubmissions.some(isSuccessfulInitialSubmission) ||
            reimbursementReminderClosed(participant))
        )
          continue;
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
        const ageficeForms = agefice
          ? await prisma.document.findMany({
              where: {
                tenantId: session.tenantId,
                participantId: participant.id,
                type: 'AGEFICE',
              },
              select: { id: true, signedPdfUrl: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            })
          : [];
        const programme = await resolveProgrammeDocument({
          tenantId: session.tenantId,
          sessionId: session.id,
          productId: session.productId,
          participantId: participant.id,
          sponsorOrgId: participant.sponsorOrgId,
        });
        const missing = missingFormationDocuments({
          company: !agefice,
          cni: Boolean(participant.person.sensitiveData?.idDocumentUrl),
          rib: Boolean(participant.person.ribKey),
          cfp: Boolean(ageficeProfile(participant, session)?.cfpAttestationKey),
          convention: signedDocument(participant, 'CONVENTION', convention),
          ageficeForm: signedDocument(participant, 'AGEFICE', ageficeForms[0]),
          programme: Boolean(programme),
        });
        if (!missing.length && !agefice) continue;
        lines.push(
          `${participantName(participant)} : ${
            missing.length
              ? `pièces à compléter : ${missing.join(', ')}.`
              : 'dossier complet non déposé ; un envoi AGEFICE initial confirmé reste à effectuer.'
          }`,
        );
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
        const employer = representative.sponsorOrg.legalName;
        lines.push(
          `${employer} — ${members.length} apprenant(s) : ${
            missingByMember.length
              ? `pièces à compléter : ${missingByMember.join(' ; ')}.`
              : 'dossier complet ; la déclaration de dépôt par un déposant habilité reste à terminer pour tous les apprenants actifs.'
          }`,
        );
      }
      for (const pre of session.preEnrollments) {
        examined++;
        lines.push(
          `Préinscription ${[pre.firstName, pre.lastName].filter(Boolean).join(' ') || 'sans nom'} : dossier à valider et convertir dans les inscriptions.`,
        );
      }
      await sendSessionDigest(session, now, lines, metrics);
    } catch {
      if (metrics) metrics.errors++;
      console.error('[formation-alert] session ignorée après erreur de qualification', session.id);
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
  metrics?: FormationAlertMetrics,
): Promise<number> {
  const sessions = await loadSessions({
    ...(onlySessionId ? { id: onlySessionId } : {}),
    status: { notIn: ['CANCELLED', 'COMPLETED'] },
    endDate: { gte: new Date(Date.parse(formationAlertsStartDate()) - 86_400_000), lt: now },
  });
  let examined = 0;
  for (const session of sessions) {
    try {
      const lines: string[] = [];
      if (['CANCELLED', 'COMPLETED'].includes(session.status)) continue;
      if (!shouldAlertReimbursement(session.endDate, now)) continue;
      for (const participant of session.participants) {
        if (reimbursementReminderClosed(participant)) continue;
        if (isCompanyDossier({ ...participant, session })) continue;
        if (!estEligibleAgefice({ ...participant, session })) continue;
        const initial = participant.opcoSubmissions.find(isSuccessfulInitialSubmission);
        if (!initial) continue;
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
        lines.push(
          `Remboursement AGEFICE — ${participantName(participant)} : ${
            missing.length
              ? `pièces à préparer : ${missing.join(', ')}.`
              : 'pièces prêtes ; préparez l’envoi explicite de la demande de remboursement.'
          }`,
        );
        lines.push(
          initial.recipientEmail
            ? `Destinataire confirmé lors de l’envoi initial : ${initial.recipientEmail}.`
            : 'Envoi initial déclaré hors QualiOF : confirmer le destinataire avant l’envoi du solde.',
        );
      }
      await sendSessionDigest(session, now, lines, metrics);
    } catch {
      if (metrics) metrics.errors++;
      console.error(
        '[formation-alert] remboursement ignoré après erreur de qualification',
        session.id,
      );
    }
  }
  return examined;
}
