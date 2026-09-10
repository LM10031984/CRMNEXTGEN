import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot A — Zone de dépôt des scans signés (spec 2026-09-04 §5 lot A).
 *
 * Server action `uploadSignedScans` : dépôt multi-fichiers PDF sur une session,
 * chaque fichier affecté à un participant. Réutilise le socle `uploadSignedDoc`
 * (interdit : recréer un upload parallèle) via le cœur partagé.
 *
 * Couverture :
 *  1. RBAC — rôle non autorisé → ok:false
 *  2. affectation incohérente (N fichiers ≠ N participants) → ok:false
 *  3. refus non-PDF → failure sur ce fichier, les autres passent
 *  4. refus > 10 Mo → failure
 *  5. succès 2 fichiers → 2 uploads §4.4 + 2 jsonb_set + 2 AuditLog
 *     `document.signed_scan_uploaded` + patch Document (signedPdfUrl / MANUAL_SCAN / signed)
 *  6. participant hors session/tenant → failure, aucun upload
 *  7. mode split — 1 PDF de 3 pages → 3 uploads dans l'ordre des participants
 *  8. mode split — nombre de pages ≠ nombre de participants → ok:false
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    trainingSession: { findUnique: vi.fn(), findFirst: vi.fn() },
    document: { deleteMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, __isPrismaSql: true }),
  },
  UserRole: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', FORMATEUR: 'FORMATEUR', COMMERCIAL: 'COMMERCIAL', COMPTABLE: 'COMPTABLE', LECTEUR: 'LECTEUR' },
  LegalForm: { SAS: 'SAS', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL', SA: 'SA', EI: 'EI', EIRL: 'EIRL', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR', AUTRE: 'AUTRE' },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: vi.fn() };
});

vi.mock('@/lib/document-audit', () => ({ logDocumentEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue({ key: 'k', bucket: 'qualiof-docs', size: 1 }),
}));

vi.mock('@/lib/pdf-split', () => ({
  splitPdfPages: vi.fn(),
  countPdfPages: vi.fn(),
}));

// Hermétisme (cf. 17-02) : ces modules exécutent createEnv au load.
vi.mock('@/lib/pdf-render', () => ({ renderHtmlToPdf: vi.fn(), renderHtmlToPdfWeasy: vi.fn() }));
vi.mock('../closure-pack', () => ({ generateClosurePack: vi.fn() }));
vi.mock('../convention-generator', () => ({ generateConventionForParticipant: vi.fn() }));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: vi.fn() }));
vi.mock('../programme-generator', () => ({ generateProgrammeForParticipant: vi.fn(), generateProgrammeForProduct: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import { logDocumentEvent } from '@/lib/document-audit';
import { uploadFile } from '@/lib/storage';
import { splitPdfPages } from '@/lib/pdf-split';
import { uploadSignedScans } from '../qualiopi-matrix';

const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const participantFindMany = prisma.sessionParticipant.findMany as unknown as ReturnType<typeof vi.fn>;
const documentUpdateMany = prisma.document.updateMany as unknown as ReturnType<typeof vi.fn>;
const executeRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>;
const uploadFileMock = uploadFile as unknown as ReturnType<typeof vi.fn>;
const logDocumentEventMock = logDocumentEvent as unknown as ReturnType<typeof vi.fn>;
const splitPdfPagesMock = splitPdfPages as unknown as ReturnType<typeof vi.fn>;

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const P1 = '44444444-4444-4444-8444-444444444444';
const P2 = '55555555-5555-4555-8555-555555555555';
const P3 = '66666666-6666-4666-8666-666666666666';

function participantRow(id: string) {
  return { id, sessionId: SESSION_ID, session: { code: 'SES-0010' }, docStatus: null };
}

function pdfFile(name: string, opts: { mime?: string; size?: number } = {}) {
  return new File([new Uint8Array(opts.size ?? 1024)], name, {
    type: opts.mime ?? 'application/pdf',
  });
}

function makeFormData(opts: {
  files: File[];
  participantIds: string[];
  docType?: string;
  mode?: string;
  sessionId?: string;
}) {
  const fd = new FormData();
  fd.append('sessionId', opts.sessionId ?? SESSION_ID);
  fd.append('docType', opts.docType ?? 'EMARGEMENT');
  fd.append('mode', opts.mode ?? 'assign');
  for (const f of opts.files) fd.append('files', f);
  for (const p of opts.participantIds) fd.append('participantIds', p);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, role: 'ADMIN' });
  participantFindMany.mockResolvedValue([participantRow(P1), participantRow(P2)]);
  documentUpdateMany.mockResolvedValue({ count: 1 });
  executeRaw.mockResolvedValue(1);
  uploadFileMock.mockResolvedValue({ key: 'k', bucket: 'qualiof-docs', size: 1 });
});

describe('uploadSignedScans — garde-fous', () => {
  it('Test 1 — rôle non autorisé → ok:false, aucun upload', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Accès refusé'));

    const r = await uploadSignedScans(
      makeFormData({ files: [pdfFile('a.pdf')], participantIds: [P1] }),
    );

    expect(r.ok).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('Test 2 — N fichiers ≠ N participants → ok:false', async () => {
    const r = await uploadSignedScans(
      makeFormData({ files: [pdfFile('a.pdf'), pdfFile('b.pdf')], participantIds: [P1] }),
    );

    expect(r.ok).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('Test 3 — fichier non-PDF → failure ciblée, les autres passent', async () => {
    const r = await uploadSignedScans(
      makeFormData({
        files: [pdfFile('ok.pdf'), pdfFile('photo.png', { mime: 'image/png' })],
        participantIds: [P1, P2],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saved).toBe(1);
      expect(r.failures).toHaveLength(1);
      expect(r.failures[0]!.filename).toBe('photo.png');
      expect(r.failures[0]!.error).toContain('PDF');
    }
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
  });

  it('Test 4 — fichier > 10 Mo → failure taille', async () => {
    const r = await uploadSignedScans(
      makeFormData({
        files: [pdfFile('gros.pdf', { size: 11 * 1024 * 1024 })],
        participantIds: [P1],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saved).toBe(0);
      expect(r.failures[0]!.error).toContain('10 Mo');
    }
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('Test 6 — participant hors session/tenant → failure, aucun upload', async () => {
    participantFindMany.mockResolvedValueOnce([]);

    const r = await uploadSignedScans(
      makeFormData({ files: [pdfFile('a.pdf')], participantIds: [P1] }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saved).toBe(0);
      expect(r.failures).toHaveLength(1);
    }
    expect(uploadFileMock).not.toHaveBeenCalled();
  });
});

describe('uploadSignedScans — succès', () => {
  it('Test 5 — 2 fichiers → 2 uploads §4.4, 2 docStatus, 2 AuditLog, patch Document signé', async () => {
    const r = await uploadSignedScans(
      makeFormData({
        files: [pdfFile('emargement-dupont.pdf'), pdfFile('emargement-martin.pdf')],
        participantIds: [P1, P2],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saved).toBe(2);
      expect(r.failures).toEqual([]);
    }

    expect(uploadFileMock).toHaveBeenCalledTimes(2);
    const key = uploadFileMock.mock.calls[0]![1] as string;
    // §4.4 — sessions/{tenantId}/{sessionCode}/signed/{docType}-{entityId}-{sha8}.pdf
    expect(key).toMatch(
      new RegExp(`^sessions/${TENANT_ID}/SES-0010/signed/EMARGEMENT-${P1}-[0-9a-f]{8}\\.pdf$`),
    );

    expect(executeRaw).toHaveBeenCalledTimes(2);

    // Patch Document : signedPdfUrl + MANUAL_SCAN + status signed
    expect(documentUpdateMany).toHaveBeenCalledTimes(2);
    const patch = documentUpdateMany.mock.calls[0]![0];
    expect(patch.where).toMatchObject({ tenantId: TENANT_ID, participantId: P1, type: 'EMARGEMENT' });
    expect(patch.data).toMatchObject({ signatureKind: 'MANUAL_SCAN', status: 'signed' });
    expect(patch.data.signedPdfUrl).toBe(key);

    expect(logDocumentEventMock).toHaveBeenCalledTimes(2);
    const log = logDocumentEventMock.mock.calls[0]![0];
    expect(log.action).toBe('document.signed_scan_uploaded');
    expect(log.tenantId).toBe(TENANT_ID);
    expect(log.targetEntityId).toBe(P1);
    expect(log.diff).toMatchObject({ sessionId: SESSION_ID, docType: 'EMARGEMENT', participantId: P1 });
  });
});

describe('uploadSignedScans — mode split (A.2)', () => {
  it('Test 7 — 1 PDF de 3 pages → 3 uploads dans l’ordre des participants', async () => {
    participantFindMany.mockResolvedValueOnce([
      participantRow(P1),
      participantRow(P2),
      participantRow(P3),
    ]);
    splitPdfPagesMock.mockResolvedValueOnce([
      Buffer.from('page1'),
      Buffer.from('page2'),
      Buffer.from('page3'),
    ]);

    const r = await uploadSignedScans(
      makeFormData({
        mode: 'split',
        files: [pdfFile('emargements.pdf')],
        participantIds: [P1, P2, P3],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.saved).toBe(3);
    expect(uploadFileMock).toHaveBeenCalledTimes(3);
    expect(uploadFileMock.mock.calls[0]![1]).toContain(P1);
    expect(uploadFileMock.mock.calls[1]![1]).toContain(P2);
    expect(uploadFileMock.mock.calls[2]![1]).toContain(P3);
  });

  it('Test 8 — nombre de pages ≠ nombre de participants → ok:false, aucun upload', async () => {
    splitPdfPagesMock.mockResolvedValueOnce([Buffer.from('page1'), Buffer.from('page2')]);

    const r = await uploadSignedScans(
      makeFormData({
        mode: 'split',
        files: [pdfFile('emargements.pdf')],
        participantIds: [P1, P2, P3],
      }),
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('page');
    expect(uploadFileMock).not.toHaveBeenCalled();
  });
});
