import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9 Plan 09-01 Task 3 — tests `getCommercialsWithKpis`.
 *
 * Coverage :
 *  - Test 1 : tenant sans commercial → []
 *  - Test 2 : tenant avec 2 commerciaux + 4 leads variés → KPI agrégés corrects
 *  - Test 3 : tenant avec commercial sans leads → KPI à 0 / avgDaysToWin null
 *
 * Stratégie de mock : on remplace `@qualiof/db` par un objet exposant un
 * prisma singleton dont les méthodes utilisées (`user.findMany`, `lead.groupBy`,
 * `$queryRaw`) sont des `vi.fn()`. On contrôle les retours par test.
 */

vi.mock('@qualiof/db', () => {
  return {
    prisma: {
      user: { findMany: vi.fn() },
      lead: { groupBy: vi.fn() },
      $queryRaw: vi.fn(),
    },
  };
});

import { prisma } from '@qualiof/db';
import { getCommercialsWithKpis } from '../lead-load-stats';

const userFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const leadGroupBy = prisma.lead.groupBy as unknown as ReturnType<typeof vi.fn>;
const dollarQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  userFindMany.mockReset();
  leadGroupBy.mockReset();
  dollarQueryRaw.mockReset();
});

describe('getCommercialsWithKpis', () => {
  it('Test 1 — tenant sans commercial → tableau vide', async () => {
    userFindMany.mockResolvedValueOnce([]);

    const result = await getCommercialsWithKpis('tenant1');

    expect(result).toEqual([]);
    // Optim : on ne doit pas appeler groupBy si pas de commerciaux
    expect(leadGroupBy).not.toHaveBeenCalled();
    expect(dollarQueryRaw).not.toHaveBeenCalled();
  });

  it('Test 2 — 2 commerciaux + leads variés → KPI agrégés corrects', async () => {
    // Setup : Alice (4 leads actifs + 2 WON ce mois + 1 WON ancien) ; Bob (1 lead actif + 0 WON)
    userFindMany.mockResolvedValueOnce([
      { id: 'alice', firstName: 'Alice', lastName: 'Martin' },
      { id: 'bob', firstName: 'Bob', lastName: 'Durand' },
    ]);

    // Promise.all retourne les 4 résultats dans l'ordre.
    // groupBy est appelé 3 fois (active, wonThisMonth, totals). On utilise
    // mockResolvedValueOnce 3 fois dans le bon ordre + 1 fois $queryRaw.
    leadGroupBy
      // (1) active = leads en cours
      .mockResolvedValueOnce([
        { ownerUserId: 'alice', _count: { _all: 4 } },
        { ownerUserId: 'bob', _count: { _all: 1 } },
      ])
      // (2) wonThisMonth
      .mockResolvedValueOnce([{ ownerUserId: 'alice', _count: { _all: 2 } }])
      // (3) totals (ownerUserId + status)
      // Alice : 4 actifs + 3 WON + 1 LOST = 8 total ; conversion = 3/8 = 37.5% → round = 38
      // Bob : 1 actif + 0 WON = 1 total ; conversion = 0/1 = 0%
      .mockResolvedValueOnce([
        { ownerUserId: 'alice', status: 'NEW', _count: { _all: 4 } },
        { ownerUserId: 'alice', status: 'WON', _count: { _all: 3 } },
        { ownerUserId: 'alice', status: 'LOST', _count: { _all: 1 } },
        { ownerUserId: 'bob', status: 'NEW', _count: { _all: 1 } },
      ]);

    // $queryRaw : avgDaysToWin par owner
    dollarQueryRaw.mockResolvedValueOnce([{ ownerUserId: 'alice', avgDays: 12.7 }]);

    const result = await getCommercialsWithKpis('tenant1');

    expect(result).toHaveLength(2);
    const alice = result.find((r) => r.userId === 'alice');
    const bob = result.find((r) => r.userId === 'bob');

    expect(alice).toBeDefined();
    expect(alice?.name).toBe('Alice Martin');
    expect(alice?.kpis.leadsActifs).toBe(4);
    expect(alice?.kpis.leadsWonThisMonth).toBe(2);
    // 3/8 = 0.375 → round(0.375 * 100) = 38
    expect(alice?.kpis.conversionPct).toBe(38);
    // 12.7 → round = 13
    expect(alice?.kpis.avgDaysToWin).toBe(13);

    expect(bob).toBeDefined();
    expect(bob?.name).toBe('Bob Durand');
    expect(bob?.kpis.leadsActifs).toBe(1);
    expect(bob?.kpis.leadsWonThisMonth).toBe(0);
    expect(bob?.kpis.conversionPct).toBe(0);
    expect(bob?.kpis.avgDaysToWin).toBe(null);
  });

  it('Test 3 — commercial sans aucun lead → KPI 0 / avgDaysToWin null', async () => {
    userFindMany.mockResolvedValueOnce([
      { id: 'solo', firstName: 'Carol', lastName: 'Renard' },
    ]);
    leadGroupBy
      .mockResolvedValueOnce([]) // active
      .mockResolvedValueOnce([]) // wonThisMonth
      .mockResolvedValueOnce([]); // totals
    dollarQueryRaw.mockResolvedValueOnce([]); // avgDaysToWin

    const result = await getCommercialsWithKpis('tenant1');

    expect(result).toHaveLength(1);
    const carol = result[0]!;
    expect(carol.userId).toBe('solo');
    expect(carol.name).toBe('Carol Renard');
    expect(carol.kpis.leadsActifs).toBe(0);
    expect(carol.kpis.leadsWonThisMonth).toBe(0);
    expect(carol.kpis.conversionPct).toBe(0);
    expect(carol.kpis.avgDaysToWin).toBe(null);
  });
});
