import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 7 Plan 07-02 Task 3 — Server Actions Paramètres OF + AuditLog.
 *
 * Stratégie de mock :
 *  - `@qualiof/db` → prisma mocké (tenant.findUnique/update + auditLog.create)
 *  - `@/lib/auth` → validateRequest mocké (default = user authentifié, override
 *    par test pour le cas "non authentifié")
 *  - `next/cache` → revalidatePath no-op (on ne vérifie pas son appel, juste
 *    qu'il ne casse pas le test)
 *
 * Coverage (10 tests) :
 *  1. updateTenantIdentity OK → tenant.update + auditLog.create
 *  2. updateTenantIdentity SIRET invalide → { ok:false, fieldErrors:{siret} }
 *  3. updateTenantIdentity no-op (rien ne change) → PAS d'auditLog.create
 *  4. updateTenantBilling OK → update + auditLog
 *  5. updateTenantAddress OK → update + auditLog
 *  6. updateTenantEmail OK → update + auditLog (avec emailFrom '' → null)
 *  7. computeDiff retourne seulement les champs modifiés
 *  8. computeDiff same/same → {} (objet vide)
 *  9. Toutes les actions retournent { ok:true } | { ok:false, error, fieldErrors? }
 * 10. Toutes les actions retournent { ok:false } si pas user (validateRequest)
 */

// Mocks AVANT imports du SUT
vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
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
}));

vi.mock('@/lib/auth', () => ({
  validateRequest: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Imports après mocks
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import {
  updateTenantIdentity,
  updateTenantAddress,
  updateTenantBilling,
  updateTenantEmail,
} from '../tenant-settings';
import { computeDiff } from '@/lib/audit-log';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const tenantUpdate = prisma.tenant.update as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { id: 'user-1', tenantId: 'tenant-1' };

beforeEach(() => {
  tenantFindUnique.mockReset();
  tenantUpdate.mockReset();
  auditLogCreate.mockReset();
  validateRequestMock.mockReset();
  // Default : user authentifié
  validateRequestMock.mockResolvedValue({ user: FAKE_USER, session: { id: 's1' } });
});

// ─── computeDiff (helper pur) ────────────────────────────────────────────

describe('computeDiff', () => {
  it('Test 7 — retourne uniquement les champs modifiés', () => {
    const diff = computeDiff(
      { name: 'Old', siret: '111', rcs: null },
      { name: 'New', siret: '111', rcs: null },
    );
    expect(diff).toEqual({ name: { before: 'Old', after: 'New' } });
  });

  it('Test 8 — retourne {} si rien ne change', () => {
    const diff = computeDiff(
      { name: 'X', siret: '111', rcs: null },
      { name: 'X', siret: '111', rcs: null },
    );
    expect(diff).toEqual({});
  });

  it('Test 8bis — null vs undefined considérés égaux (deux représentations de "vide")', () => {
    const diff = computeDiff({ siret: null }, { siret: undefined });
    expect(diff).toEqual({});
  });

  it('Test 8ter — diff sur objet Json (address) comparé via JSON.stringify', () => {
    const diff = computeDiff(
      { address: { street: 'Old', city: 'Paris' } },
      { address: { street: 'New', city: 'Paris' } },
    );
    expect(diff.address).toBeDefined();
    expect(diff.address?.before).toEqual({ street: 'Old', city: 'Paris' });
    expect(diff.address?.after).toEqual({ street: 'New', city: 'Paris' });
  });
});

// ─── updateTenantIdentity ────────────────────────────────────────────────

describe('updateTenantIdentity', () => {
  it("Test 1 — succès : update + AuditLog avec action='parameters.update'", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      name: 'Old name',
      siret: null,
      numDA: null,
      rcs: null,
      legalForm: null,
    });
    tenantUpdate.mockResolvedValueOnce({
      name: 'Start Academy',
      siret: '81423718600030',
      numDA: null,
      rcs: null,
      legalForm: null,
    });

    const result = await updateTenantIdentity({
      name: 'Start Academy',
      siret: '81423718600030',
    });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ name: 'Start Academy', siret: '81423718600030' }),
      select: { name: true, siret: true, numDA: true, rcs: true, legalForm: true },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.entity).toBe('Tenant');
    expect(auditCall.data.entityId).toBe('tenant-1');
    expect(auditCall.data.action).toBe('parameters.update');
    expect(auditCall.data.userId).toBe('user-1');
    expect(auditCall.data.diff.name).toEqual({ before: 'Old name', after: 'Start Academy' });
    expect(auditCall.data.diff.siret).toEqual({ before: null, after: '81423718600030' });
  });

  it("Test 2 — SIRET invalide → { ok:false, fieldErrors:{siret} } sans toucher BDD", async () => {
    const result = await updateTenantIdentity({ name: 'X', siret: 'INVALID' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.siret).toBeDefined();
      expect(result.fieldErrors?.siret?.length).toBeGreaterThan(0);
    }
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 3 — no-op (aucun champ ne change) → AuditLog PAS créé", async () => {
    const same = {
      name: 'Start Academy',
      siret: '81423718600030',
      numDA: null,
      rcs: null,
      legalForm: null,
    };
    tenantFindUnique.mockResolvedValueOnce(same);
    tenantUpdate.mockResolvedValueOnce(same);

    const result = await updateTenantIdentity({
      name: 'Start Academy',
      siret: '81423718600030',
    });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

// ─── updateTenantAddress ────────────────────────────────────────────────

describe('updateTenantAddress', () => {
  it("Test 5 — succès : update address + legalMentions + AuditLog", async () => {
    tenantFindUnique.mockResolvedValueOnce({ address: null, legalMentions: null });
    const afterAddr = { street: '12 rue X', postalCode: '75001', city: 'Paris', country: 'France' };
    tenantUpdate.mockResolvedValueOnce({
      address: afterAddr,
      legalMentions: 'Mentions Start Academy',
    });

    const result = await updateTenantAddress({
      address: afterAddr,
      legalMentions: 'Mentions Start Academy',
    });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({ legalMentions: 'Mentions Start Academy' }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0]?.[0]?.data.action).toBe('parameters.update');
    expect(auditLogCreate.mock.calls[0]?.[0]?.data.entity).toBe('Tenant');
  });
});

// ─── updateTenantBilling ────────────────────────────────────────────────

describe('updateTenantBilling', () => {
  it("Test 4 — succès : update invoicePrefix + IBAN + BIC + AuditLog", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      invoicePrefix: 'FAC',
      iban: null,
      bic: null,
    });
    tenantUpdate.mockResolvedValueOnce({
      invoicePrefix: 'INV',
      iban: 'FR7612345678901234567890123',
      bic: 'BNPAFRPP',
    });

    const result = await updateTenantBilling({
      invoicePrefix: 'INV',
      iban: 'FR76 1234 5678 9012 3456 7890 123',
      bic: 'BNPAFRPP',
    });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({
          invoicePrefix: 'INV',
          iban: 'FR7612345678901234567890123', // espaces normalisés par Zod preprocess
          bic: 'BNPAFRPP',
        }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditDiff = auditLogCreate.mock.calls[0]?.[0]?.data.diff;
    expect(auditDiff.invoicePrefix).toEqual({ before: 'FAC', after: 'INV' });
    expect(auditDiff.iban).toEqual({ before: null, after: 'FR7612345678901234567890123' });
  });
});

// ─── updateTenantEmail ──────────────────────────────────────────────────

describe('updateTenantEmail', () => {
  it("Test 6 — succès : update emailFrom + AuditLog", async () => {
    tenantFindUnique.mockResolvedValueOnce({ emailFrom: null });
    tenantUpdate.mockResolvedValueOnce({ emailFrom: 'formation@start-academy.fr' });

    const result = await updateTenantEmail({ emailFrom: 'formation@start-academy.fr' });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { emailFrom: 'formation@start-academy.fr' },
      select: { emailFrom: true },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0]?.[0]?.data.action).toBe('parameters.update');
  });

  it("Test 6bis — emailFrom vide ('') → BDD reçoit null (revient en fallback ENV)", async () => {
    tenantFindUnique.mockResolvedValueOnce({ emailFrom: 'old@x.fr' });
    tenantUpdate.mockResolvedValueOnce({ emailFrom: null });

    const result = await updateTenantEmail({ emailFrom: '' });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { emailFrom: null }, // '' || null === null
      select: { emailFrom: true },
    });
  });
});

// ─── Auth gate (Test 10) ────────────────────────────────────────────────

describe('Auth gate — toutes les actions retournent { ok:false } si pas user', () => {
  beforeEach(() => {
    validateRequestMock.mockResolvedValue({ user: null, session: null });
  });

  it("Test 10a — updateTenantIdentity non authentifié", async () => {
    const result = await updateTenantIdentity({ name: 'X' });
    expect(result).toEqual({ ok: false, error: 'Non authentifié' });
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 10b — updateTenantAddress non authentifié", async () => {
    const result = await updateTenantAddress({ legalMentions: 'X' });
    expect(result.ok).toBe(false);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 10c — updateTenantBilling non authentifié", async () => {
    const result = await updateTenantBilling({ invoicePrefix: 'FAC', iban: null, bic: null });
    expect(result.ok).toBe(false);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 10d — updateTenantEmail non authentifié", async () => {
    const result = await updateTenantEmail({ emailFrom: '' });
    expect(result.ok).toBe(false);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
