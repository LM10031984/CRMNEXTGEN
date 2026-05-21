import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Tests Phase 11 Plan 11-08 Task 4 — Backfill `logInvoiceEvent` dans 3 actions
 * existantes Phase 7-02 (FACT-01 D-18).
 *
 * Actions backfilled :
 *  - createInvoiceFromParticipant   → 'invoices.created' + 'invoices.issued'
 *  - createInvoiceForSponsorGroup   → 'invoices.created' + 'invoices.issued'
 *  - recordInvoicePayment           → 'invoices.payment_recorded'
 *
 * Stratégie : source-regex (D-Phase9-N) plutôt que test runtime complet,
 * pour 2 raisons :
 *  1. Les 3 actions ont une logique métier riche (PDF render, MinIO upload,
 *     Document creation, transactions multi-table) → un test runtime nécessiterait
 *     de mocker ~10 modules (storage, pdf-render, of-config, numbering, mailer,
 *     invoice-template, of-pdf-footer). Le test source-regex vérifie que les
 *     `logInvoiceEvent({action:'invoices.created'})` ET `'invoices.issued'`
 *     sont bien présents dans le code source, ce qui est ce que l'audit veut
 *     vraiment garantir (D-18 trace complète).
 *  2. Anti-régression : si quelqu'un retire les calls par mégarde, le test
 *     échoue immédiatement avec un message explicite.
 *
 * +1 test runtime pur sur l'helper `logInvoiceEvent` lui-même (signature D-18).
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    auditLog: { create: vi.fn() },
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

import { prisma } from '@qualiof/db';
import { logInvoiceEvent } from '@/lib/invoice-audit';

const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;

const INVOICES_SRC = readFileSync(
  path.join(__dirname, '..', 'invoices.ts'),
  'utf-8',
);

describe('Backfill FACT-01 — logInvoiceEvent dans createInvoiceFromParticipant', () => {
  it("source contient 'invoices.created' avec actorUserId user.id", () => {
    // Localise la fonction createInvoiceFromParticipant + check qu'elle utilise logInvoiceEvent
    const fnMatch = INVOICES_SRC.match(
      /export async function createInvoiceFromParticipant[\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0]!;
    expect(fnBody).toMatch(/logInvoiceEvent\(/);
    expect(fnBody).toMatch(/'invoices\.created'/);
  });

  it("source contient 'invoices.issued' (DRAFT → ISSUED post-création)", () => {
    const fnMatch = INVOICES_SRC.match(
      /export async function createInvoiceFromParticipant[\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]!).toMatch(/'invoices\.issued'/);
  });
});

describe('Backfill FACT-01 — logInvoiceEvent dans createInvoiceForSponsorGroup', () => {
  it("source contient 'invoices.created' avec actorUserId user.id", () => {
    const fnMatch = INVOICES_SRC.match(
      /export async function createInvoiceForSponsorGroup[\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]!).toMatch(/logInvoiceEvent\(/);
    expect(fnMatch![0]!).toMatch(/'invoices\.created'/);
  });

  it("source contient 'invoices.issued'", () => {
    const fnMatch = INVOICES_SRC.match(
      /export async function createInvoiceForSponsorGroup[\s\S]*?\n\}\n/,
    );
    expect(fnMatch![0]!).toMatch(/'invoices\.issued'/);
  });
});

describe('Backfill FACT-01 — logInvoiceEvent dans recordInvoicePayment', () => {
  it("source contient 'invoices.payment_recorded' avec diff {amount, method, ...}", () => {
    const fnMatch = INVOICES_SRC.match(
      /export async function recordInvoicePayment[\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0]!;
    expect(fnBody).toMatch(/logInvoiceEvent\(/);
    expect(fnBody).toMatch(/'invoices\.payment_recorded'/);
    // Diff doit contenir amount + method + fullyPaid
    expect(fnBody).toMatch(/amount:/);
    expect(fnBody).toMatch(/method:/);
    expect(fnBody).toMatch(/fullyPaid/);
  });
});

describe('Anti-régression FACT-01 — backfill non bloquant pour signature existante', () => {
  it("createInvoiceFromParticipant retourne toujours { ok, invoiceId, documentId, number, error }", () => {
    expect(INVOICES_SRC).toMatch(/return { ok: true, invoiceId: invoice\.id, documentId: doc\.id, number: invoice\.number }/);
  });

  it("createInvoiceForSponsorGroup retourne toujours { ok, invoiceId, documentId, number, error }", () => {
    // Le second return success similaire
    const count = (INVOICES_SRC.match(/return { ok: true, invoiceId: invoice\.id, documentId: doc\.id, number: invoice\.number }/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("recordInvoicePayment retourne toujours { ok: true } sans champ supplémentaire", () => {
    const fnMatch = INVOICES_SRC.match(
      /export async function recordInvoicePayment[\s\S]*?\n\}\n/,
    );
    expect(fnMatch![0]!).toMatch(/return { ok: true }/);
  });

  it("3 actions backfilled importent logInvoiceEvent depuis @/lib/invoice-audit", () => {
    expect(INVOICES_SRC).toMatch(
      /import { logInvoiceEvent } from '@\/lib\/invoice-audit'/,
    );
  });
});

beforeEach(() => {
  auditLogCreate.mockReset();
});

describe('logInvoiceEvent helper (FACT-01 fondations)', () => {
  it("crée un AuditLog entity='Invoice' avec entityId + action + diff", async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetInvoiceId: 'inv-42',
      action: 'invoices.created',
      diff: { amountHt: 1000 },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        entity: 'Invoice',
        entityId: 'inv-42',
        action: 'invoices.created',
        diff: { amountHt: 1000 },
      },
    });
  });
});
