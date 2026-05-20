import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-06 Task 2 — Worker BullMQ relances.
 *
 * Stratégie de mock (clone-strict patterns Phase 11 `send-reminder.test.ts` +
 * Phase 2.2 `closure/__tests__/single-participant.test.ts`) :
 *  - `@qualiof/db`                                    → prisma mocké (tenant.findMany + invoice.findMany)
 *  - `@/server/actions/invoices` (sendInvoiceReminder) → mocké (on vérifie l'appel sans relancer la chaîne action)
 *  - `bullmq` (Queue/Worker classes)                  → mockées (on ne touche pas Redis dans les tests)
 *  - `../closure/redis` (getQueueRedis/getWorkerRedis) → mockés
 *
 * Coverage (9 cas — cf <behavior> plan 11-06) :
 *  1. `processReminderJob` scan Invoice WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}
 *  2. `processReminderJob` filtre issueDate ≥ REMINDER_START_DATE (mitigation R2)
 *  3. Pour chaque tenant : lit Tenant.invoiceReminderDays par tick
 *  4. Skip facture si reminderCount >= invoiceReminderDays.length (niveau max)
 *  5. Skip facture si lastReminderAt > now - 24h (idempotence D-13b defense-in-depth)
 *  6. Appelle sendInvoiceReminder({ triggered_by: 'cron' }) pour chaque facture éligible
 *  7. `scheduleDailyReminders` inscrit job repeatable `jobId='daily-reminders-cron'`
 *  8. `scheduleDailyReminders` utilise pattern cron `'0 8 * * *'` tz `Europe/Paris`
 *  9. `REMINDER_START_DATE` est exportée et figée au 2026-05-19 UTC
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

vi.mock('bullmq', () => {
  const queueAdd = vi.fn().mockResolvedValue(undefined);
  return {
    Queue: vi.fn().mockImplementation(() => ({ add: queueAdd })),
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    // expose for assertions
    __queueAdd: queueAdd,
  };
});

vi.mock('../../closure/redis', () => ({
  getQueueRedis: vi.fn().mockReturnValue({}),
  getWorkerRedis: vi.fn().mockReturnValue({}),
}));

import { prisma } from '@qualiof/db';
import { sendInvoiceReminder } from '@/server/actions/invoices';
import * as bullmq from 'bullmq';
import {
  processReminderJob,
  scheduleDailyReminders,
  REMINDER_START_DATE,
} from '../worker';

const tenantFindMany = prisma.tenant.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const invoiceFindMany = prisma.invoice.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const sendReminderMock = sendInvoiceReminder as unknown as ReturnType<
  typeof vi.fn
>;
const queueAddMock = (bullmq as unknown as { __queueAdd: ReturnType<typeof vi.fn> })
  .__queueAdd;

function makeJob(
  overrides: Partial<{ triggered_by: 'cron' | 'manual_admin_trigger' }> = {},
) {
  return {
    id: 'job-1',
    data: { triggered_by: 'cron' as const, ...overrides },
  } as Parameters<typeof processReminderJob>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindMany.mockReset();
  invoiceFindMany.mockReset();
  sendReminderMock.mockReset();
  queueAddMock.mockClear();

  // Defaults
  tenantFindMany.mockResolvedValue([
    { id: 'tenant-1', invoiceReminderDays: [30, 45] },
  ]);
  invoiceFindMany.mockResolvedValue([]);
  sendReminderMock.mockResolvedValue({ ok: true, level: 1, dryRun: false });
});

describe('invoice-reminder-worker — processReminderJob', () => {
  it('Test 1 — scan Invoice WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}', async () => {
    await processReminderJob(makeJob());

    expect(invoiceFindMany).toHaveBeenCalled();
    const whereArg = invoiceFindMany.mock.calls[0]![0]!.where;
    expect(whereArg.status).toEqual({
      in: ['ISSUED', 'PARTIAL', 'OVERDUE'],
    });
  });

  it('Test 2 — filtre issueDate ≥ REMINDER_START_DATE (mitigation R2)', async () => {
    await processReminderJob(makeJob());

    const whereArg = invoiceFindMany.mock.calls[0]![0]!.where;
    expect(whereArg.issueDate).toEqual({ gte: REMINDER_START_DATE });
  });

  it('Test 3 — pour chaque tenant : lit Tenant.invoiceReminderDays par tick', async () => {
    tenantFindMany.mockResolvedValueOnce([
      { id: 'tenant-A', invoiceReminderDays: [30, 45] },
      { id: 'tenant-B', invoiceReminderDays: [15, 30, 60] },
    ]);

    await processReminderJob(makeJob());

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

    await processReminderJob(makeJob());

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

    await processReminderJob(makeJob());

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

    const result = await processReminderJob(makeJob());

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

describe('invoice-reminder-worker — scheduleDailyReminders', () => {
  it("Test 7 — inscrit job repeatable jobId='daily-reminders-cron'", async () => {
    await scheduleDailyReminders();

    expect(queueAddMock).toHaveBeenCalled();
    const opts = queueAddMock.mock.calls[0]![2]!;
    expect(opts.jobId).toBe('daily-reminders-cron');
  });

  it("Test 8 — utilise pattern cron '0 8 * * *' tz Europe/Paris", async () => {
    await scheduleDailyReminders();

    const opts = queueAddMock.mock.calls[0]![2]!;
    expect(opts.repeat).toEqual({
      pattern: '0 8 * * *',
      tz: 'Europe/Paris',
    });
  });
});

describe('invoice-reminder-worker — REMINDER_START_DATE', () => {
  it('Test 9 — figée au 2026-05-19T00:00:00Z (mitigation R2 cascade)', () => {
    expect(REMINDER_START_DATE).toBeInstanceOf(Date);
    expect(REMINDER_START_DATE.toISOString()).toBe('2026-05-19T00:00:00.000Z');
  });
});
