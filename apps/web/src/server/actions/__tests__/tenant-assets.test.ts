import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 7 Plan 07-03 Task 2 — Server Actions tenant-assets.
 *
 * Stratégie de mock :
 *  - `@qualiof/db` : prisma.tenant.{findUnique,update} + prisma.auditLog.create
 *  - `@/lib/auth` : validateRequest mocké (default = user authentifié)
 *  - `next/cache` : revalidatePath no-op
 *  - `@/lib/closure/shared-template` : invalidateAssetCache mocké (vérification appel)
 *  - `node:fs` : `promises.{mkdir,writeFile,unlink}` mockés pour observer les
 *    writes sans toucher au disque réel. Note : on conserve `node:fs` "réel"
 *    car `node:path` est nécessaire et `process.cwd()` aussi — on mocke
 *    UNIQUEMENT les méthodes async de fs.promises.
 *
 * Coverage (12 tests) :
 *  1. uploadTenantLogo OK → write fichier + update Tenant.logoPath + AuditLog + cache invalidation
 *  2. uploadTenantLogo > 5 Mo → { ok:false, error:'Logo > 5 Mo' } sans toucher disque/BDD
 *  3. uploadTenantLogo mime PDF → { ok:false, error:'Format autorisé : PNG, JPG, SVG' }
 *  4. uploadTenantSignature 'pedago' OK → écrit signature-pedago.png + update signaturePedagoPath
 *  5. uploadTenantSignature 'dirigeant' OK → écrit signature-dirigeant.png + update signatureDirigeantPath
 *  6. uploadTenantSignature SVG mime → erreur (SVG non autorisé pour signature)
 *  7. resetTenantLogo OK → unlink + set logoPath=null + AuditLog 'parameters.reset.logo'
 *  8. resetTenantLogo idempotent → si déjà null, no-op (pas d'AuditLog)
 *  9. resetTenantSignature 'pedago' OK → unlink + set signaturePedagoPath=null
 * 10. Toutes les actions retournent { ok:false } si pas authentifié
 * 11. Toutes les actions OK appellent invalidateAssetCache(user.tenantId)
 * 12. uploadTenantLogo : action AuditLog = 'parameters.upload.logo' (convention D-09)
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

vi.mock('@/lib/closure/shared-template', () => ({
  invalidateAssetCache: vi.fn(),
}));

// Mock node:fs/promises selectivement — on patch directement fs.promises
vi.mock('node:fs', () => {
  const promisesMock = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: { promises: promisesMock },
    promises: promisesMock,
  };
});

// Imports après mocks
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { invalidateAssetCache } from '@/lib/closure/shared-template';
import { promises as fs } from 'node:fs';
import {
  uploadTenantLogo,
  uploadTenantSignature,
  resetTenantLogo,
  resetTenantSignature,
} from '../tenant-assets';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const tenantUpdate = prisma.tenant.update as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;
const invalidateMock = invalidateAssetCache as unknown as ReturnType<typeof vi.fn>;
const mkdirMock = fs.mkdir as unknown as ReturnType<typeof vi.fn>;
const writeFileMock = fs.writeFile as unknown as ReturnType<typeof vi.fn>;
const unlinkMock = fs.unlink as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { id: 'user-1', tenantId: 'tenant-1' };

// PNG minimal 1x1 transparent
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function makeFile(opts: { name: string; type: string; size?: number; content?: Buffer }): File {
  const content = opts.content ?? TINY_PNG;
  const sizeBytes = opts.size ?? content.length;
  // Si on veut un fichier "plus gros", on duplique le buffer
  const finalBuf =
    sizeBytes <= content.length ? content : Buffer.concat([content, Buffer.alloc(sizeBytes - content.length)]);
  // Cast Buffer→Uint8Array pour satisfaire le type BlobPart strict (TS 5.7+).
  return new File([new Uint8Array(finalBuf)], opts.name, { type: opts.type });
}

function makeFormData(file: File): FormData {
  const fd = new FormData();
  fd.set('file', file);
  return fd;
}

beforeEach(() => {
  tenantFindUnique.mockReset();
  tenantUpdate.mockReset();
  auditLogCreate.mockReset();
  validateRequestMock.mockReset();
  invalidateMock.mockReset();
  mkdirMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();

  // Defaults — user authentifié, fs ops succeed
  validateRequestMock.mockResolvedValue({ user: FAKE_USER, session: { id: 's1' } });
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  unlinkMock.mockResolvedValue(undefined);
});

// ─── uploadTenantLogo ───────────────────────────────────────────────────

describe('uploadTenantLogo', () => {
  it("Test 1 — OK : write fichier + update Tenant.logoPath + AuditLog + cache invalidation", async () => {
    tenantFindUnique.mockResolvedValueOnce({ logoPath: null });
    tenantUpdate.mockResolvedValueOnce({ logoPath: '/of-assets/tenant-1/logo.png' });

    const file = makeFile({ name: 'logo.png', type: 'image/png' });
    const result = await uploadTenantLogo(makeFormData(file));

    expect(result).toEqual({ ok: true, path: '/of-assets/tenant-1/logo.png' });
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalled();
    const writeCall = writeFileMock.mock.calls[0]!;
    expect(writeCall[0]).toContain('public/of-assets/tenant-1/logo.png');
    // Supprime les variantes png/jpg/svg (idempotent même si absentes)
    expect(unlinkMock).toHaveBeenCalledTimes(3);

    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { logoPath: '/of-assets/tenant-1/logo.png' },
    });

    expect(invalidateMock).toHaveBeenCalledWith('tenant-1');

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.action).toBe('parameters.upload.logo');
    expect(auditCall.data.entity).toBe('Tenant');
    expect(auditCall.data.entityId).toBe('tenant-1');
    expect(auditCall.data.userId).toBe('user-1');
    expect(auditCall.data.diff.logoPath).toEqual({
      before: null,
      after: '/of-assets/tenant-1/logo.png',
    });
  });

  it("Test 2 — > 5 Mo : retourne erreur, ne touche pas disque/BDD", async () => {
    const file = makeFile({ name: 'logo.png', type: 'image/png', size: 6 * 1024 * 1024 });
    const result = await uploadTenantLogo(makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5 Mo');
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("Test 3 — mime PDF non autorisé : retourne erreur format", async () => {
    const file = makeFile({ name: 'logo.pdf', type: 'application/pdf' });
    const result = await uploadTenantLogo(makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/PNG.*JPG.*SVG/);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("Test 12 — convention AuditLog action='parameters.upload.logo' (D-09)", async () => {
    tenantFindUnique.mockResolvedValueOnce({ logoPath: '/of-assets/tenant-1/logo-old.png' });
    tenantUpdate.mockResolvedValueOnce({ logoPath: '/of-assets/tenant-1/logo.svg' });

    const file = makeFile({ name: 'logo.svg', type: 'image/svg+xml' });
    await uploadTenantLogo(makeFormData(file));

    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe('parameters.upload.logo');
    expect(auditLogCreate.mock.calls[0]![0].data.diff.logoPath.after).toBe(
      '/of-assets/tenant-1/logo.svg',
    );
  });
});

// ─── uploadTenantSignature ──────────────────────────────────────────────

describe('uploadTenantSignature', () => {
  it("Test 4 — role='pedago' OK : écrit signature-pedago.png + update signaturePedagoPath", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      signaturePedagoPath: null,
      signatureDirigeantPath: null,
    });
    tenantUpdate.mockResolvedValueOnce({
      signaturePedagoPath: '/of-assets/tenant-1/signature-pedago.png',
    });

    const file = makeFile({ name: 'sig.png', type: 'image/png' });
    const result = await uploadTenantSignature('pedago', makeFormData(file));

    expect(result).toEqual({
      ok: true,
      path: '/of-assets/tenant-1/signature-pedago.png',
    });

    expect(writeFileMock.mock.calls[0]![0]).toContain('signature-pedago.png');
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { signaturePedagoPath: '/of-assets/tenant-1/signature-pedago.png' },
    });
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe(
      'parameters.upload.signature.pedago',
    );
  });

  it("Test 5 — role='dirigeant' OK : écrit signature-dirigeant.png + update signatureDirigeantPath", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      signaturePedagoPath: null,
      signatureDirigeantPath: null,
    });
    tenantUpdate.mockResolvedValueOnce({
      signatureDirigeantPath: '/of-assets/tenant-1/signature-dirigeant.png',
    });

    const file = makeFile({ name: 'sig.png', type: 'image/png' });
    const result = await uploadTenantSignature('dirigeant', makeFormData(file));

    expect(result).toEqual({
      ok: true,
      path: '/of-assets/tenant-1/signature-dirigeant.png',
    });

    expect(writeFileMock.mock.calls[0]![0]).toContain('signature-dirigeant.png');
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { signatureDirigeantPath: '/of-assets/tenant-1/signature-dirigeant.png' },
    });
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe(
      'parameters.upload.signature.dirigeant',
    );
  });

  it("Test 6 — SVG mime refusé pour signature (PNG/JPG only)", async () => {
    const file = makeFile({ name: 'sig.svg', type: 'image/svg+xml' });
    const result = await uploadTenantSignature('pedago', makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/PNG.*JPG/);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("Test 6bis — > 2 Mo : retourne erreur signature", async () => {
    const file = makeFile({ name: 'sig.png', type: 'image/png', size: 3 * 1024 * 1024 });
    const result = await uploadTenantSignature('pedago', makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('2 Mo');
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

// ─── resetTenantLogo ────────────────────────────────────────────────────

describe('resetTenantLogo', () => {
  it("Test 7 — OK : unlink + set logoPath=null + AuditLog 'parameters.reset.logo'", async () => {
    tenantFindUnique.mockResolvedValueOnce({ logoPath: '/of-assets/tenant-1/logo.png' });
    tenantUpdate.mockResolvedValueOnce({ logoPath: null });

    const result = await resetTenantLogo();

    expect(result).toEqual({ ok: true });
    // unlink appelé 3x (png + jpg + svg)
    expect(unlinkMock).toHaveBeenCalledTimes(3);
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { logoPath: null },
    });
    expect(invalidateMock).toHaveBeenCalledWith('tenant-1');
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe('parameters.reset.logo');
    expect(auditLogCreate.mock.calls[0]![0].data.diff.logoPath).toEqual({
      before: '/of-assets/tenant-1/logo.png',
      after: null,
    });
  });

  it("Test 8 — idempotent : si logoPath déjà null, no-op (pas d'AuditLog)", async () => {
    tenantFindUnique.mockResolvedValueOnce({ logoPath: null });

    const result = await resetTenantLogo();

    expect(result).toEqual({ ok: true });
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

// ─── resetTenantSignature ───────────────────────────────────────────────

describe('resetTenantSignature', () => {
  it("Test 9 — role='pedago' OK : unlink + set signaturePedagoPath=null", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      signaturePedagoPath: '/of-assets/tenant-1/signature-pedago.png',
      signatureDirigeantPath: null,
    });
    tenantUpdate.mockResolvedValueOnce({ signaturePedagoPath: null });

    const result = await resetTenantSignature('pedago');

    expect(result).toEqual({ ok: true });
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(unlinkMock.mock.calls[0]![0]).toContain('signature-pedago.png');
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { signaturePedagoPath: null },
    });
    expect(invalidateMock).toHaveBeenCalledWith('tenant-1');
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe(
      'parameters.reset.signature.pedago',
    );
  });

  it("Test 9bis — role='dirigeant' idempotent si déjà null", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      signaturePedagoPath: null,
      signatureDirigeantPath: null,
    });
    const result = await resetTenantSignature('dirigeant');

    expect(result).toEqual({ ok: true });
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

// ─── Auth gate ──────────────────────────────────────────────────────────

describe('Auth gate — toutes les actions retournent { ok:false } si pas user', () => {
  beforeEach(() => {
    validateRequestMock.mockResolvedValue({ user: null, session: null });
  });

  it("Test 10a — uploadTenantLogo non authentifié", async () => {
    const file = makeFile({ name: 'logo.png', type: 'image/png' });
    const result = await uploadTenantLogo(makeFormData(file));
    expect(result).toEqual({ ok: false, error: 'Non authentifié' });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("Test 10b — uploadTenantSignature non authentifié", async () => {
    const file = makeFile({ name: 'sig.png', type: 'image/png' });
    const result = await uploadTenantSignature('pedago', makeFormData(file));
    expect(result.ok).toBe(false);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("Test 10c — resetTenantLogo non authentifié", async () => {
    const result = await resetTenantLogo();
    expect(result.ok).toBe(false);
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it("Test 10d — resetTenantSignature non authentifié", async () => {
    const result = await resetTenantSignature('pedago');
    expect(result.ok).toBe(false);
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });
});
