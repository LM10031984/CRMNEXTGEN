'use server';

/**
 * Phase 9 Plan 09-04 Task 1 — Marque une row `Notification` comme lue.
 *
 * Appele par `notifications-bell.tsx` au clic sur un item persistant (kind='lead.assigned').
 *
 * Securite : single-use atomique scope `userId` — un user ne peut marquer que SES notifs.
 * Le filter `readAt: null` empeche un double-marquage (idempotence cote BDD via updateMany).
 *
 * Pas de revalidatePath : la cloche re-fetch toutes les 60s via polling, et le clic redirige
 * immediatement vers `/app/leads/{leadId}`. Le user ne voit donc pas l'item "fantome" en haut.
 *
 * Pas de requireRole : n'importe quel user authentifie peut marquer SES propres notifs.
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function markNotificationRead(notifId: string): Promise<ActionResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // updateMany scope userId + readAt:null garantit :
  //  - un user ne peut marquer que ses propres notifs (si pas la sienne → count=0)
  //  - une notif deja lue n'est pas re-stampee (idempotence)
  await prisma.notification.updateMany({
    where: { id: notifId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  // Toujours ok:true (silencieux cote UI — l'utilisateur a clique, on l'a entendu).
  return { ok: true };
}
