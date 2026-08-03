import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-06 Task 1 — Server Action `sendInvoiceReminder`.
 *
 * Stratégie de mock (clone-strict patterns Phase 11 `credit-note.test.ts` et
 * `invoice-settings.test.ts`) :
 *  - `@qualiof/db`               → prisma mocké (invoice.findFirst/findUnique/update +
 *                                  tenant.findUnique + auditLog.create)
 *  - `@/lib/auth`                → validateRequest stub (évite cascade RSC)
 *  - `@/lib/rbac`                → requireRole mocké (default = ADMIN auth)
 *  - `@/lib/invoice-audit`       → logInvoiceEvent mocké
 *  - `@/lib/mailer`              → sendMail mocké
 *  - `@/lib/mailer-templates/invoice-reminder` → renderInvoiceReminderEmail mocké
 *  - `@/lib/of-config`           → loadOfConfig mocké
 *  - `next/cache`                → revalidatePath no-op
 *
 * Coverage (13 cas — cf <behavior> plan 11-06) :
 *  1.  triggered_by=manual + RBAC COMMERCIAL → ForbiddenError → { ok:false }
 *  2.  triggered_by=cron → skip requireRole (worker système)
 *  3.  status=PAID → skip + return error (auto-stop D-13)
 *  4.  status=CANCELLED → skip
 *  5.  triggered_by=cron + lastReminderAt < 24h → skip (idempotence D-13b)
 *  6.  triggered_by=manual + lastReminderAt il y a 1h → PAS de skip (D-09)
 *  7.  reminderCount=2 + invoiceReminderDays=[30,45] → skip (level max)
 *  8.  level = clamp(reminderCount + 1, 1, invoiceReminderDays.length)
 *  9.  appelle sendMail + renderInvoiceReminderEmail
 *  10. SMTP_HOST vide → dryRun=true + AuditLog diff.dryRun=true
 *  11. update Invoice { lastReminderAt: now, reminderCount: { increment: 1 } }
 *  12. AuditLog invoices.reminder_sent avec diff complet
 *  13. Aucun email payeur → { ok:false, error:'Aucun email payeur configuré' }
 */

vi.mock('@qualiof/db', () => {
  const Decimal = class {
    private v: number;
    constructor(v: number | string) {
      this.v = typeof v === 'string' ? parseFloat(v) : v;
    }
    toString() {
      return String(this.v);
    }
    toNumber() {
      return this.v;
    }
    valueOf() {
      return this.v;
    }
  };
  return {
    prisma: {
      invoice: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      tenant: { findUnique: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    Prisma: { Decimal },
    UserRole: {
      ADMIN: 'ADMIN',
      MANAGER: 'MANAGER',
      FORMATEUR: 'FORMATEUR',
      COMMERCIAL: 'COMMERCIAL',
      COMPTABLE: 'COMPTABLE',
      LECTEUR: 'LECTEUR',
    },
    LegalForm: {
      SAS: 'SAS', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL',
      SA: 'SA', EI: 'EI', EIRL: 'EIRL', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR', AUTRE: 'AUTRE',
    },
  };
});

vi.mock('@/lib/auth', () => ({
  lucia: {},
  validateRequest: vi.fn(),
}));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return {
    ...actual,
    requireRole: vi.fn(),
  };
});

vi.mock('@/lib/invoice-audit', () => ({
  logInvoiceEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn(),
}));

vi.mock('@/lib/mailer-templates/invoice-reminder', () => ({
  renderInvoiceReminderEmail: vi.fn().mockReturnValue({
    subject: 'Mock subject',
    html: '<p>Mock html</p>',
    text: 'Mock text',
  }),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    siret: '12345678900012',
    rnq: '11756789012',
    addressFull: '12 rue Test',
    phone: '01 23 45 67 89',
    email: 'contact@test.fr',
    tvaIntra: null,
    iban: null,
    bic: null,
  }),
}));

vi.mock('@/lib/numbering', () => ({
  getNextInvoiceNumber: vi.fn(),
  getNextCreditNoteNumber: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  DOCS_BUCKET: 'docs',
}));

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

vi.mock('@/lib/of-pdf-footer', () => ({
  renderOfStandardFooterHtml: vi.fn().mockReturnValue('<footer/>'),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { sendMail } from '@/lib/mailer';
import { renderInvoiceReminderEmail } from '@/lib/mailer-templates/invoice-reminder';
import { revalidatePath } from 'next/cache';
import { sendInvoiceReminder } from '../invoices';

const invoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;
const invoiceFindUnique = prisma.invoice.findUnique as unknown as ReturnType<typeof vi.fn>;
const invoiceUpdate = prisma.invoice.update as unknown as ReturnType<typeof vi.fn>;
const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const logInvoiceEventMock = logInvoiceEvent as unknown as ReturnType<typeof vi.fn>;
const sendMailMock = sendMail as unknown as ReturnType<typeof vi.fn>;
const renderInvoiceReminderEmailMock = renderInvoiceReminderEmail as unknown as ReturnType<typeof vi.fn>;
const revalidatePathMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;

const FAKE_ADMIN = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

const VALID_INVOICE_ID = '11111111-1111-1111-1111-111111111111';

function makeInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_INVOICE_ID,
    number: 'FAC-000042',
    status: 'ISSUED' as const,
    tenantId: 'tenant-1',
    issueDate: new Date('2026-04-01T00:00:00Z'),
    dueDate: new Date('2026-05-01T00:00:00Z'),
    amountTTC: 1200,
    amountPaid: 0,
    reminderCount: 0,
    lastReminderAt: null,
    payerOrg: {
      legalName: 'OPCO EP',
      email: null,
      emailBilling: 'paiement@opco-ep.fr',
    },
    participant: {
      person: { firstName: 'Jean', lastName: 'Dupont', email: null },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invoiceFindFirst.mockReset();
  invoiceFindUnique.mockReset();
  invoiceUpdate.mockReset();
  tenantFindUnique.mockReset();
  requireRoleMock.mockReset();
  logInvoiceEventMock.mockReset();
  logInvoiceEventMock.mockResolvedValue(undefined);
  sendMailMock.mockReset();
  renderInvoiceReminderEmailMock.mockReset();
  renderInvoiceReminderEmailMock.mockReturnValue({
    subject: 'Mock subject',
    html: '<p>Mock html</p>',
    text: 'Mock text',
  });
  revalidatePathMock.mockReset();

  // Defaults
  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  tenantFindUnique.mockResolvedValue({ invoiceReminderDays: [30, 45] });
  sendMailMock.mockResolvedValue({ ok: true, dryRun: false, messageId: 'mock-id' });
  invoiceUpdate.mockResolvedValue({});
  // Reset SMTP_HOST default to a value
  process.env.SMTP_HOST = 'smtp.test.fr';
  process.env.MAIL_DRY_RUN = '';
});

describe('sendInvoiceReminder', () => {
  it('Test 1 — triggered_by=manual + RBAC COMMERCIAL → ForbiddenError → { ok:false }', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle COMMERCIAL non autorisé'));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/COMMERCIAL|non autorisé/i);
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('Test 2 — triggered_by=cron → SKIP requireRole (worker système)', async () => {
    invoiceFindUnique.mockResolvedValueOnce({ tenantId: 'tenant-1' });
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice());

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'cron',
    });

    expect(requireRoleMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it('Test 3 — status=PAID → skip + return error (auto-stop D-13)', async () => {
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice({ status: 'PAID' }));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/payée|paid/i);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('Test 4 — status=CANCELLED → skip + return error', async () => {
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice({ status: 'CANCELLED' }));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/annulée|cancelled/i);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('Test 5 — triggered_by=cron + lastReminderAt < 24h → skip (idempotence D-13b)', async () => {
    const recent = new Date(Date.now() - 1000 * 60 * 60); // il y a 1h
    invoiceFindUnique.mockResolvedValueOnce({ tenantId: 'tenant-1' });
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice({ lastReminderAt: recent }));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'cron',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/idempotence|24h/i);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("Test 6 — triggered_by=manual + lastReminderAt il y a 1h → PAS de skip (D-09)", async () => {
    const recent = new Date(Date.now() - 1000 * 60 * 60);
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice({ lastReminderAt: recent }));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalled();
  });

  it('Test 7 — reminderCount=2 + invoiceReminderDays=[30,45] → skip (level max atteint)', async () => {
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice({ reminderCount: 2 }));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/niveau.*max|maximum/i);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('Test 8 — level = clamp(reminderCount + 1, 1, invoiceReminderDays.length)', async () => {
    // reminderCount=1 → niveau 2 attendu
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice({ reminderCount: 1 }));

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.level).toBe(2);
  });

  it('Test 9 — appelle sendMail + renderInvoiceReminderEmail avec input correct', async () => {
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice());

    await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(renderInvoiceReminderEmailMock).toHaveBeenCalled();
    const args = renderInvoiceReminderEmailMock.mock.calls[0]!;
    expect(args[0]).toMatchObject({
      level: 1,
      invoiceNumber: 'FAC-000042',
      payerName: 'OPCO EP',
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'paiement@opco-ep.fr',
        subject: 'Mock subject',
        // Phase 22-11 : contexte requis (catégorie + tenant + session).
        context: expect.objectContaining({
          tenantId: 'tenant-1',
          category: 'invoice_reminder',
          sessionId: null,
        }),
      }),
    );
  });

  it('Test 9b — sessionId de la facture (fallback participant) transmis au contexte', async () => {
    invoiceFindFirst.mockResolvedValueOnce(
      makeInvoice({
        sessionId: null,
        participant: {
          sessionId: 'ses-42',
          person: { firstName: 'Jean', lastName: 'Dupont', email: null },
        },
      }),
    );

    await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ sessionId: 'ses-42' }),
      }),
    );
  });

  it('Test 10 — SMTP_HOST vide → result.dryRun=true + AuditLog diff.dryRun=true + compteur NON consommé', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: true, dryRun: true });
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice());

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dryRun).toBe(true);
    // Phase 22-11 (Pitfall 1) : dry-run env ne brûle AUCUN niveau de relance.
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoices.reminder_sent',
        diff: expect.objectContaining({ dryRun: true, counterConsumed: false }),
      }),
    );
  });

  it('Test 10b — suppression par réglages (suppressed:true) → compteur NON consommé + diff.suppressedBySettings=true', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: true, dryRun: true, suppressed: true });
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice());

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dryRun).toBe(true);
    // Phase 22-11 (Pitfall 1 fermé à la racine) : suppression réglages
    // = 0 niveau brûlé, mais AuditLog tracé avec suppressedBySettings.
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoices.reminder_sent',
        diff: expect.objectContaining({
          dryRun: true,
          suppressedBySettings: true,
          counterConsumed: false,
        }),
      }),
    );
  });

  it('Test 11 — update Invoice { lastReminderAt: now, reminderCount: { increment: 1 } }', async () => {
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice());

    await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_INVOICE_ID },
        data: expect.objectContaining({
          lastReminderAt: expect.any(Date),
          reminderCount: { increment: 1 },
        }),
      }),
    );
  });

  it('Test 12 — AuditLog invoices.reminder_sent avec diff {level, channel:email, triggered_by, dryRun, suppressedBySettings, counterConsumed, daysOverdue}', async () => {
    invoiceFindFirst.mockResolvedValueOnce(makeInvoice());

    await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoices.reminder_sent',
        targetInvoiceId: VALID_INVOICE_ID,
        diff: expect.objectContaining({
          level: 1,
          channel: 'email',
          triggered_by: 'manual',
          dryRun: false,
          suppressedBySettings: false,
          counterConsumed: true,
          daysOverdue: expect.any(Number),
        }),
      }),
    );
  });

  it("Test 13 — Aucun email payeur → { ok:false, error:'Aucun email payeur configuré' }", async () => {
    invoiceFindFirst.mockResolvedValueOnce(
      makeInvoice({
        payerOrg: { legalName: 'Sans email', email: null, emailBilling: null },
        participant: { person: { firstName: 'X', lastName: 'Y', email: null } },
      }),
    );

    const res = await sendInvoiceReminder({
      invoiceId: VALID_INVOICE_ID,
      triggered_by: 'manual',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/email.*payeur/i);
    expect(sendMailMock).not.toHaveBeenCalled();
    // Audit-loggé quand même pour traçabilité
    expect(logInvoiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoices.reminder_sent',
        diff: expect.objectContaining({ error: 'no_email_recipient' }),
      }),
    );
  });
});
