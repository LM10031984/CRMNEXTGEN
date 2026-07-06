'use server';

/**
 * Server Action — synchro Google Calendar par session (Phase 14, Plan 14-06).
 *
 * Wrapper MINCE auth-gaté au-dessus du cœur worker-safe `syncSessionCalendar`.
 * La SEULE valeur ajoutée ici (responsabilités de couche server action) :
 *   1. auth-gate via requireRole(['ADMIN','MANAGER']) — le cœur reste worker-safe ;
 *   2. AuditLog `sessions.calendarSynced` (convention universelle [entity].[verb]) ;
 *   3. revalidatePath de la fiche session après succès.
 * Aucune logique métier dupliquée : la construction des events + l'idempotence
 * insert/update/skip vivent dans `lib/calendar/*` (réutilisés par le backfill).
 *
 * FRONTIÈRE auth/core (règle worker BullMQ) : la server action IMPORTE le cœur,
 * jamais l'inverse. `sync-session.ts` ne doit JAMAIS importer ce fichier.
 */

import { Prisma, prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { syncSessionCalendar, type SyncSessionRecap } from '@/lib/calendar/sync-session';
import { loadSessionEventCtx } from '@/lib/calendar/load-session-ctx';

export interface SyncSessionActionInput {
  sessionId: string;
  /** toggle UI : notifier réellement les apprenants (sessions futures uniquement). */
  notifyLearners: boolean;
}

export type SyncSessionActionResult =
  | { ok: true; recap: SyncSessionRecap }
  | { ok: false; error: string };

/**
 * Déclenche la synchro Google Calendar d'une session en mode "auto" (UI fiche
 * session). Auth ADMIN/MANAGER, écrit un AuditLog après succès.
 */
export async function syncSessionCalendarAction(
  input: SyncSessionActionInput,
): Promise<SyncSessionActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // Contexte calendrier tenant-scopé (formateur + apprenants + lieu + dates).
  const loaded = await loadSessionEventCtx(user.tenantId, input.sessionId);
  if (!loaded || loaded.missingTrainerEmail || !loaded.ctx.trainerEmail) {
    // Pas de mutation réussie à tracer → aucun AuditLog, aucun appel API.
    return { ok: false, error: 'Session introuvable ou formateur sans e-mail' };
  }

  const { ctx } = loaded;
  // Session passée → audit-only (jamais de notification, cf. règle invites CONTEXT).
  const isPastSession = (ctx.endDate ?? ctx.startDate) < new Date();

  try {
    const recap = await syncSessionCalendar({
      tenantId: user.tenantId,
      sessionId: input.sessionId,
      ctx,
      syncMode: 'auto',
      isPastSession,
      notifyLearners: input.notifyLearners,
    });

    // AuditLog : convention universelle repo [entity].[verb] (cf sessions.ts:1146).
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: input.sessionId,
        action: 'sessions.calendarSynced',
        diff: {
          recap,
          syncMode: 'auto',
          notifyLearners: input.notifyLearners,
          isPastSession,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    revalidatePath(`/app/sessions/${input.sessionId}`);
    return { ok: true, recap };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
