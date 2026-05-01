'use server';

/**
 * Calcule en temps réel les notifications pertinentes pour le top-bar (cloche).
 * Prises en charge :
 * - Pré-inscriptions soumises ou extraites en attente de validation admin
 * - Sessions à venir dans les 24h sans inscrit
 * - Sessions terminées non clôturées (endDate < now, status PLANNED/OPEN/IN_PROGRESS)
 * - Dossiers OPCO marqués à corriger (requiresCleanup persons/orgs)
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export type NotificationKind = 'preinscription' | 'session_no_attendee' | 'session_to_close' | 'cleanup';

export interface NotificationItem {
  kind: NotificationKind;
  label: string;
  href: string;
  count: number;
  severity: 'info' | 'warning' | 'danger';
}

export async function getNotifications(): Promise<{
  total: number;
  items: NotificationItem[];
}> {
  const { user } = await validateRequest();
  if (!user) return { total: 0, items: [] };

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [preinscriptionsToValidate, sessionsNoAttendee, sessionsToClose, cleanupCount] = await Promise.all([
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

  const total = items.reduce((s, n) => s + n.count, 0);
  return { total, items };
}
