'use server';

/**
 * Phase 9.1 Plan 03 Task 2 — `getParticipantAttendance` (read-only).
 *
 * Renvoie le détail Attendance pour un participant + une session :
 *   - parcourt tous les SessionSlot de la session (date × halfDay)
 *   - pour chaque slot, retourne le statut signé/non-signé (Attendance match personId)
 *
 * Lecture libre tous rôles authentifiés (tenant-scoped via session.tenantId).
 *
 * Utilisé par `<AttendanceDetailDrawer>` (Plan 03 Task 2) — drawer Radix Dialog
 * centrée déclenchée depuis le DocCellMenu d'une cellule Émargement partielle.
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export interface AttendanceSlot {
  date: string; // ISO yyyy-mm-dd
  period: 'AM' | 'PM' | 'FULL';
  signedAt: string | null; // ISO datetime if signed
  signatureUrl: string | null;
}

export type GetParticipantAttendanceResult =
  | {
      ok: true;
      slots: AttendanceSlot[];
      signedCount: number;
      totalSlots: number;
    }
  | { ok: false; error: string };

/**
 * Récupère l'historique d'émargement pour 1 participant sur 1 session.
 *
 * Tenant scope : la session est filtrée par `tenantId` du user authentifié.
 * Le participant doit être inscrit à la session (sinon retour `{ ok: false }`).
 */
export async function getParticipantAttendance(
  participantId: string,
  sessionId: string,
): Promise<GetParticipantAttendanceResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: {
      id: participantId,
      sessionId,
      session: { tenantId: user.tenantId },
    },
    select: { id: true, personId: true },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const slots = await prisma.sessionSlot.findMany({
    where: { sessionId },
    orderBy: [{ date: 'asc' }, { halfDay: 'asc' }],
    include: {
      attendances: {
        where: { personId: participant.personId },
        select: { signedAt: true, signatureUrl: true },
      },
    },
  });

  const out: AttendanceSlot[] = slots.map((s) => {
    const att = s.attendances[0] ?? null;
    const period: AttendanceSlot['period'] =
      s.halfDay === 'morning' ? 'AM' : s.halfDay === 'afternoon' ? 'PM' : 'FULL';
    return {
      date: s.date.toISOString().slice(0, 10),
      period,
      signedAt: att?.signedAt ? att.signedAt.toISOString() : null,
      signatureUrl: att?.signatureUrl ?? null,
    };
  });

  const signedCount = out.filter((s) => s.signedAt !== null).length;
  return { ok: true, slots: out, signedCount, totalSlots: out.length };
}
