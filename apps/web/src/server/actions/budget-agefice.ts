'use server';

/**
 * Calcul du budget AGEFICE consommé / restant par apprenant sur l'année
 * civile en cours. Plafond 3000€/an/apprenant (validé par Laurent
 * 30/04/2026).
 *
 * Le budget est attaché au stagiaire en tant qu'auto-entrepreneur (EI),
 * pas à l'org Start Academy. Donc on agrège par Person.
 */

import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export const PLAFOND_AGEFICE = 3000;

export interface LearnerBudgetRow {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  consomme: number;        // € HT cette année calendaire
  nbSessions: number;
  restant: number;         // 3000 - consomme (max 0)
  pct: number;             // % consommé
  status: 'free' | 'low' | 'mid' | 'near_limit' | 'over';
}

function categorize(pct: number): LearnerBudgetRow['status'] {
  if (pct === 0) return 'free';
  if (pct >= 100) return 'over';
  if (pct >= 90) return 'near_limit';
  if (pct >= 60) return 'mid';
  return 'low';
}

/**
 * Liste les apprenants AGEFICE avec leur budget pour l'année courante.
 * Inclut tous les apprenants ayant au moins UN LegalLink EI_SELF (= ils
 * sont éligibles AGEFICE), même s'ils n'ont rien consommé cette année
 * — c'est exactement le cas d'usage : repérer les budgets non consommés
 * pour relancer les apprenants.
 */
export async function listLearnersWithAgeficeBudget(opts?: {
  year?: number;
  search?: string;
  filter?: 'all' | 'has_budget_left' | 'no_consumption' | 'near_limit' | 'over';
}): Promise<LearnerBudgetRow[]> {
  const { user } = await validateRequest();
  if (!user) return [];

  const year = opts?.year ?? new Date().getFullYear();
  const search = opts?.search?.trim();

  // 1. Tous les Persons éligibles AGEFICE = ils ont au moins un LegalLink EI_SELF
  const persons = await prisma.person.findMany({
    where: {
      tenantId: user.tenantId,
      archived: false,
      legalLinks: { some: { role: 'EI_SELF' } },
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  if (persons.length === 0) return [];

  // 2. Agrégat des participations AGEFICE de l'année calendaire
  const personIds = persons.map((p) => p.id);
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const aggregates = await prisma.sessionParticipant.groupBy({
    by: ['personId'],
    where: {
      personId: { in: personIds },
      sponsorOrg: { opcoCode: 'AGEFICE' },
      session: { startDate: { gte: yearStart, lt: yearEnd } },
    },
    _sum: { priceHT: true },
    _count: { id: true },
  });

  const aggMap = new Map<string, { sum: number; count: number }>();
  for (const a of aggregates) {
    aggMap.set(a.personId, {
      sum: Number(a._sum.priceHT ?? 0),
      count: a._count.id,
    });
  }

  const rows: LearnerBudgetRow[] = persons.map((p) => {
    const agg = aggMap.get(p.id);
    const consomme = agg?.sum ?? 0;
    const nbSessions = agg?.count ?? 0;
    const restant = Math.max(0, PLAFOND_AGEFICE - consomme);
    const pct = Math.min(999, Math.round((consomme / PLAFOND_AGEFICE) * 100));
    return {
      personId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      consomme,
      nbSessions,
      restant,
      pct,
      status: categorize(pct),
    };
  });

  const filter = opts?.filter ?? 'all';
  const filtered = rows.filter((r) => {
    switch (filter) {
      case 'has_budget_left':
        return r.consomme < PLAFOND_AGEFICE;
      case 'no_consumption':
        return r.consomme === 0;
      case 'near_limit':
        return r.pct >= 90 && r.pct < 100;
      case 'over':
        return r.consomme > PLAFOND_AGEFICE;
      default:
        return true;
    }
  });

  // Tri pertinent : par budget restant DESC (les plus de potentiel d'abord),
  // puis par nom à égalité.
  return filtered.sort((a, b) => {
    if (b.restant !== a.restant) return b.restant - a.restant;
    return a.lastName.localeCompare(b.lastName);
  });
}

/**
 * KPI agrégé : combien d'apprenants éligibles, combien ont du budget
 * restant, combien sont au plafond, total restant à mobiliser.
 */
export async function getAgeficeBudgetSummary(year?: number): Promise<{
  totalLearners: number;
  withBudgetLeft: number;
  noConsumption: number;
  nearLimit: number;
  totalConsumed: number;
  totalRemaining: number;
}> {
  const rows = await listLearnersWithAgeficeBudget({ year });
  return {
    totalLearners: rows.length,
    withBudgetLeft: rows.filter((r) => r.consomme < PLAFOND_AGEFICE).length,
    noConsumption: rows.filter((r) => r.consomme === 0).length,
    nearLimit: rows.filter((r) => r.pct >= 90 && r.pct < 100).length,
    totalConsumed: rows.reduce((s, r) => s + r.consomme, 0),
    totalRemaining: rows.reduce((s, r) => s + r.restant, 0),
  };
}
