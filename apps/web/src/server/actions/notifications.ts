'use server';

/**
 * Calcule en temps réel les notifications pertinentes pour le top-bar (cloche).
 * Prises en charge :
 * - Pré-inscriptions soumises ou extraites en attente de validation admin (DÉRIVÉ)
 * - Sessions à venir dans les 24h sans inscrit (DÉRIVÉ)
 * - Sessions terminées non clôturées (endDate < now, status PLANNED/OPEN/IN_PROGRESS) (DÉRIVÉ)
 * - Dossiers OPCO marqués à corriger (requiresCleanup persons/orgs) (DÉRIVÉ)
 * - Notifications événementielles type='lead.assigned' user-scoped (PERSISTÉ — Phase 9 Plan 09-04)
 *
 * Hybride dérivé (4 kinds tenant-wide) + persisté (1 kind 'lead.assigned' user-scoped).
 * Les rows persistées sont créées par `notifyLeadAssigned` (Phase 9 Plan 09-02) — le payload
 * Json est typé runtime via `LeadAssignedPayloadSchema` (Pitfall 6 RESEARCH.md : drift writer/reader
 * silencieux sur le champ Json schema-less).
 */

import { prisma } from '@qualiof/db';
import { LeadAssignedPayloadSchema } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';

export type NotificationKind =
  | 'preinscription'
  | 'session_no_attendee'
  | 'session_to_close'
  | 'cleanup'
  | 'lead.assigned';

export interface NotificationItem {
  kind: NotificationKind;
  label: string;
  href: string;
  count: number;
  severity: 'info' | 'warning' | 'danger';
  /** Présent uniquement pour les notifs persistées (table `Notification`). Permet `markNotificationRead`. */
  id?: string;
}

export async function getNotifications(): Promise<{
  total: number;
  items: NotificationItem[];
}> {
  const { user } = await validateRequest();
  if (!user) return { total: 0, items: [] };

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [preinscriptionsToValidate, sessionsNoAttendee, sessionsToClose, cleanupCount, leadAssignedNotifs] =
    await Promise.all([
      prisma.preEnrollment.count({
        where: {
          tenantId: user.tenantId,
          status: { in: ['SUBMITTED', 'EXTRACTED'] },
        },
      }),
      prisma.trainingSession.count({
        where: {
          tenantId: user.tenantId,
          startDate: { gte: now, lte: tomorrow },
          participants: { none: {} },
        },
      }),
      prisma.trainingSession.count({
        where: {
          tenantId: user.tenantId,
          endDate: { lt: now },
          status: { in: ['PLANNED', 'OPEN', 'IN_PROGRESS'] },
        },
      }),
      prisma.person.count({
        where: { tenantId: user.tenantId, archived: false, requiresCleanup: true },
      }),
      // Phase 9 Plan 09-04 — 5e source : rows persistées Notification 'lead.assigned'.
      // Scope user.id (Pitfall 2 RESEARCH.md — chaque user voit SES notifs). Top 10 max,
      // ordonnees par createdAt desc.
      prisma.notification.findMany({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          readAt: null,
          type: 'lead.assigned',
        },
        select: { id: true, payload: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

  const items: NotificationItem[] = [];
  if (preinscriptionsToValidate > 0) {
    items.push({
      kind: 'preinscription',
      label: `${preinscriptionsToValidate} pré-inscription${preinscriptionsToValidate > 1 ? 's' : ''} à valider`,
      href: '/app/preinscriptions',
      count: preinscriptionsToValidate,
      severity: 'warning',
    });
  }
  if (sessionsNoAttendee > 0) {
    items.push({
      kind: 'session_no_attendee',
      label: `${sessionsNoAttendee} session${sessionsNoAttendee > 1 ? 's' : ''} dans les 24h sans inscrit`,
      href: '/app/sessions?filter=this_week',
      count: sessionsNoAttendee,
      severity: 'danger',
    });
  }
  if (sessionsToClose > 0) {
    items.push({
      kind: 'session_to_close',
      label: `${sessionsToClose} session${sessionsToClose > 1 ? 's' : ''} terminée${sessionsToClose > 1 ? 's' : ''} à clôturer`,
      href: '/app/sessions',
      count: sessionsToClose,
      severity: 'warning',
    });
  }
  if (cleanupCount > 0) {
    items.push({
      kind: 'cleanup',
      label: `${cleanupCount} fiche${cleanupCount > 1 ? 's' : ''} apprenant à corriger`,
      href: '/app/apprenants?filter=cleanup',
      count: cleanupCount,
      severity: 'info',
    });
  }

  // Phase 9 Plan 09-04 — Notification rows persistées (type 'lead.assigned').
  // Parse payload via LeadAssignedPayloadSchema ; skip si parse échoue (Pitfall 6 RESEARCH.md
  // — drift writer/reader silencieux sur Json schema-less).
  for (const notif of leadAssignedNotifs) {
    const parsed = LeadAssignedPayloadSchema.safeParse(notif.payload);
    if (!parsed.success) continue;
    items.push({
      kind: 'lead.assigned',
      id: notif.id,
      label: `Nouveau lead à traiter : ${parsed.data.prospectName}`,
      href: `/app/leads/${parsed.data.leadId}`,
      count: 1,
      severity: 'info',
    });
  }

  const total = items.reduce((s, n) => s + n.count, 0);
  return { total, items };
}
