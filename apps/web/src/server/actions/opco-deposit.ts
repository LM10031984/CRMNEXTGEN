'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { buildOpcoSubmission } from '@/lib/opco/build-submission';
import { controlCompanyPieces, DEPOSITORS, isCompanyDossier } from '@/lib/opco/company-dossier';
import { parisDay } from '@/lib/alertes/formation-rules';

export async function recordOpcoDeposit(input: {
  participantId: string;
  email: string | null;
  date: string | null;
  expectedAt: string | null;
  expectedBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  const clearing = input.email === null && input.date === null;
  if (
    !clearing &&
    (!DEPOSITORS.some((p) => p.email === input.email) ||
      !input.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
  )
    return { ok: false, error: 'Choisissez la personne et la date du dépôt.' };
  const date = clearing ? null : new Date(`${input.date}T12:00:00.000Z`);
  if (
    date &&
    (!Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.date ||
      input.date! > parisDay(new Date()))
  )
    return { ok: false, error: 'La date du dépôt doit être valide et ne peut pas être future.' };
  const built = await buildOpcoSubmission(input.participantId, user, 'PRISE_EN_CHARGE');
  if (!built.ok) return built;
  if (!built.company)
    return { ok: false, error: 'Cette déclaration concerne les dossiers entreprise / salariés.' };
  if (!clearing) {
    const blocked = controlCompanyPieces(built.attachments);
    if (blocked) return { ok: false, error: blocked };
  }
  const expected = input.expectedAt ? new Date(input.expectedAt) : null;
  if (expected && !Number.isFinite(expected.getTime()))
    return { ok: false, error: 'Rechargez le dossier.' };
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.sessionParticipant.updateMany({
      where: {
        id: input.participantId,
        sessionId: built.participant.sessionId,
        sponsorOrgId: built.participant.sponsorOrgId,
        enrollmentStatus: { not: 'CANCELLED' },
        session: { tenantId: user.tenantId },
        opcoDepositedAt: expected,
        opcoDepositedByEmail: input.expectedBy,
      },
      data: { opcoDepositedAt: date, opcoDepositedByEmail: clearing ? null : input.email },
    });
    if (!updated.count) return false;
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'SessionParticipant',
        entityId: input.participantId,
        action: clearing ? 'opco.deposit_cleared' : 'opco.deposit_recorded',
        diff: {
          before: {
            at: built.participant.opcoDepositedAt?.toISOString() ?? null,
            by: built.participant.opcoDepositedByEmail,
          },
          after: { at: date?.toISOString() ?? null, by: input.email },
        },
      },
    });
    return true;
  });
  if (!saved)
    return { ok: false, error: 'Le suivi a changé. Rechargez la page avant de le modifier.' };
  revalidatePath('/app/dossiers-opco', 'layout');
  revalidatePath(`/app/sessions/${built.participant.sessionId}`);
  return { ok: true };
}

type ExpectedCompanyMember = {
  id: string;
  depositedAt: string | null;
  depositedBy: string | null;
};

export async function recordCompanyOpcoDeposit(input: {
  sessionId: string;
  sponsorOrgId: string;
  email: string | null;
  date: string | null;
  expectedMembers: ExpectedCompanyMember[];
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  const clearing = input.email === null && input.date === null;
  if (
    !clearing &&
    (!DEPOSITORS.some((person) => person.email === input.email) ||
      !input.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
  )
    return { ok: false, error: 'Choisissez la personne et la date du dépôt.' };
  const date = clearing ? null : new Date(`${input.date}T12:00:00.000Z`);
  if (
    date &&
    (!Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.date ||
      input.date! > parisDay(new Date()))
  )
    return { ok: false, error: 'La date du dépôt doit être valide et ne peut pas être future.' };
  if (input.expectedMembers.length === 0)
    return { ok: false, error: 'Aucun salarié actif dans ce dossier entreprise.' };
  const expected = new Map(input.expectedMembers.map((member) => [member.id, member]));
  if (expected.size !== input.expectedMembers.length)
    return { ok: false, error: 'Le groupe contient une inscription en double. Rechargez la page.' };

  for (const member of input.expectedMembers) {
    const built = await buildOpcoSubmission(member.id, user, 'PRISE_EN_CHARGE');
    if (!built.ok) return built;
    if (
      !built.company ||
      built.participant.sessionId !== input.sessionId ||
      built.participant.sponsorOrgId !== input.sponsorOrgId
    )
      return { ok: false, error: 'Ce dossier entreprise ne correspond pas à la session.' };
    if (!clearing) {
      const blocked = controlCompanyPieces(built.attachments);
      if (blocked) return { ok: false, error: `Dossier salarié incomplet — ${blocked}` };
    }
  }

  const concurrencyError = new Error('OPCO_COMPANY_CONCURRENCY');
  const saved = await prisma
    .$transaction(async (tx) => {
      const candidates = await tx.sessionParticipant.findMany({
        where: {
          sessionId: input.sessionId,
          sponsorOrgId: input.sponsorOrgId,
          enrollmentStatus: { not: 'CANCELLED' },
          session: { tenantId: user.tenantId },
        },
        select: {
          id: true,
          sponsorOrgId: true,
          participantType: true,
          opcoDepositedAt: true,
          opcoDepositedByEmail: true,
          session: { select: { startDate: true, endDate: true, regime: true } },
          person: {
            select: {
              legalLinks: {
                select: { role: true, organizationId: true, startDate: true, endDate: true },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      });
      const current = candidates.filter((member) => isCompanyDossier(member));
      if (
        current.length !== expected.size ||
        current.some((member) => {
          const snapshot = expected.get(member.id);
          return (
            !snapshot ||
            (member.opcoDepositedAt?.toISOString() ?? null) !== snapshot.depositedAt ||
            member.opcoDepositedByEmail !== snapshot.depositedBy
          );
        })
      )
        return false;

      for (const member of current) {
        const updated = await tx.sessionParticipant.updateMany({
          where: {
            id: member.id,
            sessionId: input.sessionId,
            sponsorOrgId: input.sponsorOrgId,
            enrollmentStatus: { not: 'CANCELLED' },
            session: { tenantId: user.tenantId },
            opcoDepositedAt: member.opcoDepositedAt,
            opcoDepositedByEmail: member.opcoDepositedByEmail,
          },
          data: { opcoDepositedAt: date, opcoDepositedByEmail: clearing ? null : input.email },
        });
        if (updated.count !== 1) throw concurrencyError;
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Organization',
          entityId: input.sponsorOrgId,
          action: clearing ? 'opco.company_deposit_cleared' : 'opco.company_deposit_recorded',
          diff: {
            sessionId: input.sessionId,
            participantIds: current.map((member) => member.id),
            after: { at: date?.toISOString() ?? null, by: clearing ? null : input.email },
          },
        },
      });
      return true;
    })
    .catch((error) => {
      if (error === concurrencyError) return false;
      throw error;
    });
  if (!saved)
    return {
      ok: false,
      error: 'Le groupe a changé. Rechargez la page avant de déclarer le dépôt.',
    };
  revalidatePath('/app/dossiers-opco', 'layout');
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}
