'use server';
import { prisma, Prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import {
  CreateTrainerAvailabilitySchema,
  UpdateTrainerAvailabilitySchema,
  DeleteTrainerAvailabilitySchema,
} from '@qualiof/shared/schemas';
import { requireRole, ForbiddenError, UnauthorizedError } from '@/lib/rbac';
import { availabilityAccess } from '@/lib/planning/availability-access';

type Result = { ok: true; id: string; changed: boolean } | { ok: false; error: string };
function snapshot(value: {
  trainerId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  note: string | null;
}) {
  return {
    trainerId: value.trainerId,
    startsAt: value.startsAt.toISOString(),
    endsAt: value.endsAt.toISOString(),
    status: value.status,
    note: value.note,
  };
}
function refresh(trainerId: string) {
  revalidatePath('/app/planning');
  revalidatePath('/app/formateurs');
  revalidatePath(`/app/formateurs/${trainerId}`);
  revalidatePath('/app/sessions', 'layout');
}
function failure(error: unknown): Result {
  if (error instanceof ForbiddenError || error instanceof UnauthorizedError)
    return { ok: false, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
    return { ok: false, error: 'Une modification simultanée a eu lieu. Réessayez.' };
  console.error(
    '[planning] Mutation indisponibilité impossible',
    error instanceof Error ? error.name : 'Erreur',
  );
  return { ok: false, error: 'Impossible d’enregistrer cette modification. Réessayez.' };
}
export async function createTrainerAvailability(input: unknown): Promise<Result> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'FORMATEUR']);
    const parsed = CreateTrainerAvailabilitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const value = parsed.data;
    const result = await prisma.$transaction(
      async (tx): Promise<Result> => {
        const access = await availabilityAccess(user, tx);
        if (!access.trainerIds.includes(value.trainerId))
          return { ok: false, error: access.reason ?? 'Formateur introuvable ou accès refusé.' };
        const created = await tx.trainerAvailability.create({
          data: {
            tenantId: user.tenantId,
            trainerId: value.trainerId,
            startsAt: new Date(value.startsAt),
            endsAt: new Date(value.endsAt),
            status: value.status,
            note: value.note || null,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'TrainerAvailability',
            entityId: created.id,
            action: 'trainerAvailability.create',
            diff: { before: null, after: snapshot(created) },
          },
        });
        return { ok: true, id: created.id, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.ok && result.changed) refresh(value.trainerId);
    return result;
  } catch (error) {
    return failure(error);
  }
}
export async function updateTrainerAvailability(input: unknown): Promise<Result> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'FORMATEUR']);
    const parsed = UpdateTrainerAvailabilitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const value = parsed.data;
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.trainerAvailability.findFirst({
          where: { id: value.id, tenantId: user.tenantId },
        });
        if (!existing)
          return { ok: false as const, error: 'Indisponibilité introuvable ou accès refusé.' };
        const access = await availabilityAccess(user, tx);
        if (!access.trainerIds.includes(existing.trainerId))
          return { ok: false as const, error: access.reason ?? 'Accès refusé pour ce formateur.' };
        const before = snapshot(existing);
        const next = {
          startsAt: new Date(value.startsAt),
          endsAt: new Date(value.endsAt),
          status: value.status,
          note: value.note || null,
        };
        const after = snapshot({ ...existing, ...next });
        if (JSON.stringify(before) === JSON.stringify(after))
          return {
            ok: true as const,
            id: existing.id,
            changed: false,
            trainerId: existing.trainerId,
          };
        await tx.trainerAvailability.update({
          where: { id: existing.id, tenantId: user.tenantId, trainerId: existing.trainerId },
          data: next,
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'TrainerAvailability',
            entityId: existing.id,
            action: 'trainerAvailability.update',
            diff: { before, after },
          },
        });
        return { ok: true as const, id: existing.id, changed: true, trainerId: existing.trainerId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.ok && result.changed) refresh(result.trainerId);
    return result;
  } catch (error) {
    return failure(error);
  }
}
export async function deleteTrainerAvailability(input: unknown): Promise<Result> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'FORMATEUR']);
    const parsed = DeleteTrainerAvailabilitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.trainerAvailability.findFirst({
          where: { id: parsed.data.id, tenantId: user.tenantId },
        });
        if (!existing)
          return { ok: false as const, error: 'Indisponibilité introuvable ou accès refusé.' };
        const access = await availabilityAccess(user, tx);
        if (!access.trainerIds.includes(existing.trainerId))
          return { ok: false as const, error: access.reason ?? 'Accès refusé pour ce formateur.' };
        await tx.trainerAvailability.delete({
          where: { id: existing.id, tenantId: user.tenantId, trainerId: existing.trainerId },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'TrainerAvailability',
            entityId: existing.id,
            action: 'trainerAvailability.delete',
            diff: { before: snapshot(existing), after: null },
          },
        });
        return { ok: true as const, id: existing.id, changed: true, trainerId: existing.trainerId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.ok && result.changed) refresh(result.trainerId);
    return result;
  } catch (error) {
    return failure(error);
  }
}
