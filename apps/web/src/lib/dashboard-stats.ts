/**
 * Agrégations pour le dashboard de pilotage Start Academy.
 * Calculs côté serveur via Prisma (pas de tRPC pour le palier 2.1).
 */

import { prisma } from '@qualiof/db';

export interface DashboardStats {
  counts: {
    persons: number;
    orgs: number;
    products: number;
    sessions: number;
    upcomingSessions: number;
    sessionsToClose: number;
    eiOrganizations: number;
    ageficeProfiles: number;
    cleanupPersons: number;
    cleanupOrgs: number;
  };
  ca: {
    forecast: number; // CA prévisionnel : sessions futures ou en cours
    upcoming30days: number; // CA des sessions dans les 30 prochains jours
    pastNotInvoiced: number; // CA des sessions passées non encore facturées
    invoiced: number; // total facturé toutes sessions
    collected: number; // total encaissé
    remaining: number; // reste à encaisser
  };
  byMonth: Array<{ month: string; sessions: number; revenue: number }>;
  topSponsors: Array<{ orgId: string; legalName: string; sessions: number; revenue: number }>;
  topProducts: Array<{ productId: string; title: string; sessions: number; participants: number }>;
  recentSessions: Array<{
    id: string;
    code: string;
    name: string | null;
    startDate: Date;
    status: string;
    nbParticipants: number;
    revenue: number;
  }>;
}

const MONTH_LABELS = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc',
];

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const [
    persons, orgs, products, sessions, upcomingSessions,
    eiOrgs, ageficeProfiles, cleanupPersons, cleanupOrgs,
    activeParticipants, futureParticipants,
    upcoming30Participants, pastNotInvoicedParticipants,
    sessionsByMonth, topSponsorsRaw, topProductsRaw, recentRaw,
    sessionsToClose,
  ] = await Promise.all([
    prisma.person.count({ where: { tenantId, archived: false } }),
    prisma.organization.count({ where: { tenantId, archived: false } }),
    prisma.trainingProduct.count({ where: { tenantId, isActive: true } }),
    prisma.trainingSession.count({ where: { tenantId } }),
    prisma.trainingSession.count({ where: { tenantId, startDate: { gt: now } } }),

    prisma.organization.count({
      where: { tenantId, archived: false, legalForm: { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] } },
    }),
    prisma.ageficeProfile.count({ where: { organization: { tenantId } } }),
    prisma.person.count({ where: { tenantId, requiresCleanup: true } }),
    prisma.organization.count({ where: { tenantId, requiresCleanup: true } }),

    // CA prévisionnel : sessions futures, planifiées ou en cours
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: { session: { tenantId, status: { in: ['PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS'] } } },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: { session: { tenantId, startDate: { gt: now } } },
    }),

    // CA dans les 30 jours
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: { session: { tenantId, startDate: { gte: now, lte: in30 } } },
    }),
    // Sessions passées non encore facturées
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: {
        session: { tenantId, endDate: { lt: now } },
        invoiceSent: false,
      },
    }),

    // Sessions par mois (12 derniers + 6 prochains)
    prisma.$queryRaw<Array<{ month: Date; nb: bigint; revenue: number | null }>>`
      SELECT date_trunc('month', s."startDate") AS month,
             count(distinct s.id)::bigint AS nb,
             coalesce(sum(p."priceHT")::float8, 0) AS revenue
      FROM "TrainingSession" s
      LEFT JOIN "SessionParticipant" p ON p."sessionId" = s.id
      WHERE s."tenantId" = ${tenantId}
      GROUP BY date_trunc('month', s."startDate")
      ORDER BY month ASC
      LIMIT 24
    `,

    // Top 5 commanditaires
    prisma.$queryRaw<Array<{ orgId: string; legalName: string; sessions: bigint; revenue: number }>>`
      SELECT o.id AS "orgId", o."legalName", count(distinct p."sessionId")::bigint AS sessions,
             coalesce(sum(p."priceHT")::float8, 0) AS revenue
      FROM "Organization" o
      JOIN "SessionParticipant" p ON p."sponsorOrgId" = o.id
      WHERE o."tenantId" = ${tenantId}
      GROUP BY o.id, o."legalName"
      ORDER BY revenue DESC
      LIMIT 5
    `,

    // Top 5 produits
    prisma.$queryRaw<Array<{ productId: string; title: string; sessions: bigint; participants: bigint }>>`
      SELECT pr.id AS "productId", pr.title, count(distinct s.id)::bigint AS sessions,
             count(p.id)::bigint AS participants
      FROM "TrainingProduct" pr
      JOIN "TrainingSession" s ON s."productId" = pr.id
      LEFT JOIN "SessionParticipant" p ON p."sessionId" = s.id
      WHERE pr."tenantId" = ${tenantId} AND pr."isActive" = true
      GROUP BY pr.id, pr.title
      ORDER BY participants DESC
      LIMIT 5
    `,

    // Sessions récentes
    prisma.trainingSession.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
      take: 6,
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        status: true,
        _count: { select: { participants: true } },
        participants: { select: { priceHT: true } },
      },
    }),

    // Sessions à clore (passées non COMPLETED ni CANCELLED)
    prisma.trainingSession.count({
      where: {
        tenantId,
        endDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    }),
  ]);

  return {
    counts: {
      persons,
      orgs,
      products,
      sessions,
      upcomingSessions,
      sessionsToClose,
      eiOrganizations: eiOrgs,
      ageficeProfiles,
      cleanupPersons,
      cleanupOrgs,
    },
    ca: {
      forecast: Number(activeParticipants._sum.priceHT ?? 0) + Number(futureParticipants._sum.priceHT ?? 0),
      upcoming30days: Number(upcoming30Participants._sum.priceHT ?? 0),
      pastNotInvoiced: Number(pastNotInvoicedParticipants._sum.priceHT ?? 0),
      invoiced: 0, // alimenté quand le module Factures sera en place (lot 2)
      collected: 0,
      remaining: 0,
    },
    byMonth: sessionsByMonth.map((m) => ({
      month: `${MONTH_LABELS[m.month.getMonth()]} ${String(m.month.getFullYear()).substring(2)}`,
      sessions: Number(m.nb),
      revenue: Number(m.revenue ?? 0),
    })),
    topSponsors: topSponsorsRaw.map((s) => ({
      orgId: s.orgId,
      legalName: s.legalName,
      sessions: Number(s.sessions),
      revenue: Number(s.revenue),
    })),
    topProducts: topProductsRaw.map((p) => ({
      productId: p.productId,
      title: p.title,
      sessions: Number(p.sessions),
      participants: Number(p.participants),
    })),
    recentSessions: recentRaw.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      startDate: s.startDate,
      status: s.status,
      nbParticipants: s._count.participants,
      revenue: s.participants.reduce((acc, p) => acc + Number(p.priceHT), 0),
    })),
  };
}
