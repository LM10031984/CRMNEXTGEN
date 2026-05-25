import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9.1 Plan 09.1-05 Task 1 — tests des helpers `product-stats.ts`.
 *
 * Coverage (CENTRAL-04 + CENTRAL-05) :
 *  - Test 1 : `getProductStats` retourne la shape `{ sessionsRealisees, apprenantsFormesTotal, heuresTotales, caCumule, firstYear }`
 *  - Test 2 : sessionsRealisees = count `TrainingSession where productId AND status='COMPLETED' AND tenantId`
 *  - Test 3 : apprenantsFormesTotal = count DISTINCT `SessionParticipant.personId where session.productId AND tenantId`
 *  - Test 4 : heuresTotales = `sessionsRealisees * product.durationHours`
 *  - Test 5 : caCumule = sum `SessionParticipant.priceHT where session.productId AND session.tenantId` (Decimal → Number) — refactor 2026-05-23 : Invoice.amountHT PAID inopérant (peu d'Invoices PAID en BDD), SP.priceHT = source de vérité prix négocié, aligné Tréso AGEFICE
 *  - Test 6 : `listProductSessions` retourne liste triée desc startDate
 *  - Test 7 : `listProductLearners` retourne liste DISTINCT personId + sessionsCount
 *  - Test 8 : Cross-tenant — toutes queries scopent par tenantId (filtre tenantId présent dans where)
 *
 * Stratégie de mock : on remplace `@qualiof/db` par un singleton prisma dont les
 * méthodes utilisées sont des `vi.fn()`. On contrôle les retours par test et on
 * inspecte les `where` passés pour vérifier le filtre `tenantId`.
 *
 * Pattern repris de `lead-load-stats.test.ts` (Phase 9 Plan 09-01).
 */

vi.mock('@qualiof/db', () => {
  return {
    prisma: {
      trainingSession: {
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      sessionParticipant: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
        aggregate: vi.fn(),
      },
      invoice: {
        aggregate: vi.fn(),
      },
      trainingProduct: {
        findUnique: vi.fn(),
      },
      person: {
        findMany: vi.fn(),
      },
    },
  };
});

import { prisma } from '@qualiof/db';
import {
  getProductStats,
  listProductSessions,
  listProductLearners,
} from '../product-stats';

// Typage helpers pour inspecter / contrôler les mocks.
const sessionCount = prisma.trainingSession.count as unknown as ReturnType<typeof vi.fn>;
const sessionFindMany = prisma.trainingSession.findMany as unknown as ReturnType<typeof vi.fn>;
const sessionFindFirst = prisma.trainingSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const participantFindMany = prisma.sessionParticipant.findMany as unknown as ReturnType<typeof vi.fn>;
const participantGroupBy = prisma.sessionParticipant.groupBy as unknown as ReturnType<typeof vi.fn>;
const invoiceAggregate = prisma.invoice.aggregate as unknown as ReturnType<typeof vi.fn>;
const participantAggregate = prisma.sessionParticipant.aggregate as unknown as ReturnType<typeof vi.fn>;
const productFindUnique = prisma.trainingProduct.findUnique as unknown as ReturnType<typeof vi.fn>;
const personFindMany = prisma.person.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionCount.mockReset();
  sessionFindMany.mockReset();
  sessionFindFirst.mockReset();
  participantFindMany.mockReset();
  participantGroupBy.mockReset();
  invoiceAggregate.mockReset();
  participantAggregate.mockReset();
  productFindUnique.mockReset();
  personFindMany.mockReset();
});

describe('getProductStats', () => {
  function setupHappyPath() {
    sessionCount.mockResolvedValueOnce(12);
    participantFindMany.mockResolvedValueOnce([
      { personId: 'p1' },
      { personId: 'p2' },
      { personId: 'p3' },
    ]);
    participantAggregate.mockResolvedValueOnce({ _sum: { priceHT: 28500 } });
    sessionFindFirst.mockResolvedValueOnce({ startDate: new Date('2024-03-15T00:00:00Z') });
    productFindUnique.mockResolvedValueOnce({ durationHours: 14 });
  }

  it('Test 1 — retourne la shape complète { sessionsRealisees, apprenantsFormesTotal, heuresTotales, caCumule, firstYear }', async () => {
    setupHappyPath();
    const stats = await getProductStats('prod1', 'tenant1');

    expect(stats).toHaveProperty('sessionsRealisees');
    expect(stats).toHaveProperty('apprenantsFormesTotal');
    expect(stats).toHaveProperty('heuresTotales');
    expect(stats).toHaveProperty('caCumule');
    expect(stats).toHaveProperty('firstYear');
  });

  it("Test 2 — sessionsRealisees = count TrainingSession (productId, status='COMPLETED', tenantId)", async () => {
    setupHappyPath();
    const stats = await getProductStats('prod1', 'tenant1');

    expect(stats.sessionsRealisees).toBe(12);
    const where = sessionCount.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: 'tenant1', productId: 'prod1', status: 'COMPLETED' });
  });

  it('Test 3 — apprenantsFormesTotal = count DISTINCT personId (scope productId via session)', async () => {
    setupHappyPath();
    const stats = await getProductStats('prod1', 'tenant1');

    expect(stats.apprenantsFormesTotal).toBe(3); // 3 personIds distincts mockés
    const args = participantFindMany.mock.calls[0]?.[0];
    expect(args?.distinct).toEqual(['personId']);
    // Scope croisé tenant + product via session relation
    expect(args?.where).toMatchObject({
      session: { tenantId: 'tenant1', productId: 'prod1' },
    });
  });

  it('Test 4 — heuresTotales = sessionsRealisees * product.durationHours', async () => {
    setupHappyPath(); // 12 sessions × 14h = 168
    const stats = await getProductStats('prod1', 'tenant1');

    expect(stats.heuresTotales).toBe(12 * 14);
  });

  it('Test 5 — caCumule = sum SessionParticipant.priceHT (scope session.tenant + session.product), converti en Number', async () => {
    setupHappyPath();
    const stats = await getProductStats('prod1', 'tenant1');

    expect(stats.caCumule).toBe(28500);
    expect(typeof stats.caCumule).toBe('number'); // pas un Decimal
    const args = participantAggregate.mock.calls[0]?.[0];
    expect(args?._sum).toEqual({ priceHT: true });
    // Scope croisé tenant + product via session relation (pas de filtre status — SP = prix négocié)
    expect(args?.where).toMatchObject({
      session: { tenantId: 'tenant1', productId: 'prod1' },
    });
  });

  it('Test 6 — caCumule = 0 quand aucun participant facturable (sum null)', async () => {
    sessionCount.mockResolvedValueOnce(0);
    participantFindMany.mockResolvedValueOnce([]);
    participantAggregate.mockResolvedValueOnce({ _sum: { priceHT: null } });
    sessionFindFirst.mockResolvedValueOnce(null);
    productFindUnique.mockResolvedValueOnce({ durationHours: 7 });

    const stats = await getProductStats('prod-empty', 'tenant1');

    expect(stats.caCumule).toBe(0);
    expect(stats.sessionsRealisees).toBe(0);
    expect(stats.apprenantsFormesTotal).toBe(0);
    expect(stats.heuresTotales).toBe(0);
  });

  it('Test 7 — firstYear extrait depuis la 1re session (ASC startDate)', async () => {
    setupHappyPath();
    const stats = await getProductStats('prod1', 'tenant1');

    expect(stats.firstYear).toBe(2024); // 2024-03-15
    const args = sessionFindFirst.mock.calls[0]?.[0];
    expect(args?.orderBy).toEqual({ startDate: 'asc' });
    expect(args?.where).toMatchObject({ tenantId: 'tenant1', productId: 'prod1' });
  });

  it("Test 8 — firstYear = année courante si pas de session jamais créée (fallback)", async () => {
    sessionCount.mockResolvedValueOnce(0);
    participantFindMany.mockResolvedValueOnce([]);
    participantAggregate.mockResolvedValueOnce({ _sum: { priceHT: null } });
    sessionFindFirst.mockResolvedValueOnce(null);
    productFindUnique.mockResolvedValueOnce({ durationHours: 7 });

    const stats = await getProductStats('prod-new', 'tenant1');
    expect(stats.firstYear).toBe(new Date().getFullYear());
  });
});

describe('listProductSessions', () => {
  it('Test 9 — retourne liste triée DESC startDate avec participantsCount', async () => {
    sessionFindMany.mockResolvedValueOnce([
      {
        id: 's2',
        code: 'SES-002',
        startDate: new Date('2025-09-01T00:00:00Z'),
        endDate: new Date('2025-09-05T00:00:00Z'),
        status: 'COMPLETED',
        _count: { participants: 5 },
      },
      {
        id: 's1',
        code: 'SES-001',
        startDate: new Date('2024-03-15T00:00:00Z'),
        endDate: new Date('2024-03-19T00:00:00Z'),
        status: 'COMPLETED',
        _count: { participants: 4 },
      },
    ]);

    const rows = await listProductSessions('prod1', 'tenant1');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: 's2',
      code: 'SES-002',
      startDate: new Date('2025-09-01T00:00:00Z'),
      endDate: new Date('2025-09-05T00:00:00Z'),
      status: 'COMPLETED',
      participantsCount: 5,
    });
    expect(rows[1]?.id).toBe('s1');

    // Scope tenant + product + ordre desc
    const args = sessionFindMany.mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ tenantId: 'tenant1', productId: 'prod1' });
    expect(args?.orderBy).toEqual({ startDate: 'desc' });
  });

  it('Test 10 — liste vide si aucune session pour ce produit', async () => {
    sessionFindMany.mockResolvedValueOnce([]);
    const rows = await listProductSessions('prod-empty', 'tenant1');
    expect(rows).toEqual([]);
  });
});

describe('listProductLearners', () => {
  it('Test 11 — groupBy personId puis hydrate avec Person + sort desc lastSessionDate', async () => {
    participantGroupBy.mockResolvedValueOnce([
      { personId: 'p1', _count: { _all: 2 }, _max: { createdAt: new Date('2025-01-15') } },
      { personId: 'p2', _count: { _all: 1 }, _max: { createdAt: new Date('2025-06-20') } },
    ]);
    personFindMany.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Alice', lastName: 'Martin', email: 'alice@example.com' },
      { id: 'p2', firstName: 'Bob', lastName: 'Durand', email: null },
    ]);

    const rows = await listProductLearners('prod1', 'tenant1');

    expect(rows).toHaveLength(2);
    // p2 first (lastSessionDate 2025-06 > 2025-01)
    expect(rows[0]).toEqual({
      personId: 'p2',
      firstName: 'Bob',
      lastName: 'Durand',
      email: null,
      sessionsCount: 1,
      lastSessionDate: new Date('2025-06-20'),
    });
    expect(rows[1]?.personId).toBe('p1');
    expect(rows[1]?.sessionsCount).toBe(2);

    // Scope tenant + product via session relation
    const args = participantGroupBy.mock.calls[0]?.[0];
    expect(args?.by).toEqual(['personId']);
    expect(args?.where).toMatchObject({
      session: { tenantId: 'tenant1', productId: 'prod1' },
    });
  });

  it("Test 12 — Cross-tenant : person introuvable (ex. supprimé / autre tenant) → exclu du résultat", async () => {
    participantGroupBy.mockResolvedValueOnce([
      { personId: 'p1', _count: { _all: 1 }, _max: { createdAt: new Date('2025-01-15') } },
      { personId: 'ghost', _count: { _all: 1 }, _max: { createdAt: new Date('2025-02-15') } },
    ]);
    personFindMany.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Alice', lastName: 'Martin', email: null },
      // ghost absent
    ]);

    const rows = await listProductLearners('prod1', 'tenant1');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.personId).toBe('p1');
  });

  it('Test 13 — liste vide si aucun participant pour ce produit', async () => {
    participantGroupBy.mockResolvedValueOnce([]);
    personFindMany.mockResolvedValueOnce([]);
    const rows = await listProductLearners('prod-empty', 'tenant1');
    expect(rows).toEqual([]);
  });
});
