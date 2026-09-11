'use server';

/**
 * Calcule en temps réel les notifications pertinentes pour le top-bar (cloche).
 * Prises en charge :
 * - Pré-inscriptions soumises ou extraites en attente de validation admin (DÉRIVÉ)
 * - Sessions à venir dans les 24h sans inscrit (DÉRIVÉ)
 * - Sessions terminées non clôturées (endDate < now, status PLANNED/OPEN/IN_PROGRESS) (DÉRIVÉ)
 * - Dossiers OPCO marqués à corriger (requiresCleanup persons/orgs) (DÉRIVÉ)
 * - Notifications événementielles type='lead.assigned' user-scoped (PERSISTÉ — Phase 9 Plan 09-04)
 * - Pièces de signature signées par TOUS type='signature.completed' (PERSISTÉ — lot C.3)
 *
 * Hybride dérivé (4 kinds tenant-wide) + persisté (2 kinds user-scoped).
 * Les rows persistées sont créées par `notifyLeadAssigned` (Phase 9 Plan 09-02) et par
 * `prevenirAdmins` (`server/signature-retour.ts`, lot C.3) — le payload Json est typé
 * runtime via `LeadAssignedPayloadSchema` / `SignatureCompletedPayloadSchema` (Pitfall 6
 * RESEARCH.md : drift writer/reader silencieux sur le champ Json schema-less).
 *
 * ⚠ CE QUE LA RECETTE DU 11/09/2026 A TROUVÉ ICI (défaut D-C3-2). Le webhook écrivait ses
 * lignes `signature.completed` depuis le lot C.3 — vérifiées en base sur l'aperçu — et ce
 * `findMany` filtrait `type: 'lead.assigned'` EN DUR. La notification existait, personne ne
 * la voyait : la cloche restait muette après le retour d'une convention signée par les deux
 * parties. Le filtre porte désormais les deux types, et un test de source garde les DEUX
 * sens — le nouveau lu, et l'ancien pas remplacé.
 */

import { prisma } from '@qualiof/db';
import { LeadAssignedPayloadSchema, SignatureCompletedPayloadSchema } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
// Le libellé et la destination vivent dans un module PUR : ce sont deux
// décisions (« quelle pièce », « quel onglet »), et elles se gardent sous test
// unitaire au lieu d'exiger Prisma et Lucia (lot C.3, D-C3-2).
import {
  libelleSignatureCompletee,
  lienSignatureCompletee,
} from '@/lib/signature/notification-cloche';

export type NotificationKind =
  | 'preinscription'
  | 'session_no_attendee'
  | 'session_to_close'
  | 'cleanup'
  | 'lead.assigned'
  | 'signature.completed';

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

  const [
    preinscriptionsToValidate,
    sessionsNoAttendee,
    sessionsToClose,
    cleanupCount,
    notifsPersistees,
  ] = await Promise.all([
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
      // Phase 9 Plan 09-04 + lot C.3 — 5e source : les rows persistées.
      // Scope user.id (Pitfall 2 RESEARCH.md — chaque user voit SES notifs). Top 10 max,
      // ordonnees par createdAt desc.
      //
      // ⚠ LES DEUX TYPES, dans un `in`. Remplacer le filtre par le seul
      // 'signature.completed' ferait disparaître les leads assignés sans qu'aucun
      // écran ne le dise — c'est exactement la façon dont la cloche a perdu les
      // pièces signées pendant tout le lot C.3.
      prisma.notification.findMany({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          readAt: null,
          type: { in: ['lead.assigned', 'signature.completed'] },
        },
        select: { id: true, type: true, payload: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

  const items: NotificationItem[] = [];
  if (preinscriptionsToValidate > 0) {
    items.push({
      kind: 'preinscription',
      label: `${preinscriptionsToValidate} pré-inscription${preinscriptionsToValidate > 1 ? 's' : ''} à valider`,
      href: '/app/inscriptions',
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

  // Phase 9 Plan 09-04 + lot C.3 — Notification rows persistées.
  // Parse payload via le schéma du type ; skip si parse échoue (Pitfall 6 RESEARCH.md
  // — drift writer/reader silencieux sur Json schema-less). Une ligne illisible
  // disparaît en silence : c'est le bon arbitrage pour une cloche, qui ne doit
  // jamais faire tomber la barre du haut.
  for (const notif of notifsPersistees) {
    if (notif.type === 'lead.assigned') {
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
      continue;
    }

    // Lot C.3 (D-C3-2) — une pièce revenue signée par TOUS. `severity: 'info'` :
    // c'est une bonne nouvelle, pas une alerte. Elle reste dans la cloche
    // jusqu'au clic (`markNotificationRead`, réutilisé tel quel).
    const signature = SignatureCompletedPayloadSchema.safeParse(notif.payload);
    if (!signature.success) continue;
    items.push({
      kind: 'signature.completed',
      id: notif.id,
      label: libelleSignatureCompletee({
        docType: signature.data.docType,
        sessionCode: signature.data.sessionCode,
      }),
      href: lienSignatureCompletee({
        sessionId: signature.data.sessionId,
        docType: signature.data.docType,
      }),
      count: 1,
      severity: 'info',
    });
  }

  const total = items.reduce((s, n) => s + n.count, 0);
  return { total, items };
}
