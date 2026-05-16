/**
 * LEAD-02 — Helper pur de calcul des 4 KPI par commercial pour la page
 * `/app/leads/charge` (Phase 9 Plan 09-01 Task 3 / consommé Plan 09-03).
 *
 * Pas de RBAC ici (caller responsable) ; `tenantId` est injecté obligatoirement
 * pour scope multi-tenant (pattern Phase 8 D-09 `buildAuditWhere`).
 *
 * 4 KPI calculés par commercial actif (role=COMMERCIAL, disabledAt=null) :
 *  1. `leadsActifs`         = count Lead status ∈ ACTIVE_STATUSES owné
 *  2. `leadsWonThisMonth`   = count Lead status=WON & wonAt ≥ 1er du mois courant
 *  3. `conversionPct`       = round((wonTotal / totalAttribués) * 100) — 0 si total=0
 *  4. `avgDaysToWin`        = AVG(EXTRACT(EPOCH FROM (wonAt - createdAt))/86400) — null si pas de won
 *
 * Performance : 1 user.findMany + 3 lead.groupBy + 1 $queryRaw, tous en
 * Promise.all (5 round-trips compressés en 2 logiques de timing).
 *
 * Note (Pitfall 3 RESEARCH.md) : si `Lead.wonAt` n'est jamais set (aucune
 * mutation de status WON dans le code), les KPI 2/3/4 retourneront 0/null
 * tant que le Plan 09-02 (updateLeadStatus) n'aura pas été livré.
 */

import { prisma } from '@qualiof/db';
import type { LeadStatus } from '@qualiof/db';

// Dupliqué de auto-assign-leads.ts (privé là-bas). Si évolution un jour : exporter
// depuis auto-assign-leads.ts et importer ici. Source de vérité = D-01 CONTEXT.md.
const ACTIVE_STATUSES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'ON_HOLD',
  'TO_FOLLOWUP',
];

export interface CommercialKpis {
  userId: string;
  name: string;
  kpis: {
    leadsActifs: number;
    leadsWonThisMonth: number;
    conversionPct: number;
    avgDaysToWin: number | null;
  };
}

export async function getCommercialsWithKpis(tenantId: string): Promise<CommercialKpis[]> {
  const commercials = await prisma.user.findMany({
    where: { tenantId, role: 'COMMERCIAL', disabledAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (commercials.length === 0) return [];

  const userIds = commercials.map((c) => c.id);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [active, wonThisMonth, totals, avgTimeRows] = await Promise.all([
    prisma.lead.groupBy({
      by: ['ownerUserId'],
      where: {
        tenantId,
        ownerUserId: { in: userIds },
        status: { in: ACTIVE_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['ownerUserId'],
      where: {
        tenantId,
        ownerUserId: { in: userIds },
        status: 'WON',
        wonAt: { gte: startOfMonth },
      },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['ownerUserId', 'status'],
      where: { tenantId, ownerUserId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ ownerUserId: string; avgDays: number | null }[]>`
      SELECT "ownerUserId",
             AVG(EXTRACT(EPOCH FROM ("wonAt" - "createdAt")) / 86400)::float AS "avgDays"
      FROM "Lead"
      WHERE "tenantId" = ${tenantId}
        AND status = 'WON'
        AND "wonAt" IS NOT NULL
        AND "ownerUserId" IS NOT NULL
      GROUP BY "ownerUserId";
    `,
  ]);

  return commercials.map((c) => {
    const totalForC = totals
      .filter((t) => t.ownerUserId === c.id)
      .reduce((s, t) => s + t._count._all, 0);
    const wonForC =
      totals.find((t) => t.ownerUserId === c.id && t.status === 'WON')?._count._all ?? 0;
    const avg = avgTimeRows.find((r) => r.ownerUserId === c.id)?.avgDays ?? null;
    return {
      userId: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      kpis: {
        leadsActifs: active.find((a) => a.ownerUserId === c.id)?._count._all ?? 0,
        leadsWonThisMonth:
          wonThisMonth.find((w) => w.ownerUserId === c.id)?._count._all ?? 0,
        conversionPct: totalForC > 0 ? Math.round((wonForC / totalForC) * 100) : 0,
        avgDaysToWin: avg !== null ? Math.round(avg) : null,
      },
    };
  });
}
