import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * « Dans le pack de fin de formation il n'y a l'assiduité nulle part »
 * — Laurent, 11/09/2026, sur SES-0112 : batch « Terminé, 40/40 documents »,
 * 5 apprenants, 8 pièces chacun, et AUCUNE attestation d'assiduité AGEFICE.
 *
 * Deux causes, indépendantes :
 *
 *  1. Le pack ne générait PAS l'attestation d'assiduité. Il produisait bien la
 *     demande de prise en charge, mais l'assiduité n'était accessible que pièce
 *     par pièce depuis la matrice Qualiopi. Sur SES-0112, 4 stagiaires AGEFICE
 *     et 2 attestations seulement — les deux rattrapées à la main.
 *
 *  2. Le pack utilisait une règle d'éligibilité PLUS ÉTROITE que celle affichée
 *     sur la fiche session : il ne regardait que le payeur, là où la fiche
 *     reconnaît aussi le stagiaire lié à une structure portant un dossier
 *     AGEFICE (entreprise individuelle ou agent commercial). Le compteur
 *     annonçait donc des pièces que le générateur ignorait.
 *
 * Test de puissance : retirer l'appel à `generateAgeficeAttendanceForParticipant`
 * du pack fait virer ROUGE « génère l'attestation d'assiduité » ; revenir au
 * `sponsorOrg?.opcoCode === 'AGEFICE'` fait virer ROUGE « agent commercial ».
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: vi.fn() },
    document: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    pedagogicalAsset: { findMany: vi.fn() },
    closureBatch: { create: vi.fn(), findFirst: vi.fn() },
    sessionParticipant: { findMany: vi.fn() },
  },
  Prisma: { sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }) },
  UserRole: { ADMIN: 'ADMIN' },
  LegalForm: { EI: 'EI', SAS: 'SAS', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR' },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));
vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: vi.fn() };
});
vi.mock('../queue-postgres', () => ({ enqueueClosureJob: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
}));
vi.mock('../../../server/actions/deroule-product-generator', () => ({
  generateDerouleForProduct: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../server/actions/generate-grille-obs-session', () => ({
  generateGrilleObsSessionForSession: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../server/actions/programme-generator', () => ({
  generateProgrammeForProduct: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/closure/route-conventions', () => ({
  ROUTABLE_PARTICIPANT_SELECT: { id: true },
  routeConventionsByPayerRule: vi
    .fn()
    .mockResolvedValue({ covered: 0, groupsCount: 0, individuelsCount: 0, errors: [] }),
}));

const generateAgefice = vi.fn().mockResolvedValue({ ok: true });
const generateAssiduite = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../../../server/actions/agefice-generator', () => ({
  generateAgeficeForParticipant: (id: string) => generateAgefice(id),
}));
vi.mock('../../../server/actions/agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: (id: string) => generateAssiduite(id),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { generateClosurePack } from '@/server/actions/closure-pack';

const sessionFindFirst = prisma.trainingSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const documentFindMany = prisma.document.findMany as unknown as ReturnType<typeof vi.fn>;
const assetFindMany = prisma.pedagogicalAsset.findMany as unknown as ReturnType<typeof vi.fn>;
const batchCreate = prisma.closureBatch.create as unknown as ReturnType<typeof vi.fn>;
const participantFindMany = prisma.sessionParticipant.findMany as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-0000000000a0',
  email: 'admin@test.fr',
  role: 'ADMIN',
};
const SESSION_ID = '00000000-0000-0000-0000-000000000020';
const TNS = '00000000-0000-0000-0000-000000000030';
const SALARIE = '00000000-0000-0000-0000-000000000031';

function buildSession(participantIds: string[]) {
  return {
    id: SESSION_ID,
    tenantId: TEST_USER.tenantId,
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    pricePerLearner: { toNumber: () => 1500 } as unknown as { toNumber(): number },
    locationId: 'loc-1',
    modality: 'PRESENTIEL',
    trainers: [{ isPrimary: true }],
    product: { id: 'product-1', programMd: 'Programme de test suffisamment détaillé.' },
    participants: participantIds.map((id) => ({ id, sponsorOrg: { opcoCode: null } })),
  };
}

beforeEach(() => {
  sessionFindFirst.mockReset();
  documentFindMany.mockReset().mockResolvedValue([]);
  assetFindMany.mockReset().mockResolvedValue([]);
  participantFindMany.mockReset().mockResolvedValue([]);
  batchCreate.mockReset().mockImplementation(async ({ data }: any) => ({
    id: 'batch-fake',
    totalDocs: data.totalDocs,
    jobs: (data.jobs?.create ?? []).map((j: any, i: number) => ({
      id: `job-${i}`,
      participantId: j.participantId,
      kind: j.kind,
    })),
  }));
  requireRoleMock.mockReset().mockResolvedValue(TEST_USER);
  generateAgefice.mockClear();
  generateAssiduite.mockClear();
});

describe('pack de fin de formation — attestation d’assiduité AGEFICE', () => {
  it("génère l'attestation d'assiduité, et plus seulement la demande de prise en charge", async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([TNS]));
    // La requête d'éligibilité rend le stagiaire AGEFICE.
    participantFindMany.mockResolvedValue([{ id: TNS }]);

    const r = await generateClosurePack(SESSION_ID);

    expect(r.ok).toBe(true);
    expect(generateAgefice).toHaveBeenCalledWith(TNS);
    // Le manque signalé sur SES-0112.
    expect(generateAssiduite).toHaveBeenCalledWith(TNS);
  });

  it("couvre l'agent commercial porteur d'un dossier AGEFICE, que le payeur seul ignorait", async () => {
    // Son payeur n'a pas d'OPCO : la règle étroite du pack le laissait de côté,
    // alors que la fiche session le comptait parmi les éligibles.
    sessionFindFirst.mockResolvedValueOnce(buildSession([TNS]));
    participantFindMany.mockResolvedValue([{ id: TNS }]);

    await generateClosurePack(SESSION_ID);

    expect(generateAssiduite).toHaveBeenCalledWith(TNS);
  });

  it('ne produit aucune pièce AGEFICE pour un stagiaire salarié', async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([SALARIE]));
    // Aucun éligible remonté par la requête.
    participantFindMany.mockResolvedValue([]);

    await generateClosurePack(SESSION_ID);

    expect(generateAgefice).not.toHaveBeenCalled();
    expect(generateAssiduite).not.toHaveBeenCalled();
  });

  it('ne traite que les éligibles quand la session en mêle plusieurs', async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([TNS, SALARIE]));
    participantFindMany.mockResolvedValue([{ id: TNS }]);

    await generateClosurePack(SESSION_ID);

    expect(generateAssiduite).toHaveBeenCalledTimes(1);
    expect(generateAssiduite).toHaveBeenCalledWith(TNS);
  });
});
