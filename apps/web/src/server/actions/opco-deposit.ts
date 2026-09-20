'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { buildOpcoSubmission } from '@/lib/opco/build-submission';
import { controlCompanyPieces, DEPOSITORS } from '@/lib/opco/company-dossier';
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
