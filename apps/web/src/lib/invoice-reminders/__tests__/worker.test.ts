import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-06 → Phase 20 Plan 20-01 — Handler relances (croner).
 *
 * MISE À JOUR 20-01 (WORK-02, D-03 Redis viré) : le handler `processReminderJob`
 * accepte désormais un payload NEUTRE `{ triggered_by }` (plus de `Job` BullMQ).
 * Les fonctions `startInvoiceReminderWorker`/`scheduleDailyReminders` (BullMQ)
 * ont été supprimées → la planification croner est testée dans
 * `scripts/__tests__/cron-workers.test.ts`. Ce fichier conserve la couverture
 * MÉTIER inchangée du handler (statuts, R2, idempotence 24h, niveau max).
 *
 * Stratégie de mock :
 *  - `@qualiof/db`                                    → prisma mocké (tenant.findMany + invoice.findMany)
 *  - `@/server/actions/invoices` (sendInvoiceReminder) → mocké (on vérifie l'appel sans relancer la chaîne action)
 *
 * Coverage (7 cas métier — la logique reste inchangée) :
 *  1. `processReminderJob` scan Invoice WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}
 *  2. `processReminderJob` filtre issueDate ≥ REMINDER_START_DATE (mitigation R2)
 *  3. Pour chaque tenant : lit Tenant.invoiceReminderDays par tick
 *  4. Skip facture si reminderCount >= invoiceReminderDays.length (niveau max)
 *  5. Skip facture si lastReminderAt > now - 24h (idempotence D-13b defense-in-depth)
 *  6. Appelle sendInvoiceReminder({ triggered_by: 'cron' }) pour chaque facture éligible
 *  7. `REMINDER_START_DATE` est exportée et figée au 2026-05-19 UTC
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
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
}));

vi.mock('@/server/actions/invoices', () => ({
  sendInvoiceReminder: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { sendInvoiceReminder } from '@/server/actions/invoices';
import { processReminderJob, REMINDER_START_DATE } from '../worker';

const tenantFindMany = prisma.tenant.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const invoiceFindMany = prisma.invoice.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const sendReminderMock = sendInvoiceReminder as unknown as ReturnType<
  typeof vi.fn
>;

/** Payload neutre `{ triggered_by }` (plus de Job BullMQ depuis 20-01). */
function makeInput(
  overrides: Partial<{ triggered_by: 'cron' | 'manual_admin_trigger' }> = {},
) {
  return { triggered_by: 'cron' as const, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindMany.mockReset();
  invoiceFindMany.mockReset();
  sendReminderMock.mockReset();

  // Defaults
  tenantFindMany.mockResolvedValue([
    { id: 'tenant-1', invoiceReminderDays: [30, 45] },
  ]);
  invoiceFindMany.mockResolvedValue([]);
  sendReminderMock.mockResolvedValue({ ok: true, level: 1, dryRun: false });
});

describe('invoice-reminder-worker — processReminderJob', () => {
  it('Test 1 — scan Invoice WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}', async () => {
    await processReminderJob(makeInput());

    expect(invoiceFindMany).toHaveBeenCalled();
    const whereArg = invoiceFindMany.mock.calls[0]![0]!.where;
    expect(whereArg.status).toEqual({
      in: ['ISSUED', 'PARTIAL', 'OVERDUE'],
    });
  });

  it('Test 2 — filtre issueDate ≥ REMINDER_START_DATE (mitigation R2)', async () => {
    await processReminderJob(makeInput());

    const whereArg = invoiceFindMany.mock.calls[0]![0]!.where;
    expect(whereArg.issueDate).toEqual({ gte: REMINDER_START_DATE });
  });

  it('Test 3 — pour chaque tenant : lit Tenant.invoiceReminderDays par tick', async () => {
    tenantFindMany.mockResolvedValueOnce([
      { id: 'tenant-A', invoiceReminderDays: [30, 45] },
      { id: 'tenant-B', invoiceReminderDays: [15, 30, 60] },
    ]);

    await processReminderJob(makeInput());

    expect(tenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, invoiceReminderDays: true },
      }),
    );
    // 2 tenants → 2 appels invoice.findMany
    expect(invoiceFindMany).toHaveBeenCalledTimes(2);
    const calls = invoiceFindMany.mock.calls;
    expect(calls[0]![0]!.where.tenantId).toBe('tenant-A');
    expect(calls[1]![0]!.where.tenantId).toBe('tenant-B');
  });

  it('Test 4 — skip facture si reminderCount >= invoiceReminderDays.length', async () => {
    invoiceFindMany.mockResolvedValueOnce([
      // facture déjà à 2 niveaux → niveau max [30,45] = 2 → skip
      { id: 'inv-1', reminderCount: 2, lastReminderAt: null },
      // facture à 0 niveaux → éligible
      { id: 'inv-2', reminderCount: 0, lastReminderAt: null },
    ]);

    await processReminderJob(makeInput());

    expect(sendReminderMock).toHaveBeenCalledTimes(1);
    expect(sendReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-2' }),
    );
  });

  it('Test 5 — skip facture si lastReminderAt > now - 24h (idempotence D-13b)', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    invoiceFindMany.mockResolvedValueOnce([
      // Relancée il y a 1h → skip (< 24h)
      { id: 'inv-recent', reminderCount: 0, lastReminderAt: oneHourAgo },
      // Relancée il y a 48h → éligible (> 24h)
      { id: 'inv-old', reminderCount: 0, lastReminderAt: twoDaysAgo },
    ]);

    await processReminderJob(makeInput());

    expect(sendReminderMock).toHaveBeenCalledTimes(1);
    expect(sendReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-old' }),
    );
  });

  it("Test 6 — appelle sendInvoiceReminder({ triggered_by: 'cron' }) pour chaque facture éligible", async () => {
    invoiceFindMany.mockResolvedValueOnce([
      { id: 'inv-1', reminderCount: 0, lastReminderAt: null },
      { id: 'inv-2', reminderCount: 1, lastReminderAt: null },
    ]);

    const result = await processReminderJob(makeInput());

    expect(sendReminderMock).toHaveBeenCalledTimes(2);
    expect(sendReminderMock).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      triggered_by: 'cron',
    });
    expect(sendReminderMock).toHaveBeenCalledWith({
      invoiceId: 'inv-2',
      triggered_by: 'cron',
    });
    expect(result).toEqual({ processed: 2 });
  });
});

// Tests 7 & 8 (scheduleDailyReminders BullMQ) supprimés 20-01 : la planification
// est désormais assurée par croner (cf scripts/__tests__/cron-workers.test.ts).

describe('invoice-reminder-worker — REMINDER_START_DATE', () => {
  it('Test 7 — figée au 2026-05-19T00:00:00Z (mitigation R2 cascade)', () => {
    expect(REMINDER_START_DATE).toBeInstanceOf(Date);
    expect(REMINDER_START_DATE.toISOString()).toBe('2026-05-19T00:00:00.000Z');
  });
});
