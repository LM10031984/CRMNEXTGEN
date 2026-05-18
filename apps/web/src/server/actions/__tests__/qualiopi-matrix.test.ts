import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9.1 Plan 09.1-02 Task 1 — Tests server actions qualiopi-matrix.
 *
 * Stratégie de mock (cohérente Phase 7/8/9) :
 *  - `@qualiof/db`              → prisma mocké (sessionParticipant findFirst,
 *                                  $executeRaw, $transaction, document deleteMany,
 *                                  trainingSession findUnique)
 *  - `@/lib/rbac`               → requireRole mocké
 *  - `@/lib/document-audit`     → logDocumentEvent mocké
 *  - `@/lib/storage`            → uploadFile mocké + DOCS_BUCKET const
 *  - `../closure-pack`          → generateClosurePack mocké
 *  - `../convention-generator`  → generateConventionForParticipant mocké
 *  - `../agefice-generator`     → generateAgeficeForParticipant mocké
 *  - `../programme-generator`   → generateProgrammeForProduct mocké
 *  - `next/cache`               → revalidatePath no-op
 *
 * Coverage (9 tests minimum — 1 par item <behavior> du plan) :
 *  1. markDocStatus user non-admin → ok:false + error RBAC
 *  2. markDocStatus cross-tenant participant introuvable → ok:false
 *  3. markDocStatus markedOkWithoutUpload → jsonb_set + logDocumentEvent status_change
 *  4. uploadSignedDoc rejette mime non-PDF → ok:false + error format
 *  5. uploadSignedDoc rejette file > 10MB → ok:false + error taille
 *  6. uploadSignedDoc succès → uploadFile + jsonb_set + logDocumentEvent upload_signed
 *  7. regenerateParticipantDoc docKind=CONVENTION → appelle generateConventionForParticipant
 *  8. regenerateParticipantDoc docKind=CERTIFICAT → appelle generateClosurePack avec force=true + kinds=['CERTIFICAT']
 *  9. deleteDocument → $transaction (document.deleteMany + $executeRaw reset docStatus)
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: {
      findFirst: vi.fn(),
    },
    trainingSession: {
      findUnique: vi.fn(),
    },
    document: {
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  // Re-export Prisma namespace minimal (sql template tag, used by raw queries).
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      __isPrismaSql: true,
    }),
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

// Mock @/lib/auth AVANT @/lib/rbac (pattern Phase 9).
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

vi.mock('@/lib/document-audit', () => ({
  logDocumentEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue({ key: 'k', bucket: 'qualiof-docs', size: 1 }),
}));

vi.mock('../closure-pack', () => ({
  generateClosurePack: vi.fn(),
}));

vi.mock('../convention-generator', () => ({
  generateConventionForParticipant: vi.fn(),
}));

vi.mock('../agefice-generator', () => ({
  generateAgeficeForParticipant: vi.fn(),
}));

vi.mock('../programme-generator', () => ({
  generateProgrammeForParticipant: vi.fn(),
  generateProgrammeForProduct: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import { logDocumentEvent } from '@/lib/document-audit';
import { uploadFile } from '@/lib/storage';
import { generateClosurePack } from '../closure-pack';
import { generateConventionForParticipant } from '../convention-generator';
import { generateAgeficeForParticipant } from '../agefice-generator';
import { generateProgrammeForProduct } from '../programme-generator';
import {
  markDocStatus,
  uploadSignedDoc,
  regenerateParticipantDoc,
  regenerateBatchParticipantDocs,
  deleteDocument,
} from '../qualiopi-matrix';

const participantFindFirst = prisma.sessionParticipant.findFirst as unknown as ReturnType<typeof vi.fn>;
const sessionFindUnique = prisma.trainingSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const documentDeleteMany = prisma.document.deleteMany as unknown as ReturnType<typeof vi.fn>;
const executeRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const logDocumentEventMock = logDocumentEvent as unknown as ReturnType<typeof vi.fn>;
const uploadFileMock = uploadFile as unknown as ReturnType<typeof vi.fn>;
const generateClosurePackMock = generateClosurePack as unknown as ReturnType<typeof vi.fn>;
const generateConventionMock = generateConventionForParticipant as unknown as ReturnType<typeof vi.fn>;
const generateAgeficeMock = generateAgeficeForParticipant as unknown as ReturnType<typeof vi.fn>;
const generateProgrammeMock = generateProgrammeForProduct as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-0000000000a0',
  email: 'admin@test.fr',
  role: 'ADMIN',
  firstName: 'Admin',
  lastName: 'Test',
};

const VALID_PARTICIPANT_ID = '00000000-0000-0000-0000-000000000010';
const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000020';

beforeEach(() => {
  participantFindFirst.mockReset();
  sessionFindUnique.mockReset();
  documentDeleteMany.mockReset();
  executeRaw.mockReset();
  executeRaw.mockResolvedValue(1);
  transaction.mockReset();
  transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  requireRoleMock.mockReset();
  logDocumentEventMock.mockReset();
  logDocumentEventMock.mockResolvedValue(undefined);
  uploadFileMock.mockReset();
  uploadFileMock.mockResolvedValue({ key: 'k', bucket: 'qualiof-docs', size: 1 });
  generateClosurePackMock.mockReset();
  generateConventionMock.mockReset();
  generateAgeficeMock.mockReset();
  generateProgrammeMock.mockReset();

  requireRoleMock.mockResolvedValue(TEST_USER);
});

// ─── markDocStatus ──────────────────────────────────────────────────────

describe('markDocStatus', () => {
  it("Test 1 — user non-admin (Forbidden) → ok:false avec message d'erreur RBAC", async () => {
    requireRoleMock.mockReset();
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle COMMERCIAL non autorisé'));

    const r = await markDocStatus({
      participantId: VALID_PARTICIPANT_ID,
      docType: 'PROGRAMME',
      state: 'MANUAL_OK',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('non autorisé');
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('Test 2 — cross-tenant participant introuvable → ok:false', async () => {
    participantFindFirst.mockResolvedValueOnce(null);

    const r = await markDocStatus({
      participantId: VALID_PARTICIPANT_ID,
      docType: 'CONVENTION',
      state: 'MANUAL_OK',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Inscription introuvable');
    expect(participantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: VALID_PARTICIPANT_ID,
          session: { tenantId: TEST_USER.tenantId },
        }),
      }),
    );
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('Test 3 — markedOkWithoutUpload=true → jsonb_set + logDocumentEvent status_change', async () => {
    participantFindFirst.mockResolvedValueOnce({
      id: VALID_PARTICIPANT_ID,
      sessionId: VALID_SESSION_ID,
      docStatus: null,
    });

    const r = await markDocStatus({
      participantId: VALID_PARTICIPANT_ID,
      docType: 'PROGRAMME',
      state: 'MANUAL_OK',
      markedOkWithoutUpload: true,
      note: 'Signature physique scannée plus tard',
    });

    expect(r.ok).toBe(true);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(logDocumentEventMock).toHaveBeenCalledTimes(1);
    const logArg = logDocumentEventMock.mock.calls[0]![0];
    expect(logArg.action).toBe('documents.status_change');
    expect(logArg.tenantId).toBe(TEST_USER.tenantId);
    expect(logArg.actorUserId).toBe(TEST_USER.id);
    expect(logArg.targetEntityId).toBe(VALID_PARTICIPANT_ID);
    expect(logArg.diff).toHaveProperty('PROGRAMME');
  });
});

// ─── uploadSignedDoc ────────────────────────────────────────────────────

function makePdfFormData(opts: { mime: string; size?: number; participantId?: string; docType?: string }): FormData {
  const fd = new FormData();
  const size = opts.size ?? 1024;
  const content = new Uint8Array(size);
  const file = new File([content], 'signed.pdf', { type: opts.mime });
  fd.append('file', file);
  fd.append('participantId', opts.participantId ?? VALID_PARTICIPANT_ID);
  fd.append('docType', opts.docType ?? 'CONVENTION');
  return fd;
}

describe('uploadSignedDoc', () => {
  it('Test 4 — rejette mime non-PDF → ok:false + erreur format', async () => {
    const fd = makePdfFormData({ mime: 'image/png' });

    const r = await uploadSignedDoc(fd);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PDF');
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('Test 5 — rejette file > 10MB → ok:false + erreur taille', async () => {
    const fd = makePdfFormData({ mime: 'application/pdf', size: 11 * 1024 * 1024 });

    const r = await uploadSignedDoc(fd);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('10 Mo');
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('Test 6 — succès → uploadFile + jsonb_set + logDocumentEvent upload_signed', async () => {
    participantFindFirst.mockResolvedValueOnce({
      id: VALID_PARTICIPANT_ID,
      sessionId: VALID_SESSION_ID,
      session: { code: 'SES-0010' },
      docStatus: null,
    });
    const fd = makePdfFormData({ mime: 'application/pdf', size: 5 * 1024 });

    const r = await uploadSignedDoc(fd);

    expect(r.ok).toBe(true);
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    const uploadArgs = uploadFileMock.mock.calls[0]!;
    expect(uploadArgs[0]).toBe('qualiof-docs');
    expect(uploadArgs[1]).toMatch(/^signed\//);
    expect(uploadArgs[1]).toContain('SES-0010');
    expect(uploadArgs[1]).toContain(VALID_PARTICIPANT_ID);
    expect(uploadArgs[1]).toContain('CONVENTION');
    expect(uploadArgs[1]).toMatch(/\.pdf$/);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(logDocumentEventMock).toHaveBeenCalledTimes(1);
    expect(logDocumentEventMock.mock.calls[0]![0].action).toBe('documents.upload_signed');
  });
});

// ─── regenerateParticipantDoc ────────────────────────────────────────────

describe('regenerateParticipantDoc', () => {
  it('Test 7 — docKind=CONVENTION (synchronous generator) → appelle generateConventionForParticipant', async () => {
    participantFindFirst.mockResolvedValueOnce({
      id: VALID_PARTICIPANT_ID,
      sessionId: VALID_SESSION_ID,
    });
    generateConventionMock.mockResolvedValueOnce({ ok: true, documentId: 'doc-1' });

    const r = await regenerateParticipantDoc({
      participantId: VALID_PARTICIPANT_ID,
      docKind: 'CONVENTION',
    });

    expect(r.ok).toBe(true);
    expect(generateConventionMock).toHaveBeenCalledWith(VALID_PARTICIPANT_ID);
    expect(generateClosurePackMock).not.toHaveBeenCalled();
  });

  it('Test 8 — docKind=CERTIFICAT_REALISATION (ClosureDocKind) → generateClosurePack(participantIds + kinds + force=true)', async () => {
    participantFindFirst.mockResolvedValueOnce({
      id: VALID_PARTICIPANT_ID,
      sessionId: VALID_SESSION_ID,
    });
    generateClosurePackMock.mockResolvedValueOnce({ ok: true, batchId: 'batch-1' });

    const r = await regenerateParticipantDoc({
      participantId: VALID_PARTICIPANT_ID,
      docKind: 'CERTIFICAT_REALISATION',
    });

    expect(r.ok).toBe(true);
    expect(generateClosurePackMock).toHaveBeenCalledTimes(1);
    const [sid, opts] = generateClosurePackMock.mock.calls[0]!;
    expect(sid).toBe(VALID_SESSION_ID);
    expect(opts.participantIds).toEqual([VALID_PARTICIPANT_ID]);
    expect(opts.kinds).toEqual(['CERTIFICAT']);
    expect(opts.force).toBe(true);
  });
});

// ─── regenerateBatchParticipantDocs ──────────────────────────────────────

describe('regenerateBatchParticipantDocs', () => {
  it('Test 9bis — batch ClosureDocKind only → generateClosurePack groupé par kind avec force=true', async () => {
    generateClosurePackMock.mockResolvedValue({ ok: true, batchId: 'batch-grouped' });

    const r = await regenerateBatchParticipantDocs({
      sessionId: VALID_SESSION_ID,
      items: [
        { participantId: VALID_PARTICIPANT_ID, docKind: 'CERTIFICAT_REALISATION' },
        { participantId: '00000000-0000-0000-0000-000000000011', docKind: 'CERTIFICAT_REALISATION' },
        { participantId: VALID_PARTICIPANT_ID, docKind: 'ATTESTATION_FIN' },
      ],
    });

    expect(r.ok).toBe(true);
    expect(generateClosurePackMock).toHaveBeenCalledTimes(2); // 2 kinds uniques
    const calls = generateClosurePackMock.mock.calls;
    for (const [, opts] of calls) {
      expect(opts.force).toBe(true);
    }
  });
});

// ─── deleteDocument ─────────────────────────────────────────────────────

describe('deleteDocument', () => {
  it('Test 9 — supprime Document + reset docStatus[docType] via transaction', async () => {
    participantFindFirst.mockResolvedValueOnce({
      id: VALID_PARTICIPANT_ID,
      sessionId: VALID_SESSION_ID,
      personId: '00000000-0000-0000-0000-0000000000bb',
      docStatus: { CONVENTION: { state: 'GENERATED', updatedAt: '2026-05-18T00:00:00Z' } },
    });
    documentDeleteMany.mockResolvedValueOnce({ count: 1 });

    const r = await deleteDocument({
      participantId: VALID_PARTICIPANT_ID,
      docType: 'CONVENTION',
    });

    expect(r.ok).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1); // wrap atomique
    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1); // reset via raw SQL "- ${docType}::text"
    expect(logDocumentEventMock).toHaveBeenCalledTimes(1);
    expect(logDocumentEventMock.mock.calls[0]![0].action).toBe('documents.delete');
  });
});
