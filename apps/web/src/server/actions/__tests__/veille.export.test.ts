/**
 * Phase 13 Plan 04 Task 0 (Wave 0) — Tests RED server action export PDF audit.
 *
 * Contrat (cf. 13-04-PLAN.md must_haves.truths + VEILLE-03 + D-03) :
 *  - Test 1 : non-ADMIN/MANAGER → ForbiddenError → {ok:false}
 *  - Test 2 : succès → ok:true + documentId présent + count ≥ 0
 *  - Test 3 : appelle prisma.auditLog.create OR logRegulatoryWatchEvent avec action='regulatoryWatch.exported'
 *  - Test 4 : diff inclut theme et count
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
    addressStreet: '12 rue Test',
    addressCp: '13000',
    addressVille: 'Marseille',
    addressFull: '12 rue Test, 13000 Marseille',
    phone: '01 23 45 67 89',
    email: 'contact@start-academy.fr',
    emailFrom: 'contact@start-academy.fr',
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
import { requireRole, ForbiddenError } from '@/lib/rbac';
import { logRegulatoryWatchEvent } from '@/lib/regulatoryWatch-audit';
import { generateVeilleAuditForTheme } from '../veille-export';

const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.regulatoryWatch.findMany as unknown as ReturnType<typeof vi.fn>;
const tenantFindUniqueMock = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const documentCreateMock = prisma.document.create as unknown as ReturnType<typeof vi.fn>;
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
});

describe('generateVeilleAuditForTheme — Phase 13 Plan 04 (VEILLE-03)', () => {
  it('Test 1 — LECTEUR rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle LECTEUR non autorisé'));
    const r = await generateVeilleAuditForTheme('INDIC_23');
    expect(r.ok).toBe(false);
    expect(documentCreateMock).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it('Test 2 — ADMIN autorisé → ok:true + documentId + count ≥ 0', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    const r = await generateVeilleAuditForTheme('INDIC_23');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.documentId).toBeTruthy();
      expect(r.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("Test 3 — logRegulatoryWatchEvent appelé avec action='regulatoryWatch.exported'", async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    await generateVeilleAuditForTheme('INDIC_24');
    expect(logEventMock).toHaveBeenCalledTimes(1);
    const callArgs = logEventMock.mock.calls[0]![0];
    expect(callArgs.action).toBe('regulatoryWatch.exported');
  });

  it('Test 4 — diff inclut theme et count', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    await generateVeilleAuditForTheme('INDIC_25');
    expect(logEventMock).toHaveBeenCalledTimes(1);
    const callArgs = logEventMock.mock.calls[0]![0];
    expect(callArgs.diff).toEqual(
      expect.objectContaining({
        theme: 'INDIC_25',
        count: expect.any(Number),
      }),
    );
  });
});
