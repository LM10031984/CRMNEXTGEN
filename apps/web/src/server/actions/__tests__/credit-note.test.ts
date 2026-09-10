import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-05 Task 2 — Server Action `createCreditNote`.
 *
 * Stratégie de mock (clone-strict pattern Phase 9 `leads.test.ts` +
 * Phase 11 `invoice-settings.test.ts`) :
 *  - `@qualiof/db`               → prisma mocké (invoice.findFirst/findMany/create/update + $transaction)
 *  - `@/lib/auth`                → validateRequest stub (évite cascade RSC)
 *  - `@/lib/rbac`                → requireRole mocké (cls UnauthorizedError/ForbiddenError préservées)
 *  - `@/lib/numbering`           → getNextCreditNoteNumber mocké
 *  - `@/lib/invoice-audit`       → logInvoiceEvent mocké
 *  - `next/cache`                → revalidatePath no-op
 *
 * Coverage (15 cas — cf <behavior> plan 11-05) :
 *  1.  RBAC COMMERCIAL → ForbiddenError → { ok:false }
 *  2.  RBAC FORMATEUR  → ForbiddenError → { ok:false }
 *  3.  RBAC ADMIN      → OK
 *  4.  RBAC MANAGER    → OK
 *  5.  RBAC COMPTABLE  → OK
 *  6.  Zod motif vide → { ok:false, error:<message> }
 *  7.  Zod amountHtToCredit négatif → erreur
 *  8.  Facture origine status=DRAFT → erreur
 *  9.  Avoir total (amount === original.amountHt) → original.status=CANCELLED
 *  10. Avoir partiel (amount < original.amountHt) → original inchangé
 *  11. amountHtToCredit > original.amountHt → erreur
 *  12. N avoirs partiels : refuse si sum(existing) + new > original.amountHt
 *  13. amountHT et amountTTC stockés NÉGATIFS côté BDD
 *  14. AuditLog invoices.credit_note_created avec diff complet
 *  15. revalidatePath('/app/factures') + revalidatePath(`/app/factures/${originalId}`) appelés
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
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      // Lot 1 e-invoicing — le vendeur figé de l'avoir se lit sur le Tenant
      // (SIREN + mention d'exonération).
      tenant: {
        findUnique: vi.fn(),
      },
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
  };
});

// Mock @/lib/auth AVANT @/lib/rbac pour empêcher la cascade vers `cache()` RSC.
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

vi.mock('@/lib/numbering', () => ({
  getNextCreditNoteNumber: vi.fn(),
  getNextInvoiceNumber: vi.fn(),
}));

vi.mock('@/lib/invoice-audit', () => ({
  logInvoiceEvent: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    siret: '12345678900012',
    rnq: '11756789012',
    addressFull: '12 rue Test',
    addressStreet: '12 rue Test',
    addressCp: '06000',
    addressVille: 'Nice',
    phone: '01 23 45 67 89',
    email: 'contact@test.fr',
    tvaIntra: null,
    iban: null,
    bic: null,
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { getNextCreditNoteNumber } from '@/lib/numbering';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { revalidatePath } from 'next/cache';
import { createCreditNote } from '../invoices';

const invoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;
const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const invoiceFindMany = prisma.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const invoiceCreate = prisma.invoice.create as unknown as ReturnType<typeof vi.fn>;
const invoiceUpdate = prisma.invoice.update as unknown as ReturnType<typeof vi.fn>;
const $transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const getNextCreditNoteNumberMock = getNextCreditNoteNumber as unknown as ReturnType<typeof vi.fn>;
const logInvoiceEventMock = logInvoiceEvent as unknown as ReturnType<typeof vi.fn>;
const revalidatePathMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;

const VALID_ORIGINAL_ID = '11111111-1111-1111-1111-111111111111';

const FAKE_ADMIN = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

const ORIGINAL_INVOICE_BASE = {
  id: VALID_ORIGINAL_ID,
  number: 'FAC-000042',
  status: 'ISSUED' as const,
  amountHT: 1000,
  amountTTC: 1000,
  vatRate: 0,
  participantId: 'part-1',
  payerOrgId: 'org-1',
  sessionId: 'sess-1',
  issueDate: new Date('2026-05-01T00:00:00Z'),
  // Lot 1 — le parc ANTÉRIEUR au lot n'a pas de parties figées : c'est le cas
  // par défaut de ces fixtures, et il ne doit pas empêcher un avoir.
  parties: [],
  payerOrg: {
    legalName: 'BIANCO INVEST',
    siren: null,
    siret: '12345678900019',
    vatNumber: null,
    address: { street: '4 rue des Oliviers', postalCode: '06000', city: 'Nice' },
    email: 'compta@bianco.fr',
    emailBilling: null,
  },
};

/** Une facture émise DEPUIS le lot 1 : elle porte ses parties figées. */
const ORIGINAL_INVOICE_AVEC_PARTIES = {
  ...ORIGINAL_INVOICE_BASE,
  parties: [
    {
      role: 'SELLER',
      legalName: 'START ACADEMY (raison sociale de l’époque)',
      siren: '123456789',
      siret: '12345678900012',
      vatNumber: null,
      addressLine1: '12 rue Test',
      addressLine2: null,
      postalCode: '06000',
      city: 'Nice',
      countryCode: 'FR',
      email: 'contact@test.fr',
      electronicAddressScheme: '0225',
      electronicAddress: '123456789',
    },
    {
      role: 'BUYER',
      legalName: 'BIANCO INVEST (raison sociale de l’époque)',
      siren: '987654321',
      siret: '98765432100019',
      vatNumber: null,
      addressLine1: '4 rue des Oliviers',
      addressLine2: null,
      postalCode: '06000',
      city: 'Nice',
      countryCode: 'FR',
      email: 'compta@bianco.fr',
      electronicAddressScheme: '0225',
      electronicAddress: '987654321',
    },
  ],
};

function setupTxPassthrough() {
  // $transaction(callback) → callback(txClient)
  // On simule un tx qui réutilise les mocks invoice.{create,update}.
  $transaction.mockImplementation(async (cb: any) => {
    const tx = {
      invoice: {
        create: invoiceCreate,
        update: invoiceUpdate,
      },
    };
    return cb(tx);
  });
}

beforeEach(() => {
  invoiceFindFirst.mockReset();
  tenantFindUnique.mockReset();
  invoiceFindMany.mockReset();
  invoiceCreate.mockReset();
  invoiceUpdate.mockReset();
  $transaction.mockReset();
  requireRoleMock.mockReset();
  getNextCreditNoteNumberMock.mockReset();
  logInvoiceEventMock.mockReset();
  logInvoiceEventMock.mockResolvedValue(undefined);
  revalidatePathMock.mockReset();

  // Defaults : ADMIN authentifié + tx passthrough + numéro AVO + findMany vide
  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  invoiceFindMany.mockResolvedValue([]);
  tenantFindUnique.mockResolvedValue({ siren: '123456789', vatExemptionText: null });
  getNextCreditNoteNumberMock.mockResolvedValue('AVO-000001');
  setupTxPassthrough();
});

describe('createCreditNote', () => {
  it('Test 1 — RBAC COMMERCIAL → ForbiddenError → { ok:false }', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle COMMERCIAL non autorisé'));

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'test motif valide',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/COMMERCIAL|non autorisé/i);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('Test 2 — RBAC FORMATEUR → ForbiddenError', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle FORMATEUR non autorisé'));

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'test motif valide',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/FORMATEUR|non autorisé/i);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('Test 3 — RBAC ADMIN → OK (création avoir partiel)', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-1', number: 'AVO-000001' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 200,
      motif: 'remise commerciale',
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.creditNoteId).toBe('avo-1');
  });

  it('Test 4 — RBAC MANAGER → OK', async () => {
    requireRoleMock.mockResolvedValueOnce({ ...FAKE_ADMIN, role: 'MANAGER' });
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-2', number: 'AVO-000002' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'erreur manager',
    });

    expect(res.ok).toBe(true);
  });

  it('Test 5 — RBAC COMPTABLE → OK', async () => {
    requireRoleMock.mockResolvedValueOnce({ ...FAKE_ADMIN, role: 'COMPTABLE' });
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-3', number: 'AVO-000003' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'écriture compta',
    });

    expect(res.ok).toBe(true);
  });

  it('Test 6 — Zod motif vide → { ok:false, error:<message> }', async () => {
    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: '',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/motif/i);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it('Test 7 — Zod amountHtToCredit négatif → erreur', async () => {
    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: -100,
      motif: 'tentative montant négatif',
    });

    expect(res.ok).toBe(false);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it('Test 8 — Facture origine status=DRAFT → erreur', async () => {
    invoiceFindFirst.mockResolvedValueOnce({ ...ORIGINAL_INVOICE_BASE, status: 'DRAFT' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'tentative avoir sur brouillon',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/brouillon|annul|avoir/i);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("Test 9 — Avoir total (amount === original.amountHt) → original.status='CANCELLED'", async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-4', number: 'AVO-000004' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 1000, // === original.amountHT
      motif: 'annulation totale',
    });

    expect(res.ok).toBe(true);
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_ORIGINAL_ID },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('Test 10 — Avoir partiel (amount < original.amountHt) → original inchangé', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-5', number: 'AVO-000005' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 300, // < 1000
      motif: 'remise partielle',
    });

    expect(res.ok).toBe(true);
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it('Test 11 — amountHtToCredit > original.amountHt → erreur', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 1500, // > 1000
      motif: 'tentative dépassement',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/dépasse|montant/i);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('Test 12 — N avoirs partiels : refuse si sum(existing) + new > original.amountHt', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    // Avoirs existants stockés en négatif → -800 = déjà 800€ avoirés
    invoiceFindMany.mockResolvedValueOnce([{ amountHT: -800 }]);

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 300, // 800 + 300 = 1100 > 1000
      motif: 'cumul dépassement',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/déjà avoirée|reste|200/i);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('Test 13 — amountHT et amountTTC stockés NÉGATIFS côté BDD', async () => {
    invoiceFindFirst.mockResolvedValueOnce({ ...ORIGINAL_INVOICE_BASE, vatRate: 20 });
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-6', number: 'AVO-000006' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 500,
      motif: 'vérification signage négatif',
    });

    expect(res.ok).toBe(true);
    const createCall = invoiceCreate.mock.calls[0]![0];
    const amountHt = Number(createCall.data.amountHT);
    const amountTtc = Number(createCall.data.amountTTC);
    expect(amountHt).toBeLessThan(0);
    expect(amountTtc).toBeLessThan(0);
    expect(amountHt).toBe(-500);
    // TVA 20% : -500 * 1.20 = -600
    expect(amountTtc).toBeCloseTo(-600, 2);
    expect(createCall.data.status).toBe('CREDIT_NOTE');
    expect(createCall.data.originalInvoiceId).toBe(VALID_ORIGINAL_ID);
  });

  it('Test 14 — AuditLog invoices.credit_note_created avec diff complet', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-7', number: 'AVO-000007' });

    await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 1000, // total → original passe CANCELLED
      motif: 'audit log check',
    });

    expect(logInvoiceEventMock).toHaveBeenCalledTimes(1);
    const arg = logInvoiceEventMock.mock.calls[0]![0];
    expect(arg.tenantId).toBe('tenant-1');
    expect(arg.actorUserId).toBe('user-1');
    expect(arg.targetInvoiceId).toBe('avo-7');
    expect(arg.action).toBe('invoices.credit_note_created');
    expect(arg.diff).toMatchObject({
      originalInvoiceId: VALID_ORIGINAL_ID,
      originalNumber: 'FAC-000042',
      amountHtCredited: 1000,
      motif: 'audit log check',
      originalStatusBefore: 'ISSUED',
      originalStatusAfter: 'CANCELLED',
    });
  });

  it('Test 15 — revalidatePath /app/factures et /app/factures/{originalId} appelés', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-8', number: 'AVO-000008' });

    await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'test revalidation',
    });

    const calls = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('/app/factures');
    expect(calls).toContain(`/app/factures/${VALID_ORIGINAL_ID}`);
  });

  // ── Lot 1 — facturation électronique ────────────────────────────────

  it('Test 16 — l’avoir porte UNE ligne négative qui redonne son montant', async () => {
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-16', number: 'AVO-000016' });

    await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 400,
      motif: 'annulation stagiaire',
    });

    const data = invoiceCreate.mock.calls[0]![0].data;
    expect(data.lines.create).toHaveLength(1);
    const ligne = data.lines.create[0];
    // Convention de STOCKAGE du dépôt (l'EN 16931 fera l'inverse au lot 2 :
    // montants positifs + TypeCode 381).
    expect(Number(ligne.totalHT)).toBe(-400);
    expect(Number(ligne.totalHT)).toBe(Number(data.amountHT));
    expect(ligne.label).toContain('FAC-000042');
    expect(ligne.label).toContain('annulation stagiaire');
    expect(ligne.participantId).toBe('part-1');
  });

  it('Test 17 — quand l’original a ses parties figées, l’avoir les RECOPIE', async () => {
    // Un avoir corrige UNE facture : ses parties sont celles de cette
    // facture-là. Recopier protège du cas réel — la raison sociale du client a
    // changé entre la facture et l'avoir.
    invoiceFindFirst.mockResolvedValueOnce(ORIGINAL_INVOICE_AVEC_PARTIES);
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-17', number: 'AVO-000017' });

    await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'reprise des parties',
    });

    const parties = invoiceCreate.mock.calls[0]![0].data.parties.create;
    expect(parties).toHaveLength(2);
    const buyer = parties.find((p: { role: string }) => p.role === 'BUYER');
    expect(buyer.legalName).toContain('de l’époque');
    expect(buyer.siren).toBe('987654321');
    // Surtout PAS le SIREN vivant du Tenant ni celui de l'Organization courante.
    expect(buyer.siren).not.toBe('123456789');
  });

  it('Test 18 — sur le parc ancien (sans parties, sans SIREN), l’avoir passe quand même', async () => {
    // Écart assumé à la consigne « SIREN client bloquant » : le code de commerce
    // impose d'annuler une facture émise PAR un avoir. Bloquer ici fermerait la
    // seule correction légale d'une facture déjà partie.
    invoiceFindFirst.mockResolvedValueOnce({
      ...ORIGINAL_INVOICE_BASE,
      payerOrg: { ...ORIGINAL_INVOICE_BASE.payerOrg, siren: null, siret: null },
    });
    invoiceCreate.mockResolvedValueOnce({ id: 'avo-18', number: 'AVO-000018' });

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'client sans siren',
    });

    expect(res.ok).toBe(true);
    const buyer = invoiceCreate.mock.calls[0]![0].data.parties.create.find(
      (p: { role: string }) => p.role === 'BUYER',
    );
    expect(buyer.siren).toBeNull();
    // Pas de SIREN ⇒ pas d'adresse d'annuaire inventée.
    expect(buyer.electronicAddress).toBeNull();
  });

  it('Test 19 — l’avoir pose son empreinte, et elle dépend du motif', async () => {
    invoiceFindFirst.mockResolvedValue(ORIGINAL_INVOICE_BASE);
    invoiceCreate.mockResolvedValue({ id: 'avo-19', number: 'AVO-000019' });

    await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'motif A',
    });
    const empreinteA = invoiceCreate.mock.calls[0]![0].data.sourceFingerprint;

    invoiceCreate.mockClear();
    await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'motif B',
    });
    const empreinteB = invoiceCreate.mock.calls[0]![0].data.sourceFingerprint;

    expect(empreinteA).toHaveLength(64);
    expect(empreinteA).not.toBe(empreinteB);
  });

  it('Test 16 — facture introuvable (mauvais tenant) → erreur', async () => {
    invoiceFindFirst.mockResolvedValueOnce(null);

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'facture introuvable',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable/i);
  });

  it('Test 17 — RBAC unauthenticated → UnauthorizedError', async () => {
    requireRoleMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await createCreditNote({
      originalInvoiceId: VALID_ORIGINAL_ID,
      amountHtToCredit: 100,
      motif: 'unauth check',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/authentifi/i);
  });
});
