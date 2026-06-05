'use server';

/**
 * Server actions du Wizard étape 2 : sélection dates + créneaux + formateur.
 *
 * Toutes scopées multi-tenant + RBAC ADMIN/MANAGER.
 */

import { z } from 'zod';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { proposeSchedule } from '@/lib/schedule/propose-business-dates';
import {
  checkTrainerAvailability,
  checkMultipleTrainersAvailability,
  type TrainerAvailabilityResult,
} from '@/lib/schedule/trainer-availability';

const ProposeInputSchema = z.object({
  startDate: z.string().min(8), // YYYY-MM-DD
  durationHours: z.number().int().positive().max(1000),
  hoursPerDay: z.number().int().positive().max(12).optional(),
});

export async function proposeScheduleAction(
  input: z.infer<typeof ProposeInputSchema>,
): Promise<{
  ok: boolean;
  error?: string;
  dates?: string[];
  endDate?: string;
  nbDays?: number;
}> {
  try {
    await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = ProposeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };

  const startDate = new Date(parsed.data.startDate + 'T00:00:00');
  if (isNaN(startDate.getTime())) return { ok: false, error: 'Date invalide' };

  const result = proposeSchedule({
    startDate,
    durationHours: parsed.data.durationHours,
    hoursPerDay: parsed.data.hoursPerDay,
  });

  return {
    ok: true,
    dates: result.dates.map(toIsoLocal),
    endDate: toIsoLocal(result.endDate),
    nbDays: result.nbDays,
  };
}

const CheckTrainerInputSchema = z.object({
  trainerPersonId: z.string().uuid(),
  dates: z.array(z.string().min(8)).min(1).max(60),
  excludeSessionId: z.string().uuid().optional(),
});

export async function checkTrainerAvailabilityAction(
  input: z.infer<typeof CheckTrainerInputSchema>,
): Promise<{
  ok: boolean;
  error?: string;
  result?: TrainerAvailabilityResult;
}> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = CheckTrainerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };

  const dates = parsed.data.dates.map((s) => new Date(s + 'T00:00:00'));
  const result = await checkTrainerAvailability(
    parsed.data.trainerPersonId,
    dates,
    user.tenantId,
    parsed.data.excludeSessionId,
  );
  return { ok: true, result };
}

const CheckMultiInputSchema = z.object({
  trainerPersonIds: z.array(z.string().uuid()).min(1).max(50),
  dates: z.array(z.string().min(8)).min(1).max(60),
  excludeSessionId: z.string().uuid().optional(),
});

/**
 * Pour le picker formateur : check tous les formateurs candidats d'un coup
 * afin d'afficher leur disponibilité dans la liste.
 */
export async function checkMultipleTrainersAvailabilityAction(
  input: z.infer<typeof CheckMultiInputSchema>,
): Promise<{
  ok: boolean;
  error?: string;
  results?: TrainerAvailabilityResult[];
}> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = CheckMultiInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };

  const dates = parsed.data.dates.map((s) => new Date(s + 'T00:00:00'));
  const results = await checkMultipleTrainersAvailability(
    parsed.data.trainerPersonIds,
    dates,
    user.tenantId,
    parsed.data.excludeSessionId,
  );
  return { ok: true, results };
}

/**
 * Persist : crée les SessionSlot pour une session existante à partir des dates.
 * Idempotent : supprime les SessionSlot existants puis recrée (cas re-planning).
 */
const PersistSlotsInputSchema = z.object({
  sessionId: z.string().uuid(),
  durationHours: z.number().int().positive(),
  startDate: z.string().min(8),
  hoursPerDay: z.number().int().positive().max(12).optional(),
});

export async function persistSessionSlotsAction(
  input: z.infer<typeof PersistSlotsInputSchema>,
): Promise<{ ok: boolean; error?: string; slotsCount?: number; endDate?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = PersistSlotsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };

  const sess = await prisma.trainingSession.findFirst({
    where: { id: parsed.data.sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!sess) return { ok: false, error: 'Session introuvable' };

  const startDate = new Date(parsed.data.startDate + 'T00:00:00');
  const proposal = proposeSchedule({
    startDate,
    durationHours: parsed.data.durationHours,
    hoursPerDay: parsed.data.hoursPerDay,
  });

  // Transaction : drop + recreate + update Session endDate
  const result = await prisma.$transaction(async (tx) => {
    await tx.sessionSlot.deleteMany({ where: { sessionId: parsed.data.sessionId } });
    await tx.sessionSlot.createMany({
      data: proposal.slots.map((s) => ({
        sessionId: parsed.data.sessionId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        halfDay: s.halfDay,
      })),
    });
    await tx.trainingSession.update({
      where: { id: parsed.data.sessionId },
      data: { startDate, endDate: proposal.endDate },
    });
    return proposal;
  });

  return {
    ok: true,
    slotsCount: result.slots.length,
    endDate: toIsoLocal(result.endDate),
  };
}

function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
