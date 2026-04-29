/**
 * Agrégations pour le dashboard de pilotage Start Academy.
 * Calculs côté serveur via Prisma.
 *
 * Filtre principal : année (basée sur TrainingSession.startDate).
 * year = null → toutes années confondues.
 */

import { prisma, Prisma } from '@qualiof/db';

export interface DashboardStats {
  filters: { year: number | null; availableYears: number[] };

  ca: {
    total: number; // CA prévu total (somme priceHT)
    signed: number; // sessions VALIDATED + IN_PROGRESS + COMPLETED
    upcoming: number; // sessions futures
    invoiced: number; // dossiers invoiceSent
    collected: number; // sum amountCollected
    remaining: number; // sum amountRemaining
    pastNotInvoiced: number; // passées non facturées (à facturer)
  };

  performance: {
    nbSessions: number;
    nbParticipants: number;
    avgRevenuePerSession: number;
    avgRevenuePerLearner: number;
    avgFillRate: number; // % capacité moyenne
    totalHours: number; // heures formées (durée formation × nb participants)
    revenuePerHour: number;
  };

  counts: {
    persons: number;
    orgs: number;
    products: number;
    eiOrganizations: number;
    ageficeProfiles: number;
    cleanupPersons: number;
    cleanupOrgs: number;
    upcomingSessions: number;
  };

  topSessions: Array<{
    id: string;
    code: string;
    name: string | null;
    startDate: Date;
    nbParticipants: number;
    revenue: number;
  }>;

  topProducts: Array<{
    productId: string;
    title: string;
    sessions: number;
    participants: number;
    revenue: number;
  }>;

  topSponsors: Array<{
    orgId: string;
    legalName: string;
    sessions: number;
    revenue: number;
  }>;

  byMonth: Array<{ month: string; sessions: number; revenue: number; collected: number }>;

  alerts: {
    pastWithoutInvoice: number;
    sessionsToClose: number;
    opcoMissingApproval: number; // dossiers OPCO sans validation
    sessionsNext7Days: number;
  };

  pipeline: {
    leadsToFollowup: number;
    preEnrollmentsToValidate: number;
    upcomingSessions: number;
    upcomingForecast: number;
  };

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

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function yearRange(year: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lt: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export async function getDashboardStats(
  tenantId: string,
  year: number | null = null,
): Promise<DashboardStats> {
  const now = new Date();
  const in7 = new Date(now);
  in7.setUTCDate(in7.getUTCDate() + 7);

  // Filtre session selon année
  const sessionWhere: Prisma.TrainingSessionWhereInput = { tenantId };
  if (year !== null) sessionWhere.startDate = yearRange(year);

  // Filtre participant via session.startDate
  const participantSessionFilter: Prisma.TrainingSessionWhereInput = { tenantId };
  if (year !== null) participantSessionFilter.startDate = yearRange(year);

  const [
    persons,
    orgs,
    products,
    eiOrgs,
    ageficeProfiles,
    cleanupPersons,
    cleanupOrgs,

    nbSessionsAgg,
    upcomingSessionsCount,
    capacityAndFillRate,
    productHoursAgg,

    totalRevenue,
    signedRevenue,
    upcomingRevenue,
    invoicedRevenue,
    collectedAgg,
    remainingAgg,
    pastNotInvoicedAgg,

    sessionsByMonth,
    topSessionsRaw,
    topSponsorsRaw,
    topProductsRaw,
    recentRaw,

    pastWithoutInvoice,
    sessionsToClose,
    opcoMissingApproval,
    sessionsNext7Days,

    leadsToFollowup,
    preEnrollmentsToValidate,
    upcomingForecastAgg,

    availableYearsRaw,
  ] = await Promise.all([
    prisma.person.count({ where: { tenantId, archived: false } }),
    prisma.organization.count({ where: { tenantId, archived: false } }),
    prisma.trainingProduct.count({ where: { tenantId, isActive: true } }),
    prisma.organization.count({
      where: { tenantId, archived: false, legalForm: { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] } },
    }),
    prisma.ageficeProfile.count({ where: { organization: { tenantId } } }),
    prisma.person.count({ where: { tenantId, requiresCleanup: true } }),
    prisma.organization.count({ where: { tenantId, requiresCleanup: true } }),

    // Performance
    prisma.trainingSession.count({ where: sessionWhere }),
    prisma.trainingSession.count({ where: { ...sessionWhere, startDate: { gt: now } } }),
    prisma.trainingSession.findMany({
      where: sessionWhere,
      select: {
        capacityMax: true,
        _count: { select: { participants: true } },
      },
    }),
    // Heures formées : durée produit × nb participants
    prisma.$queryRaw<Array<{ totalHours: number | null }>>`
      SELECT COALESCE(SUM(pr."durationHours" * (
        SELECT COUNT(*) FROM "SessionParticipant" sp WHERE sp."sessionId" = s.id
      ))::float8, 0) AS "totalHours"
      FROM "TrainingSession" s
      JOIN "TrainingProduct" pr ON pr.id = s."productId"
      WHERE s."tenantId" = ${tenantId}
      ${year !== null ? Prisma.sql`AND s."startDate" >= ${yearRange(year).gte} AND s."startDate" < ${yearRange(year).lt}` : Prisma.empty}
    `,

    // CA
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      _count: { id: true },
      where: { session: participantSessionFilter },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: {
        session: {
          ...participantSessionFilter,
          status: { in: ['VALIDATED', 'IN_PROGRESS', 'COMPLETED'] },
        },
      },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: { session: { ...participantSessionFilter, startDate: { gt: now } } },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: { session: participantSessionFilter, invoiceSent: true },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { amountCollected: true },
      where: { session: participantSessionFilter },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { amountRemaining: true },
      where: { session: participantSessionFilter },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: {
        session: { ...participantSessionFilter, endDate: { lt: now } },
        invoiceSent: false,
      },
    }),

    // CA par mois (raw SQL pour groupement)
    prisma.$queryRaw<Array<{ month: Date; nb: bigint; revenue: number | null; collected: number | null }>>`
      SELECT date_trunc('month', s."startDate") AS month,
             count(distinct s.id)::bigint AS nb,
             coalesce(sum(p."priceHT")::float8, 0) AS revenue,
             coalesce(sum(p."amountCollected")::float8, 0) AS collected
      FROM "TrainingSession" s
      LEFT JOIN "SessionParticipant" p ON p."sessionId" = s.id
      WHERE s."tenantId" = ${tenantId}
      ${year !== null ? Prisma.sql`AND s."startDate" >= ${yearRange(year).gte} AND s."startDate" < ${yearRange(year).lt}` : Prisma.empty}
      GROUP BY date_trunc('month', s."startDate")
      ORDER BY month ASC
    `,

    // Top 5 sessions rentables
    prisma.$queryRaw<Array<{ id: string; code: string; name: string | null; startDate: Date; nbParticipants: bigint; revenue: number }>>`
      SELECT s.id, s.code, s.name, s."startDate",
             count(p.id)::bigint AS "nbParticipants",
             coalesce(sum(p."priceHT")::float8, 0) AS revenue
      FROM "TrainingSession" s
      LEFT JOIN "SessionParticipant" p ON p."sessionId" = s.id
      WHERE s."tenantId" = ${tenantId}
      ${year !== null ? Prisma.sql`AND s."startDate" >= ${yearRange(year).gte} AND s."startDate" < ${yearRange(year).lt}` : Prisma.empty}
      GROUP BY s.id, s.code, s.name, s."startDate"
      ORDER BY revenue DESC
      LIMIT 5
    `,

    // Top 5 commanditaires
    prisma.$queryRaw<Array<{ orgId: string; legalName: string; sessions: bigint; revenue: number }>>`
      SELECT o.id AS "orgId", o."legalName", count(distinct p."sessionId")::bigint AS sessions,
             coalesce(sum(p."priceHT")::float8, 0) AS revenue
      FROM "Organization" o
      JOIN "SessionParticipant" p ON p."sponsorOrgId" = o.id
      JOIN "TrainingSession" s ON s.id = p."sessionId"
      WHERE o."tenantId" = ${tenantId}
      ${year !== null ? Prisma.sql`AND s."startDate" >= ${yearRange(year).gte} AND s."startDate" < ${yearRange(year).lt}` : Prisma.empty}
      GROUP BY o.id, o."legalName"
      ORDER BY revenue DESC
      LIMIT 5
    `,

    // Top 5 produits
    prisma.$queryRaw<Array<{ productId: string; title: string; sessions: bigint; participants: bigint; revenue: number }>>`
      SELECT pr.id AS "productId", pr.title,
             count(distinct s.id)::bigint AS sessions,
             count(p.id)::bigint AS participants,
             coalesce(sum(p."priceHT")::float8, 0) AS revenue
      FROM "TrainingProduct" pr
      JOIN "TrainingSession" s ON s."productId" = pr.id
      LEFT JOIN "SessionParticipant" p ON p."sessionId" = s.id
      WHERE pr."tenantId" = ${tenantId}
      ${year !== null ? Prisma.sql`AND s."startDate" >= ${yearRange(year).gte} AND s."startDate" < ${yearRange(year).lt}` : Prisma.empty}
      GROUP BY pr.id, pr.title
      ORDER BY revenue DESC
      LIMIT 5
    `,

    // Sessions récentes
    prisma.trainingSession.findMany({
      where: sessionWhere,
      orderBy: { startDate: 'desc' },
      take: 6,
      select: {
        id: true, code: true, name: true, startDate: true, status: true,
        _count: { select: { participants: true } },
        participants: { select: { priceHT: true } },
      },
    }),

    // Alertes
    prisma.trainingSession.count({
      where: { ...sessionWhere, endDate: { lt: now }, participants: { some: { invoiceSent: false } } },
    }),
    prisma.trainingSession.count({
      where: { ...sessionWhere, endDate: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    prisma.sessionParticipant.count({
      where: {
        session: { ...participantSessionFilter, endDate: { lt: now } },
        opcoApproved: false,
        sponsorOrg: { opcoCode: { not: null } },
      },
    }),
    prisma.trainingSession.count({
      where: { ...sessionWhere, startDate: { gte: now, lte: in7 } },
    }),

    // Pipeline
    prisma.lead.count({
      where: { tenantId, status: { in: ['NEW', 'CONTACTED', 'TO_FOLLOWUP', 'RDV', 'HOT'] } },
    }),
    prisma.preEnrollment.count({
      where: { tenantId, status: { in: ['SUBMITTED', 'EXTRACTING', 'EXTRACTED'] } },
    }),
    prisma.sessionParticipant.aggregate({
      _sum: { priceHT: true },
      where: { session: { tenantId, startDate: { gt: now } } },
    }),

    // Liste des années avec données (pour le sélecteur)
    prisma.$queryRaw<Array<{ year: number }>>`
      SELECT DISTINCT EXTRACT(YEAR FROM "startDate")::int AS year
      FROM "TrainingSession"
      WHERE "tenantId" = ${tenantId}
      ORDER BY year DESC
    `,
  ]);

  // Calculs dérivés
  const nbSessions = nbSessionsAgg;
  const totalRev = Number(totalRevenue._sum.priceHT ?? 0);
  const nbPart = totalRevenue._count.id;
  const avgRevPerSession = nbSessions > 0 ? totalRev / nbSessions : 0;
  const avgRevPerLearner = nbPart > 0 ? totalRev / nbPart : 0;
  const totalCapacity = capacityAndFillRate.reduce((s, x) => s + (x.capacityMax ?? 0), 0);
  const totalActual = capacityAndFillRate.reduce((s, x) => s + x._count.participants, 0);
  const avgFillRate = totalCapacity > 0 ? (totalActual / totalCapacity) * 100 : 0;
  const totalHours = Number(productHoursAgg[0]?.totalHours ?? 0);
  const revenuePerHour = totalHours > 0 ? totalRev / totalHours : 0;

  return {
    filters: {
      year,
      availableYears: availableYearsRaw.map((y) => y.year),
    },
    ca: {
      total: totalRev,
      signed: Number(signedRevenue._sum.priceHT ?? 0),
      upcoming: Number(upcomingRevenue._sum.priceHT ?? 0),
      invoiced: Number(invoicedRevenue._sum.priceHT ?? 0),
      collected: Number(collectedAgg._sum.amountCollected ?? 0),
      remaining: Number(remainingAgg._sum.amountRemaining ?? 0),
      pastNotInvoiced: Number(pastNotInvoicedAgg._sum.priceHT ?? 0),
    },
    performance: {
      nbSessions,
      nbParticipants: nbPart,
      avgRevenuePerSession: avgRevPerSession,
      avgRevenuePerLearner: avgRevPerLearner,
      avgFillRate,
      totalHours,
      revenuePerHour,
    },
    counts: {
      persons,
      orgs,
      products,
      eiOrganizations: eiOrgs,
      ageficeProfiles,
      cleanupPersons,
      cleanupOrgs,
      upcomingSessions: upcomingSessionsCount,
    },
    topSessions: topSessionsRaw.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      startDate: s.startDate,
      nbParticipants: Number(s.nbParticipants),
      revenue: Number(s.revenue),
    })),
    topProducts: topProductsRaw.map((p) => ({
      productId: p.productId,
      title: p.title,
      sessions: Number(p.sessions),
      participants: Number(p.participants),
      revenue: Number(p.revenue),
    })),
    topSponsors: topSponsorsRaw.map((s) => ({
      orgId: s.orgId,
      legalName: s.legalName,
      sessions: Number(s.sessions),
      revenue: Number(s.revenue),
    })),
    byMonth: sessionsByMonth.map((m) => ({
      month: `${MONTH_LABELS[m.month.getMonth()]} ${String(m.month.getFullYear()).substring(2)}`,
      sessions: Number(m.nb),
      revenue: Number(m.revenue ?? 0),
      collected: Number(m.collected ?? 0),
    })),
    alerts: {
      pastWithoutInvoice,
      sessionsToClose,
      opcoMissingApproval,
      sessionsNext7Days,
    },
    pipeline: {
      leadsToFollowup,
      preEnrollmentsToValidate,
      upcomingSessions: upcomingSessionsCount,
      upcomingForecast: Number(upcomingForecastAgg._sum.priceHT ?? 0),
    },
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
