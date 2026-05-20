import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-07 Task 2 — Route API `/api/factures/export` GET.
 *
 * Stratégie de mock (clone-strict pattern Phase 9 `lead-notifications.test.ts` +
 * Phase 11 `credit-note.test.ts`) :
 *  - `@qualiof/db`               → prisma.invoice.findMany + auditLog.create (via logInvoiceEvent)
 *  - `@/lib/auth`                → validateRequest stub (cls Lucia bypassed)
 *  - `@/lib/rbac`                → hasRole importé actual (helper pur)
 *  - `@/lib/invoice-audit`       → logInvoiceEvent mocké
 *  - `xlsx`                      → on laisse la lib réelle pour vérifier le buffer (mockHoist OK)
 *
 * Coverage (11 cas — cf <behavior> plan 11-07) :
 *   1.  GET sans session → 401
 *   2.  GET avec session COMMERCIAL → 403
 *   3.  GET avec session FORMATEUR → 403
 *   4.  GET avec session ADMIN → 200 + Content-Type xlsx
 *   5.  GET avec session COMPTABLE → 200
 *   6.  Content-Disposition contient filename=factures_YYYY-MM-DD_YYYY-MM-DD.xlsx
 *   7.  from/to format invalide → 400
 *   8.  Crée AuditLog invoices.exported avec diff {from, to, count}
 *   9.  Période vide (0 factures) → 200 + sheet avec headers
 *  10.  Avoirs (status=CREDIT_NOTE) inclus dans la query (where ne filtre PAS status)
 *  11.  audit-log targetInvoiceId === 'BULK' (convention D-18)
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
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

vi.mock('@/lib/invoice-audit', () => ({
  logInvoiceEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { GET } from '../route';

const invoiceFindMany = prisma.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;
const logInvoiceEventMock = logInvoiceEvent as unknown as ReturnType<typeof vi.fn>;

const FAKE_ADMIN = {
  id: 'user-admin',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN' as const,
  firstName: 'Admin',
  lastName: 'Test',
  disabledAt: null,
};

const FAKE_COMPTABLE = { ...FAKE_ADMIN, id: 'user-compta', role: 'COMPTABLE' as const };
const FAKE_COMMERCIAL = { ...FAKE_ADMIN, id: 'user-com', role: 'COMMERCIAL' as const };
const FAKE_FORMATEUR = { ...FAKE_ADMIN, id: 'user-form', role: 'FORMATEUR' as const };

const VALID_URL = 'http://localhost/api/factures/export?from=2026-01-01&to=2026-01-31';

beforeEach(() => {
  invoiceFindMany.mockReset();
  invoiceFindMany.mockResolvedValue([]);
  validateRequestMock.mockReset();
  logInvoiceEventMock.mockReset();
  logInvoiceEventMock.mockResolvedValue(undefined);
});

describe('GET /api/factures/export', () => {
  it('Test 1 — GET sans session → 401', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: null, session: null });

    const res = await GET(new Request(VALID_URL));

    expect(res.status).toBe(401);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it('Test 2 — GET avec session COMMERCIAL → 403', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_COMMERCIAL, session: {} });

    const res = await GET(new Request(VALID_URL));

    expect(res.status).toBe(403);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it('Test 3 — GET avec session FORMATEUR → 403', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_FORMATEUR, session: {} });

    const res = await GET(new Request(VALID_URL));

    expect(res.status).toBe(403);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it('Test 4 — GET avec session ADMIN → 200 + Content-Type xlsx', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });

    const res = await GET(new Request(VALID_URL));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('Test 5 — GET avec session COMPTABLE → 200', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_COMPTABLE, session: {} });

    const res = await GET(new Request(VALID_URL));

    expect(res.status).toBe(200);
  });

  it('Test 6 — Content-Disposition contient filename=factures_YYYY-MM-DD_YYYY-MM-DD.xlsx', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });

    const res = await GET(new Request(VALID_URL));

    const cd = res.headers.get('Content-Disposition');
    expect(cd).toMatch(/attachment;\s*filename="factures_2026-01-01_2026-01-31\.xlsx"/);
  });

  it('Test 7 — from/to format invalide → 400', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });

    const res = await GET(
      new Request('http://localhost/api/factures/export?from=invalid&to=also-bad'),
    );

    expect(res.status).toBe(400);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it('Test 8 — Crée AuditLog invoices.exported avec diff {from, to, count}', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });
    invoiceFindMany.mockResolvedValueOnce([
      {
        status: 'ISSUED',
        number: 'FAC-0001',
        issueDate: new Date('2026-01-15'),
        amountHT: 1000,
        amountTTC: 1200,
        amountPaid: 0,
        payerOrg: { legalName: 'Acme', siret: '12345678900012' },
        participant: { person: { firstName: 'Jean', lastName: 'Dupont' } },
      },
      {
        status: 'PAID',
        number: 'FAC-0002',
        issueDate: new Date('2026-01-20'),
        amountHT: 500,
        amountTTC: 600,
        amountPaid: 600,
        payerOrg: { legalName: 'Beta', siret: '11122233344455' },
        participant: { person: { firstName: 'Marie', lastName: 'Martin' } },
      },
    ]);

    await GET(new Request(VALID_URL));

    expect(logInvoiceEventMock).toHaveBeenCalledTimes(1);
    const call = logInvoiceEventMock.mock.calls[0]![0];
    expect(call.action).toBe('invoices.exported');
    expect(call.tenantId).toBe('tenant-1');
    expect(call.actorUserId).toBe('user-admin');
    expect(call.diff).toMatchObject({ count: 2 });
    expect(typeof call.diff.from).toBe('string');
    expect(typeof call.diff.to).toBe('string');
  });

  it('Test 9 — Période vide (0 factures) → 200 + sheet avec headers', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });
    invoiceFindMany.mockResolvedValueOnce([]);

    const res = await GET(new Request(VALID_URL));

    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0); // un xlsx vide reste un xlsx valide (~quelques KB)
    expect(logInvoiceEventMock).toHaveBeenCalledTimes(1);
    expect(logInvoiceEventMock.mock.calls[0]![0].diff.count).toBe(0);
  });

  it('Test 10 — Avoirs (status=CREDIT_NOTE) inclus : where ne filtre PAS sur status', async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });
    invoiceFindMany.mockResolvedValueOnce([]);

    await GET(new Request(VALID_URL));

    expect(invoiceFindMany).toHaveBeenCalledTimes(1);
    const queryArgs = invoiceFindMany.mock.calls[0]![0];
    // D-16 : la query NE DOIT PAS exclure CREDIT_NOTE — pas de filter status dans where
    expect(queryArgs.where).not.toHaveProperty('status');
    expect(queryArgs.where.tenantId).toBe('tenant-1');
    // Filtre période issueDate (D-15)
    expect(queryArgs.where.issueDate).toHaveProperty('gte');
    expect(queryArgs.where.issueDate).toHaveProperty('lte');
  });

  it("Test 11 — audit-log targetInvoiceId === 'BULK' (convention D-18)", async () => {
    validateRequestMock.mockResolvedValueOnce({ user: FAKE_ADMIN, session: {} });

    await GET(new Request(VALID_URL));

    expect(logInvoiceEventMock).toHaveBeenCalledTimes(1);
    expect(logInvoiceEventMock.mock.calls[0]![0].targetInvoiceId).toBe('BULK');
  });
});
