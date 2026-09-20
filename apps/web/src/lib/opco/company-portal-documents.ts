import type { User } from 'lucia';
import { prisma } from '@qualiof/db';
import { buildOpcoSubmission } from './build-submission';
import { isCompanyDossier } from './company-dossier';

export interface CompanyPortalPiece {
  participantId: string;
  kind: 'CONVENTION' | 'PROGRAMME';
  label: string;
  filename: string;
}

export interface CompanyPortalGroup {
  sponsorOrgId: string;
  pieces: CompanyPortalPiece[];
  missingLearners: string[];
  programmeMissing: boolean;
}

export async function loadCompanyPortalGroups(
  sessionId: string,
  user: User,
): Promise<Map<string, CompanyPortalGroup>> {
  const participants = await prisma.sessionParticipant.findMany({
    where: {
      sessionId,
      enrollmentStatus: { not: 'CANCELLED' },
      session: { tenantId: user.tenantId },
    },
    select: {
      id: true,
      sponsorOrgId: true,
      participantType: true,
      financingMode: true,
      person: {
        select: {
          firstName: true,
          lastName: true,
          legalLinks: {
            select: { role: true, organizationId: true, startDate: true, endDate: true },
          },
        },
      },
      sponsorOrg: { select: { opcoCode: true } },
      session: { select: { startDate: true, endDate: true, regime: true } },
    },
    orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
  });
  const groups = new Map<string, CompanyPortalGroup>();
  const seenKeys = new Map<string, Set<string>>();
  for (const participant of participants.filter(isCompanyDossier)) {
    const group = groups.get(participant.sponsorOrgId) ?? {
      sponsorOrgId: participant.sponsorOrgId,
      pieces: [],
      missingLearners: [],
      programmeMissing: false,
    };
    const seen = seenKeys.get(participant.sponsorOrgId) ?? new Set<string>();
    const built = await buildOpcoSubmission(participant.id, user, 'PRISE_EN_CHARGE');
    const learner = `${participant.person.firstName} ${participant.person.lastName.toUpperCase()}`;
    if (!built.ok || !built.company || built.participant.sessionId !== sessionId) {
      group.missingLearners.push(learner);
      group.programmeMissing = true;
    } else {
      const convention = built.attachments.find(
        (piece) =>
          piece.kind === 'CONVENTION' && piece.included && piece.key?.trim() && piece.signe,
      );
      if (!convention) group.missingLearners.push(learner);
      else if (!seen.has(`CONVENTION:${convention.key}`)) {
        seen.add(`CONVENTION:${convention.key}`);
        group.pieces.push({
          participantId: participant.id,
          kind: 'CONVENTION',
          label: `Convention signée${participants.length > 1 ? ` — ${learner}` : ''}`,
          filename: convention.filename,
        });
      }
      const programme = built.attachments.find(
        (piece) => piece.kind === 'PROGRAMME' && piece.included && piece.key?.trim(),
      );
      if (!programme) group.programmeMissing = true;
      else if (!seen.has(`PROGRAMME:${programme.key}`)) {
        seen.add(`PROGRAMME:${programme.key}`);
        group.pieces.push({
          participantId: participant.id,
          kind: 'PROGRAMME',
          label: 'Programme de formation',
          filename: programme.filename,
        });
      }
    }
    groups.set(participant.sponsorOrgId, group);
    seenKeys.set(participant.sponsorOrgId, seen);
  }
  for (const group of groups.values()) {
    const memberCount = participants.filter(
      (participant) =>
        participant.sponsorOrgId === group.sponsorOrgId && isCompanyDossier(participant),
    ).length;
    const conventions = group.pieces.filter((piece) => piece.kind === 'CONVENTION');
    if (memberCount > 1 && conventions.length === 1 && group.missingLearners.length === 0) {
      conventions[0]!.label = `Convention signée — groupe de ${memberCount} salariés`;
    }
  }
  return groups;
}

export async function resolveCompanyPortalPiece(input: {
  sessionId: string;
  sponsorOrgId: string;
  participantId: string;
  kind: string;
  user: User;
}) {
  if (input.kind !== 'CONVENTION' && input.kind !== 'PROGRAMME') return null;
  const built = await buildOpcoSubmission(input.participantId, input.user, 'PRISE_EN_CHARGE');
  if (
    !built.ok ||
    !built.company ||
    built.participant.sessionId !== input.sessionId ||
    built.participant.sponsorOrgId !== input.sponsorOrgId ||
    built.participant.enrollmentStatus === 'CANCELLED'
  )
    return null;
  const piece = built.attachments.find(
    (attachment) =>
      attachment.kind === input.kind &&
      attachment.included &&
      attachment.key?.trim() &&
      (input.kind !== 'CONVENTION' || attachment.signe === true),
  );
  return piece ? { key: piece.key, filename: piece.filename } : null;
}
