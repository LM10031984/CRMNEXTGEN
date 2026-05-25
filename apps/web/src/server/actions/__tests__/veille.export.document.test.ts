/**
 * Phase 13 Plan 04 Task 0 (Wave 0) — Tests RED Document MinIO row (D-02).
 *
 * Contrat (cf. 13-04-PLAN.md must_haves.truths + D-02 CONTEXT) :
 *  - Test 1 : succès → prisma.document.create appelé avec type='VEILLE_AUDIT',
 *             entityType='RegulatoryWatch', entityId=theme
 *  - Test 2 : upload MinIO appelé AVANT prisma.document.create (le pdfUrl
 *             stocké est la clé MinIO)
 *  - Test 3 : si MinIO upload échoue → document non créé, action retourne {ok:false}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@qualiof/db', () => ({
  prisma: {
    regulatoryWatch: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    document: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
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

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdfWeasy: vi.fn(async () => Buffer.alloc(8192, 0x42)),
  renderHtmlToPdf: vi.fn(async () => Buffer.alloc(8192, 0x42)),
}));

vi.mock('@/lib/storage', () => ({
  uploadFile: vi.fn(async () => ({ key: 'veille-audit/tenant-1/INDIC_23.pdf', bucket: 'qualiof-docs', size: 8192 })),
  DOCS_BUCKET: 'qualiof-docs',
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn(async () => ({
    name: 'Start Academy',
    siret: '12345678900012',
    rnq: '93131234500',
    addressStreet: '',
    addressCp: '',
    addressVille: '',
    addressFull: '12 rue Test, 13000 Marseille',
    phone: '',
    email: '',
    emailFrom: '',
    tvaIntra: '',
    iban: '',
    bic: '',
    legalForm: 'SAS',
    legalMentions: '',
    rcs: '',
    invoicePrefix: 'FAC',
    logoPath: '',
    signaturePedagoPath: '',
    signatureDirigeantPath: '',
    handicapReferent: 'Laurent MARX',
    resp: { civilite: 'MR', nom: 'Marx', prenom: 'Laurent', titre: 'PDG', phone: '', email: '' },
    contact: { civilite: 'MR', nom: 'Marx', prenom: 'Laurent', titre: 'PDG', phone: '', email: '' },
  })),
  getOfConfig: vi.fn(() => ({
    name: 'Start Academy',
    siret: '12345678900012',
    rnq: '93131234500',
    addressStreet: '',
    addressCp: '',
    addressVille: '',
    addressFull: '',
    phone: '',
    email: '',
    emailFrom: '',
    tvaIntra: '',
    iban: '',
    bic: '',
    legalForm: '',
    legalMentions: '',
    rcs: '',
    invoicePrefix: 'FAC',
    logoPath: '',
    signaturePedagoPath: '',
    signatureDirigeantPath: '',
    handicapReferent: 'Laurent MARX',
    resp: { civilite: null, nom: '', prenom: '', titre: '', phone: '', email: '' },
    contact: { civilite: null, nom: '', prenom: '', titre: '', phone: '', email: '' },
  })),
}));

vi.mock('@/lib/regulatoryWatch-audit', () => ({
  logRegulatoryWatchEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { uploadFile } from '@/lib/storage';
import { logRegulatoryWatchEvent } from '@/lib/regulatoryWatch-audit';
import { generateVeilleAuditForTheme } from '../veille-export';

const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.regulatoryWatch.findMany as unknown as ReturnType<typeof vi.fn>;
const tenantFindUniqueMock = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const documentCreateMock = prisma.document.create as unknown as ReturnType<typeof vi.fn>;
const uploadFileMock = uploadFile as unknown as ReturnType<typeof vi.fn>;
const logEventMock = logRegulatoryWatchEvent as unknown as ReturnType<typeof vi.fn>;

const ADMIN_USER = {
  id: 'user-admin',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindUniqueMock.mockResolvedValue({ id: 'tenant-1', name: 'Start Academy', siret: '12345678900012', numDA: '93131234500' });
  findManyMock.mockResolvedValue([
    {
      id: 'w-1',
      title: 'Source 1',
      url: 'https://example.com',
      source: 'Newsletter',
      responsable: 'Laurent',
      frequency: 'Mensuelle',
      exploitation: 'Action',
      dateLastReviewed: new Date('2026-03-01'),
      dateAdded: new Date('2026-01-01'),
    },
  ]);
  documentCreateMock.mockResolvedValue({ id: 'doc-1', pdfUrl: 'veille-audit/tenant-1/INDIC_23.pdf' });
  uploadFileMock.mockResolvedValue({ key: 'veille-audit/tenant-1/INDIC_23.pdf', bucket: 'qualiof-docs', size: 8192 });
});

describe('generateVeilleAuditForTheme — Document MinIO (Phase 13 Plan 04 D-02)', () => {
  it("Test 1 — Document.create appelé avec type='VEILLE_AUDIT', entityType='RegulatoryWatch', entityId=theme", async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    await generateVeilleAuditForTheme('INDIC_23');
    expect(documentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'VEILLE_AUDIT',
          entityType: 'RegulatoryWatch',
          entityId: 'INDIC_23',
        }),
      }),
    );
  });

  it('Test 2 — Upload MinIO appelé AVANT Document.create (pdfUrl est la clé MinIO)', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);

    let uploadOrder = -1;
    let createOrder = -1;
    let counter = 0;
    uploadFileMock.mockImplementationOnce(async () => {
      uploadOrder = ++counter;
      return { key: 'veille-audit/tenant-1/INDIC_23.pdf', bucket: 'qualiof-docs', size: 8192 };
    });
    documentCreateMock.mockImplementationOnce(async () => {
      createOrder = ++counter;
      return { id: 'doc-1', pdfUrl: 'veille-audit/tenant-1/INDIC_23.pdf' };
    });

    await generateVeilleAuditForTheme('INDIC_23');
    expect(uploadOrder).toBeGreaterThan(0);
    expect(createOrder).toBeGreaterThan(uploadOrder);

    // Le pdfUrl du document doit être la clé MinIO renvoyée par uploadFile.
    const createArgs = documentCreateMock.mock.calls[0]![0];
    expect(createArgs.data.pdfUrl).toContain('veille-audit/');
  });

  it('Test 3 — Si upload MinIO échoue → Document non créé + {ok:false}', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    uploadFileMock.mockRejectedValueOnce(new Error('S3 connection refused'));
    const r = await generateVeilleAuditForTheme('INDIC_23');
    expect(r.ok).toBe(false);
    expect(documentCreateMock).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });
});
