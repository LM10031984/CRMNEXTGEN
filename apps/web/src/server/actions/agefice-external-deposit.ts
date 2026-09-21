'use server';

import { prisma, Prisma } from '@qualiof/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/rbac';
import { estEligibleAgefice, AGEFICE_PARTICIPANT_SELECT } from '@/lib/agefice/eligibilite';
import { parisDay } from '@/lib/alertes/formation-rules';

const Input = z.object({
  participantId: z.string().uuid(),
  stage: z.enum(['PRISE_EN_CHARGE', 'FIN_FORMATION']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sender: z.string().trim().min(2).max(160),
  recipientEmail: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
  expectedId: z.string().uuid().nullable(),
  expectedUpdatedAt: z.string().datetime().nullable(),
  clear: z.boolean().optional(),
});

/** Déclaration historique uniquement : aucun appel au transport de courrier. */
export async function recordExternalAgeficeDeposit(
  input: z.infer<typeof Input>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
    const value = Input.parse(input);
    const date = new Date(`${value.date}T12:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value.date ||
      value.date > parisDay(new Date())
    )
      return { ok: false, error: 'La date d’envoi doit être valide et ne peut pas être future.' };
    const sessionId = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.tenantId + ':' + value.participantId + ':' + value.stage}))`;
        const participant = await tx.sessionParticipant.findFirst({
          where: {
            id: value.participantId,
            enrollmentStatus: { not: 'CANCELLED' },
            session: { tenantId: user.tenantId },
          },
          select: { ...AGEFICE_PARTICIPANT_SELECT, sessionId: true },
        });
        if (!participant || !estEligibleAgefice(participant))
          throw new Error('Inscription AGEFICE active introuvable.');
        const active = await tx.opcoSubmission.findMany({
          where: {
            tenantId: user.tenantId,
            participantId: participant.id,
            stage: value.stage,
            status: { notIn: ['CANCELED', 'REJECTED'] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (active.some((s) => s.deliveryState !== 'READY'))
          throw new Error(
            'Un envoi est en cours ou incertain. Vérifiez son résultat avant de déclarer un envoi externe.',
          );
        const confirmed = active.filter((s) => s.status !== 'DRAFT');
        if (confirmed.length > 1)
          throw new Error(
            'Plusieurs envois sont confirmés pour cette étape. Vérifiez l’historique avant de la modifier.',
          );
        const sent = confirmed[0];
        if (sent && sent.deliveryMethod !== 'EXTERNAL')
          throw new Error(
            'Cet envoi est déjà confirmé depuis QualiOF. Il ne peut pas être remplacé par une déclaration externe.',
          );
        if (
          (sent?.id ?? null) !== value.expectedId ||
          (sent?.updatedAt.toISOString() ?? null) !== value.expectedUpdatedAt
        )
          throw new Error('Le dépôt a changé. Rechargez la page avant de modifier la déclaration.');
        if (value.clear && !sent) throw new Error('Aucune déclaration externe à annuler.');
        const data = value.clear
          ? { status: 'CANCELED' as const }
          : {
              status: sent?.status ?? ('SENT' as const),
              deliveryMethod: 'EXTERNAL',
              deliveryState: 'READY',
              sentAt: date,
              externalSender: value.sender,
              recipientEmail: value.recipientEmail || null,
            };
        const submission = sent
          ? await tx.opcoSubmission.update({ where: { id: sent.id }, data })
          : await tx.opcoSubmission.create({
              data: {
                tenantId: user.tenantId,
                participantId: participant.id,
                sponsorOrgId: participant.sponsorOrgId,
                stage: value.stage,
                attachments: [],
                createdById: user.id,
                subject: 'Envoi effectué hors QualiOF',
                ...data,
              },
            });
        // Un brouillon resté ouvert ne doit pas proposer de renvoyer la même étape.
        await tx.opcoSubmission.updateMany({
          where: {
            tenantId: user.tenantId,
            participantId: participant.id,
            stage: value.stage,
            status: 'DRAFT',
            deliveryState: 'READY',
          },
          data: {
            status: 'CANCELED',
            internalNotes: 'Remplacé par une déclaration d’envoi hors QualiOF.',
          },
        });
        if (value.stage === 'PRISE_EN_CHARGE')
          await tx.sessionParticipant.update({
            where: { id: participant.id },
            data: {
              opcoDepositedAt: value.clear ? null : date,
              opcoDepositedByEmail: value.clear ? null : value.sender,
            },
          });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'OpcoSubmission',
            entityId: submission.id,
            action: value.clear
              ? 'opco.external_deposit_canceled'
              : 'opco.external_deposit_recorded',
            diff: {
              stage: value.stage,
              before: sent
                ? { date: sent.sentAt?.toISOString(), sender: sent.externalSender }
                : null,
              after: value.clear
                ? null
                : {
                    date: date.toISOString(),
                    sender: value.sender,
                    recipientEmail: value.recipientEmail || null,
                  },
              declaredBy: user.id,
            },
          },
        });
        return participant.sessionId;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidatePath(`/app/sessions/${sessionId}`);
    revalidatePath('/app/dossiers-opco');
    revalidatePath('/app/audit-treso');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? 'Vérifiez la date, le nom de l’expéditeur et l’adresse du destinataire.'
          : error instanceof Error
            ? error.message
            : 'Déclaration impossible.',
    };
  }
}
