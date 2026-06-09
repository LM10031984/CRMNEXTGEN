import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-08 Task 1 — Server action `getInvoicesListData`.
 *
 * Stratégie de mock (pattern Phase 11 invoice-settings.test.ts) :
 *  - `@qualiof/db` → prisma mocké (invoice.aggregate / findMany / count, $queryRaw, sessionParticipant.count)
 *  - `@/lib/auth` → validateRequest mocké (default = ADMIN authentifié)
 *
 * Coverage (11 tests acceptance du PLAN) :
 *  1. KPI caMois = sum(amountTTC) Invoice WHERE status ∈ {ISSUED, PAID, PARTIAL} AND issueDate dans mois courant
 *  2. KPI impayesAmount = sum(amountTTC - amountPaid) WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}
 *  3. KPI impayesCount = count des mêmes
 *  4. KPI dsoMoyen = avg(paidAt - issueDate) en jours (raw query) — null si aucune
 *  5. KPI aFacturerCount = count SessionParticipant.enrollmentStatus=ATTENDED sans Invoice
 *  6. Filtre statuses multiple appliqué
 *  7. Filtre from/to appliqué sur issueDate
 *  8. Filtre payerOrgId appliqué
 *  9. onlyUnpaid override statuses → ISSUED+PARTIAL+OVERDUE
 * 10. Tri par défaut [{ issueDate: 'desc' }, { number: 'desc' }]
 * 11. Pagination via skip/take
 *
 * Note D-Phase11-DEV : `EnrollmentStatus.COMPLETED` n'existe pas dans le schema Prisma
 * (enum = PRE_ENROLLED, CONFIRMED, ATTENDED, CANCELLED, NO_SHOW). On utilise `ATTENDED`
 * comme équivalent sémantique de "formation terminée" (pattern Phase 6 product-satisfaction-panel.tsx
 * et lib/qualiopi-bilan-stats.ts).
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    invoice: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    sessionParticipant: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  // P1.1 — Zod runtime nécessite l'enum InvoiceStatus comme valeur, pas
  // juste un type. On mappe key=value pour matcher la forme générée par
  // Prisma client.
  InvoiceStatus: {
    DRAFT: 'DRAFT',
    ISSUED: 'ISSUED',
    PAID: 'PAID',
    PARTIAL: 'PARTIAL',
    OVERDUE: 'OVERDUE',
    CANCELLED: 'CANCELLED',
    CREDIT_NOTE: 'CREDIT_NOTE',
  },
  Prisma: { Decimal: class {} },
  LegalForm: {
    SAS: 'SAS',
    SARL: 'SARL',
    SASU: 'SASU',
    EURL: 'EURL',
    SA: 'SA',
    EI: 'EI',
    EIRL: 'EIRL',
    AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
    AUTRE: 'AUTRE',
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
}));

vi.mock('@/lib/auth', () => ({
  lucia: {},
  validateRequest: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { getInvoicesListData } from '../invoices-list';

const aggregateMock = prisma.invoice.aggregate as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const invoiceCountMock = prisma.invoice.count as unknown as ReturnType<typeof vi.fn>;
const queryRawMock = (prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw;
const spCountMock = prisma.sessionParticipant.count as unknown as ReturnType<typeof vi.fn>;
const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  role: 'ADMIN',
  email: 'admin@x.fr',
  firstName: 'A',
  lastName: 'D',
};

function defaultMocks() {
  // 2 aggregates : caMois + impayesAgg (l'ordre dépend de Promise.all)
  aggregateMock.mockReset();
  aggregateMock.mockResolvedValue({
    _sum: { amountTTC: null, amountPaid: null },
    _count: { _all: 0 },
  });
  queryRawMock.mockReset();
  queryRawMock.mockResolvedValue([{ avg_days: null }]);
  spCountMock.mockReset();
  spCountMock.mockResolvedValue(0);
  findManyMock.mockReset();
  findManyMock.mockResolvedValue([]);
  invoiceCountMock.mockReset();
  invoiceCountMock.mockResolvedValue(0);
}

beforeEach(() => {
  validateRequestMock.mockReset();
  validateRequestMock.mockResolvedValue({ user: FAKE_USER, session: { id: 's1' } });
  defaultMocks();
});

describe('getInvoicesListData — KPI', () => {
  it("Test 1 — KPI caMois = sum(amountTTC) Invoice WHERE status ∈ {ISSUED,PAID,PARTIAL} AND issueDate dans mois courant", async () => {
    // 1er appel aggregate = caMois ; 2e appel = impayesAgg
    aggregateMock
      .mockResolvedValueOnce({ _sum: { amountTTC: 12500 } })
      .mockResolvedValueOnce({
        _sum: { amountTTC: 0, amountPaid: 0 },
        _count: { _all: 0 },
      });

    const result = await getInvoicesListData({
      filters: {},
      page: 1,
      pageSize: 50,
    });

    expect(result.kpis.caMois).toBe(12500);
    // Vérifie le WHERE du 1er aggregate (caMois)
    expect(aggregateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: { in: ['ISSUED', 'PAID', 'PARTIAL'] },
          issueDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
        _sum: { amountTTC: true },
      }),
    );
  });

  it('Test 2 — KPI impayesAmount = sum(amountTTC - amountPaid) WHERE status ∈ {ISSUED,PARTIAL,OVERDUE}', async () => {
    aggregateMock
      .mockResolvedValueOnce({ _sum: { amountTTC: 0 } })
      .mockResolvedValueOnce({
        _sum: { amountTTC: 1000, amountPaid: 300 },
        _count: { _all: 5 },
      });

    const result = await getInvoicesListData({
      filters: {},
      page: 1,
      pageSize: 50,
    });

    expect(result.kpis.impayesAmount).toBe(700);
    // Vérifie WHERE du 2e aggregate (impayes)
    expect(aggregateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        }),
      }),
    );
  });

  it('Test 3 — KPI impayesCount = _count._all du 2e aggregate', async () => {
    aggregateMock
      .mockResolvedValueOnce({ _sum: { amountTTC: 0 } })
      .mockResolvedValueOnce({
        _sum: { amountTTC: 0, amountPaid: 0 },
        _count: { _all: 7 },
      });

    const result = await getInvoicesListData({
      filters: {},
      page: 1,
      pageSize: 50,
    });

    expect(result.kpis.impayesCount).toBe(7);
  });

  it('Test 4 — KPI dsoMoyen via $queryRaw (avg paidAt-issueDate en jours), null si aucune', async () => {
    // null branch
    queryRawMock.mockResolvedValueOnce([{ avg_days: null }]);
    const r1 = await getInvoicesListData({ filters: {}, page: 1, pageSize: 50 });
    expect(r1.kpis.dsoMoyen).toBeNull();
    expect(queryRawMock).toHaveBeenCalled();

    // Vérifie qu'on a bien utilisé EXTRACT(EPOCH FROM ...) dans la raw query
    // (le 1er argument est un TemplateStringsArray)
    const rawCallArg = queryRawMock.mock.calls[0]![0] as TemplateStringsArray;
    const rawSrc = Array.from(rawCallArg).join('?');
    expect(rawSrc).toContain('EXTRACT(EPOCH FROM');
    expect(rawSrc).toContain('86400');

    // valeur non nulle branche : Math.round
    queryRawMock.mockResolvedValueOnce([{ avg_days: 28.7 }]);
    const r2 = await getInvoicesListData({ filters: {}, page: 1, pageSize: 50 });
    expect(r2.kpis.dsoMoyen).toBe(29);
  });

  it("Test 5 — KPI aFacturerCount = count SessionParticipant.enrollmentStatus=ATTENDED sans Invoice", async () => {
    spCountMock.mockResolvedValueOnce(4);

    const result = await getInvoicesListData({
      filters: {},
      page: 1,
      pageSize: 50,
    });

    expect(result.kpis.aFacturerCount).toBe(4);
    expect(spCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: { tenantId: 'tenant-1' },
          enrollmentStatus: 'ATTENDED',
          invoices: { none: {} },
        }),
      }),
    );
  });
});

describe('getInvoicesListData — Filtres + Tri + Pagination', () => {
  it("Test 6 — filtre statuses multiple appliqué dans le WHERE findMany/count", async () => {
    await getInvoicesListData({
      filters: { statuses: ['ISSUED', 'OVERDUE'] as never },
      page: 1,
      pageSize: 50,
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: { in: ['ISSUED', 'OVERDUE'] },
        }),
      }),
    );
    expect(invoiceCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['ISSUED', 'OVERDUE'] } }),
      }),
    );
  });

  it("Test 7 — filtre from/to appliqué sur issueDate (gte/lte)", async () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    await getInvoicesListData({
      filters: { from, to },
      page: 1,
      pageSize: 50,
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          issueDate: { gte: from, lte: to },
        }),
      }),
    );
  });

  it("Test 8 — filtre payerOrgId appliqué", async () => {
    // P1.1 — payerOrgId est désormais validé comme UUID en amont
    const VALID_PAYER_ORG_ID = '33333333-3333-3333-3333-333333333333';
    await getInvoicesListData({
      filters: { payerOrgId: VALID_PAYER_ORG_ID },
      page: 1,
      pageSize: 50,
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ payerOrgId: VALID_PAYER_ORG_ID }),
      }),
    );
  });

  it("Test 9 — onlyUnpaid=true override statuses → ISSUED+PARTIAL+OVERDUE", async () => {
    await getInvoicesListData({
      filters: { statuses: ['PAID'] as never, onlyUnpaid: true },
      page: 1,
      pageSize: 50,
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        }),
      }),
    );
  });

  it("Test 10 — tri par défaut [{ issueDate: 'desc' }, { number: 'desc' }]", async () => {
    await getInvoicesListData({ filters: {}, page: 1, pageSize: 50 });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      }),
    );
  });

  it("Test 11 — pagination skip=(page-1)*pageSize, take=pageSize", async () => {
    await getInvoicesListData({ filters: {}, page: 3, pageSize: 25 });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 25 }),
    );
  });

  it("Test 12 (bonus) — non-authenticated → early-return KPI vides + rows: []", async () => {
    validateRequestMock.mockResolvedValueOnce({ user: null, session: null });
    const r = await getInvoicesListData({ filters: {}, page: 1, pageSize: 50 });
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.kpis.caMois).toBe(0);
    expect(r.kpis.impayesAmount).toBe(0);
    expect(r.kpis.impayesCount).toBe(0);
    expect(r.kpis.dsoMoyen).toBeNull();
    expect(r.kpis.aFacturerCount).toBe(0);
    // Aucune query Prisma déclenchée
    expect(aggregateMock).not.toHaveBeenCalled();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("Test 13 (bonus) — map row inclut isAvoir + originalInvoiceId + originalNumber + payerLabel fallback person", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: 'inv-1',
        number: 'AVO-000001',
        status: 'CREDIT_NOTE',
        issueDate: new Date('2026-05-01'),
        amountTTC: -300,
        amountPaid: 0,
        originalInvoiceId: 'inv-orig',
        lastReminderAt: null,
        reminderCount: 0,
        payerOrg: null,
        participant: {
          person: { firstName: 'Jean', lastName: 'Martin' },
        },
        originalInvoice: { id: 'inv-orig', number: 'FAC-000010' },
      },
    ]);
    invoiceCountMock.mockResolvedValueOnce(1);

    const r = await getInvoicesListData({ filters: {}, page: 1, pageSize: 50 });
    expect(r.total).toBe(1);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    expect(row.isAvoir).toBe(true);
    expect(row.originalInvoiceId).toBe('inv-orig');
    expect(row.originalNumber).toBe('FAC-000010');
    expect(row.payerLabel).toBe('Jean Martin');
    expect(row.amountTtc).toBe(-300);
  });
});

describe('getInvoicesListData — validation Zod en amont (P1.1)', () => {
  it('Test 12 — statut invalide → ZodError, aucune query Prisma envoyée', async () => {
    const { ZodError } = await import('zod');

    await expect(
      getInvoicesListData({
        filters: {
          // Cast forcé : simule un appelant qui injecte une querystring brute
          statuses: ['FOO_BAR'] as unknown as Array<
            'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'CANCELLED' | 'CREDIT_NOTE'
          >,
        },
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ZodError);

    // Aucune des 6 queries ne doit avoir été déclenchée si la validation rejette
    expect(findManyMock).not.toHaveBeenCalled();
    expect(invoiceCountMock).not.toHaveBeenCalled();
    expect(aggregateMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(spCountMock).not.toHaveBeenCalled();
  });

  it('Test 13 — payerOrgId non-UUID → ZodError, aucune query Prisma envoyée', async () => {
    const { ZodError } = await import('zod');

    await expect(
      getInvoicesListData({
        filters: { payerOrgId: 'pas-un-uuid' },
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(findManyMock).not.toHaveBeenCalled();
    expect(invoiceCountMock).not.toHaveBeenCalled();
  });

  it('Test 14 — onlyUnpaid: true force le where.status à [ISSUED, PARTIAL, OVERDUE] (override statuses)', async () => {
    findManyMock.mockResolvedValueOnce([]);
    invoiceCountMock.mockResolvedValueOnce(0);

    await getInvoicesListData({
      filters: { onlyUnpaid: true, statuses: ['DRAFT'] },
      page: 1,
      pageSize: 20,
    });

    const whereArg = findManyMock.mock.calls[0]![0].where;
    expect(whereArg.status).toEqual({ in: ['ISSUED', 'PARTIAL', 'OVERDUE'] });
    expect(whereArg.status.in).not.toContain('DRAFT');
  });
});
