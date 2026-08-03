import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 22 Plan 22-11 Task 2 — `sendInvoiceReminderCron` (cœur worker Railway) :
 * fermeture de la classe Pitfall 1 (compteurs de relance brûlés à blanc).
 *
 * Cas critiques :
 *  1. mailResult suppressed (réglages tenant fermés) → reminderCount NON
 *     incrémenté, AuditLog diff { dryRun:true, suppressedBySettings:true,
 *     counterConsumed:false } — le rapport pending-sends reste lisible.
 *  2. mailResult dry-run env → idem, compteur non consommé.
 *  3. départ réel → compteur consommé + AuditLog counterConsumed:true.
 *  4. contexte requis transmis à sendMail (catégorie invoice_reminder,
 *     sessionId = invoice.sessionId ?? participant.sessionId).
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn(),
}));

vi.mock('@/lib/invoice-audit', () => ({
  logInvoiceEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    siret: '95131909400011',
    rnq: '93 06 10481 06',
  }),
}));

vi.mock('@/lib/mailer-templates/invoice-reminder', () => ({
  renderInvoiceReminderEmail: vi.fn().mockReturnValue({
    subject: 'Mock subject',
    html: '<p>Mock html</p>',
    text: 'Mock text',
  }),
}));

import { prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { sendInvoiceReminderCron } from '../invoice-reminder-core';

const invoiceFindUnique = prisma.invoice.findUnique as unknown as ReturnType<typeof vi.fn>;
const invoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;
const invoiceUpdate = prisma.invoice.update as unknown as ReturnType<typeof vi.fn>;
const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const sendMailMock = sendMail as unknown as ReturnType<typeof vi.fn>;
const logInvoiceEventMock = logInvoiceEvent as unknown as ReturnType<typeof vi.fn>;

function makeInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv-1',
    number: 'FAC-000006',
    status: 'ISSUED' as const,
    tenantId: 'tenant-1',
    issueDate: new Date('2026-06-01T00:00:00Z'),
    dueDate: new Date('2026-06-20T00:00:00Z'),
    amountTTC: 1200,
    amountPaid: 0,
    reminderCount: 0,
    lastReminderAt: null,
    sessionId: null,
    payerOrg: { legalName: 'AKORIMMO', email: null, emailBilling: 'compta@akorimmo.fr' },
    participant: {
      sessionId: 'ses-94',
      person: { firstName: 'Kristin', lastName: 'KING', email: null },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invoiceFindUnique.mockResolvedValue({ tenantId: 'tenant-1' });
  invoiceFindFirst.mockResolvedValue(makeInvoice());
  invoiceUpdate.mockResolvedValue({});
  tenantFindUnique.mockResolvedValue({ invoiceReminderDays: [30, 45] });
  logInvoiceEventMock.mockResolvedValue(undefined);
});

describe('sendInvoiceReminderCron — compteurs conditionnels (Pitfall 1 fermé)', () => {
  it('1. suppression par réglages → compteur NON consommé + AuditLog suppressedBySettings:true', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: true, dryRun: true, suppressed: true });

    const res = await sendInvoiceReminderCron({ invoiceId: 'inv-1' });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dryRun).toBe(true);
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoices.reminder_sent',
        diff: expect.objectContaining({
          triggered_by: 'cron',
          dryRun: true,
          suppressedBySettings: true,
          counterConsumed: false,
        }),
      }),
    );
  });

  it('2. dry-run env → compteur NON consommé (suppressedBySettings:false)', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: true, dryRun: true });

    const res = await sendInvoiceReminderCron({ invoiceId: 'inv-1' });

    expect(res.ok).toBe(true);
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diff: expect.objectContaining({
          dryRun: true,
          suppressedBySettings: false,
          counterConsumed: false,
        }),
      }),
    );
  });

  it('3. départ réel → compteur consommé (increment 1) + counterConsumed:true', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: true, dryRun: false, messageId: 'mid-1' });

    const res = await sendInvoiceReminderCron({ invoiceId: 'inv-1' });

    expect(res.ok).toBe(true);
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          lastReminderAt: expect.any(Date),
          reminderCount: { increment: 1 },
        }),
      }),
    );
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diff: expect.objectContaining({ counterConsumed: true }),
      }),
    );
  });

  it('4. contexte transmis : category=invoice_reminder + sessionId fallback participant', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: true, dryRun: true });

    await sendInvoiceReminderCron({ invoiceId: 'inv-1' });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'compta@akorimmo.fr',
        subject: 'Mock subject',
        context: expect.objectContaining({
          tenantId: 'tenant-1',
          category: 'invoice_reminder',
          sessionId: 'ses-94', // invoice.sessionId null → fallback participant.sessionId
        }),
      }),
    );
  });

  it('5. échec SMTP (ok:false) → compteur NON consommé', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: false, error: 'SMTP down' });

    await sendInvoiceReminderCron({ invoiceId: 'inv-1' });

    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diff: expect.objectContaining({ counterConsumed: false }),
      }),
    );
  });
});
