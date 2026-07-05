import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 18 Plan 18-03 Task 2 — Server actions direct-to-storage
 * (signed upload URL admin + public par token, confirmation + recâblage OCR).
 *
 * Stratégie de mock (hermétique — vitest ne charge pas .env) :
 *  - `@/lib/storage` → createSignedUploadUrl mocké → { path, token, signedUrl },
 *    + constantes DOCS_BUCKET / PREENROLLMENT_BUCKET réelles.
 *  - `@/lib/auth` → validateRequest mocké (default user authentifié).
 *  - `@qualiof/db` → prisma.preEnrollment (findUnique/update) mocké.
 *  - `@/lib/preinscription-extractor` → extractPreEnrollmentDocuments spy
 *    (prouve le recâblage OCR — Pitfall 4).
 *  - `next/cache` → revalidatePath no-op.
 *
 * Coverage (5 tests) :
 *  1. createApprenantUploadUrl('CNI','jpg') → ok, path apprenants/t1/…/cni.jpg,
 *     createSignedUploadUrl appelé avec DOCS_BUCKET.
 *  2. createApprenantUploadUrl sans user → { ok:false, error:'Non authentifié' }.
 *  3. createPreEnrollmentUploadUrl('badtok',…) prisma → null → { ok:false, error:'Lien invalide' }.
 *  4. (WORK-04) confirmPreEnrollmentUpload valide → laisse la row en SUBMITTED
 *     (queue OCR alimentée) et NE déclenche PLUS extractPreEnrollmentDocuments
 *     (l'OCR fire-and-forget est mort en serverless — le worker long-vivant poll).
 *  5. createPreEnrollmentUploadUrl token expiré → { ok:false, error:'Ce lien a expiré' }.
 */

// vi.hoisted : les factories vi.mock sont hoistées AU-DESSUS des const → le mock
// doit être créé dans un bloc lui-même hoisté pour être accessible dans la factory.
const { createSignedUploadUrlMock } = vi.hoisted(() => ({
  createSignedUploadUrlMock: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  createSignedUploadUrl: createSignedUploadUrlMock,
  DOCS_BUCKET: 'qualiof-docs',
  PREENROLLMENT_BUCKET: 'preinscriptions',
}));

vi.mock('@/lib/auth', () => ({
  validateRequest: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    preEnrollment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/preinscription-extractor', () => ({
  extractPreEnrollmentDocuments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  createApprenantUploadUrl,
  createPreEnrollmentUploadUrl,
  confirmPreEnrollmentUpload,
  confirmApprenantUpload,
} from '../storage-upload';
import { validateRequest } from '@/lib/auth';
import { prisma } from '@qualiof/db';
import { extractPreEnrollmentDocuments } from '@/lib/preinscription-extractor';

const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.preEnrollment.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.preEnrollment.update as unknown as ReturnType<typeof vi.fn>;
const extractMock = extractPreEnrollmentDocuments as unknown as ReturnType<typeof vi.fn>;

describe('storage-upload server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSignedUploadUrlMock.mockResolvedValue({
      path: 'p',
      token: 'tok',
      signedUrl: 'https://sb/put',
    });
    validateRequestMock.mockResolvedValue({ user: { tenantId: 't1' } });
  });

  it('Test 1: createApprenantUploadUrl(CNI, jpg) → ok, path scopé tenant, DOCS_BUCKET', async () => {
    const res = await createApprenantUploadUrl('CNI', 'jpg');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.path).toContain('apprenants/t1/');
      expect(res.path).toMatch(/cni\.jpg$/);
      expect(res.token).toBe('tok');
      expect(res.signedUrl).toBe('https://sb/put');
    }
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith('qualiof-docs', expect.stringContaining('apprenants/t1/'));
  });

  it('Test 2: createApprenantUploadUrl sans user → Non authentifié', async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await createApprenantUploadUrl('CNI', 'jpg');
    expect(res).toEqual({ ok: false, error: 'Non authentifié' });
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('Test 3: createPreEnrollmentUploadUrl(badtok) → Lien invalide', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await createPreEnrollmentUploadUrl('badtok', 'CNI', 'jpg');
    expect(res).toEqual({ ok: false, error: 'Lien invalide' });
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('Test 4 (WORK-04): confirmPreEnrollmentUpload valide → laisse SUBMITTED, NE déclenche PLUS l’OCR', async () => {
    // Phase 20 WORK-04 : l'OCR n'est plus déclenché en fire-and-forget dans la
    // server action (mort en serverless Vercel + pas de pdftoppm). La row reste
    // SUBMITTED et le worker OCR long-vivant la poll. On prouve donc l'INVERSE :
    // status SUBMITTED persisté (queue alimentée) ET extractMock jamais appelé.
    findUniqueMock.mockResolvedValue({
      id: 'pe1',
      token: 'goodtok',
      expiresAt: new Date(Date.now() + 3600_000),
      status: 'PENDING_FORM',
      cniKey: null,
      ribKey: null,
      cfpKey: null,
    });
    updateMock.mockResolvedValue({});
    const res = await confirmPreEnrollmentUpload(
      'goodtok',
      { CNI: 'goodtok/cni-1.jpg' },
      {
        firstName: 'Jean',
        lastName: 'DUPONT',
        email: 'jean@ex.fr',
        rgpdAccepted: true,
      },
    );
    expect(res.ok).toBe(true);
    // Queue OCR alimentée : la row est persistée en statut SUBMITTED.
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0].data.status).toBe('SUBMITTED');
    // L'OCR n'est PLUS déclenché ici (le worker prend le relais via poll).
    await Promise.resolve();
    await Promise.resolve();
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('Test 5: createPreEnrollmentUploadUrl token expiré → Ce lien a expiré', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'pe1',
      token: 'oldtok',
      expiresAt: new Date(Date.now() - 1000),
      status: 'PENDING_FORM',
    });
    const res = await createPreEnrollmentUploadUrl('oldtok', 'CNI', 'jpg');
    expect(res).toEqual({ ok: false, error: 'Ce lien a expiré' });
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('smoke: confirmApprenantUpload retourne les keys pour le wizard admin', async () => {
    const res = await confirmApprenantUpload({ CNI: 'apprenants/t1/x/cni.jpg' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.keys).toEqual({ CNI: 'apprenants/t1/x/cni.jpg' });
  });
});
