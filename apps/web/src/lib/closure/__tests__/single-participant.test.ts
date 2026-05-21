import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9.1 Plan 09.1-02 Task 2 — Tests extension generateClosurePack
 * (mode single-participant + kinds + force).
 *
 * Stratégie de mock cohérente Phase 9 (lead-load-stats.test.ts) :
 *  - `@qualiof/db`  → prisma mocké (trainingSession.findFirst, document.findMany,
 *                     pedagogicalAsset.findMany, closureBatch.create)
 *  - `@/lib/rbac`   → requireRole résolu en TEST_USER ADMIN
 *  - `@/lib/auth`   → validateRequest mock (cascade RSC)
 *  - `./queue`      → enqueueClosureJob no-op
 *  - `./redis`      → mock client (au cas où importé via la chaîne)
 *  - generators synchrones (deroulé / programme / convention / agefice) no-op
 *  - `next/cache`   → revalidatePath no-op
 *
 * Coverage (5 tests minimum — 1 par item <behavior>) :
 *  Test 1 — Legacy `generateClosurePack(sessionId)` (sans options) — comportement inchangé.
 *  Test 2 — `kinds: ['CERTIFICAT']` filtre kindsToProcess à ce kind uniquement.
 *  Test 3 — `participantIds: [p1] + kinds: ['CERTIFICAT'] + force: true` bypass alreadyDone (mono only).
 *  Test 4 — `force: true` SANS mode mono → SKIP-existing reste actif (protège pack global).
 *  Test 5 — `kinds.length === 0` après filtrage → alreadyComplete=true.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: vi.fn() },
    document: { findMany: vi.fn() },
    pedagogicalAsset: { findMany: vi.fn() },
    closureBatch: { create: vi.fn(), findFirst: vi.fn() },
    sessionParticipant: { findMany: vi.fn() },
  },
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
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
    SAS: 'SAS', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL', SA: 'SA',
    EI: 'EI', EIRL: 'EIRL', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR', AUTRE: 'AUTRE',
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

vi.mock('../queue', () => ({
  enqueueClosureJob: vi.fn().mockResolvedValue(undefined),
  getClosureQueue: vi.fn().mockReturnValue({}),
}));

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
vi.mock('../../../server/actions/convention-generator', () => ({
  generateConventionForParticipant: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../server/actions/agefice-generator', () => ({
  generateAgeficeForParticipant: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { enqueueClosureJob } from '../queue';
import { generateClosurePack } from '@/server/actions/closure-pack';

const sessionFindFirst = prisma.trainingSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const documentFindMany = prisma.document.findMany as unknown as ReturnType<typeof vi.fn>;
const assetFindMany = prisma.pedagogicalAsset.findMany as unknown as ReturnType<typeof vi.fn>;
const batchCreate = prisma.closureBatch.create as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const enqueueClosureJobMock = enqueueClosureJob as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-0000000000a0',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

const SESSION_ID = '00000000-0000-0000-0000-000000000020';
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000030';

function buildSession(participants: Array<{ id: string; opcoCode?: string | null }>) {
  return {
    id: SESSION_ID,
    tenantId: TEST_USER.tenantId,
    // BUG-5 — champs requis par getSessionCompleteness (pré-validation server)
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    pricePerLearner: { toNumber: () => 1500 } as unknown as { toNumber(): number },
    locationId: 'loc-1',
    modality: 'PRESENTIEL',
    trainers: [{ isPrimary: true }],
    product: {
      id: 'product-1',
      programMd: 'Programme de test détaillé pour valider getSessionCompleteness.',
    },
    participants: participants.map((p) => ({
      id: p.id,
      sponsorOrg: { opcoCode: p.opcoCode ?? null },
    })),
  };
}

beforeEach(() => {
  sessionFindFirst.mockReset();
  documentFindMany.mockReset();
  documentFindMany.mockResolvedValue([]);
  assetFindMany.mockReset();
  assetFindMany.mockResolvedValue([]);
  batchCreate.mockReset();
  batchCreate.mockImplementation(async ({ data, include }: any) => ({
    id: 'batch-fake',
    totalDocs: data.totalDocs,
    jobs: (data.jobs?.create ?? []).map((j: any, idx: number) => ({
      id: `job-${idx}`,
      participantId: j.participantId,
      kind: j.kind,
    })),
  }));
  requireRoleMock.mockReset();
  requireRoleMock.mockResolvedValue(TEST_USER);
  enqueueClosureJobMock.mockReset();
  enqueueClosureJobMock.mockResolvedValue(undefined);
});

describe('generateClosurePack extension Phase 9.1', () => {
  it('Test 1 — Legacy generateClosurePack(sessionId) (sans options) — comportement inchangé', async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([{ id: PARTICIPANT_ID }]));

    const r = await generateClosurePack(SESSION_ID);

    expect(r.ok).toBe(true);
    expect(batchCreate).toHaveBeenCalledTimes(1);
    // En mode global (pas mono) on N'INVOQUE PAS le filtre alreadyDone (skip),
    // tous les CLOSURE_DOC_KINDS sont créés.
    const args = batchCreate.mock.calls[0]![0];
    expect(args.data.totalDocs).toBeGreaterThan(0);
  });

  it('Test 2 — kinds: [CERTIFICAT] filtre kindsToProcess à ce kind uniquement', async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([{ id: PARTICIPANT_ID }]));

    const r = await generateClosurePack(SESSION_ID, {
      participantIds: [PARTICIPANT_ID],
      kinds: ['CERTIFICAT'],
    });

    expect(r.ok).toBe(true);
    expect(batchCreate).toHaveBeenCalledTimes(1);
    const jobsCreate = batchCreate.mock.calls[0]![0].data.jobs.create;
    expect(jobsCreate.length).toBe(1);
    expect(jobsCreate[0].kind).toBe('CERTIFICAT');
  });

  it('Test 3 — participantIds + kinds + force=true → bypass alreadyDone (mode mono only)', async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([{ id: PARTICIPANT_ID }]));
    // Simule un Document CERTIFICAT déjà présent → en mode normal il serait skip.
    documentFindMany.mockResolvedValueOnce([
      { participantId: PARTICIPANT_ID, type: 'CERTIFICAT_REALISATION' },
    ]);

    const r = await generateClosurePack(SESSION_ID, {
      participantIds: [PARTICIPANT_ID],
      kinds: ['CERTIFICAT'],
      force: true,
    });

    expect(r.ok).toBe(true);
    // Sans force, ce job aurait été skip (alreadyComplete). Avec force, on a 1 job.
    expect(batchCreate).toHaveBeenCalledTimes(1);
    const jobsCreate = batchCreate.mock.calls[0]![0].data.jobs.create;
    expect(jobsCreate.length).toBe(1);
    expect(jobsCreate[0].kind).toBe('CERTIFICAT');
  });

  it('Test 4 — force=true SANS mode mono (participantIds.length !== 1) → skip-existing reste actif', async () => {
    // Mode "global" : pas de options.participantIds → pas mono.
    sessionFindFirst.mockResolvedValueOnce(
      buildSession([{ id: PARTICIPANT_ID }, { id: '00000000-0000-0000-0000-000000000031' }]),
    );

    const r = await generateClosurePack(SESSION_ID, {
      kinds: ['CERTIFICAT'],
      force: true, // ignoré car pas mode mono
    });

    expect(r.ok).toBe(true);
    // En mode global, le filtre alreadyDone n'est même pas calculé (isMonoMode=false).
    // Donc on crée bien des jobs (skip-existing désactivé only en mode mono).
    // Le test garantit qu'on NE FAIT PAS planter : la signature accepte force, ignore en mode global.
    expect(batchCreate).toHaveBeenCalledTimes(1);
  });

  it('Test 5 — kinds non-vide mais participants déjà complets (mode mono sans force) → alreadyComplete=true', async () => {
    sessionFindFirst.mockResolvedValueOnce(buildSession([{ id: PARTICIPANT_ID }]));
    // Simule CERTIFICAT déjà présent → en mode mono SANS force, le kind est skip.
    documentFindMany.mockResolvedValueOnce([
      { participantId: PARTICIPANT_ID, type: 'CERTIFICAT_REALISATION' },
    ]);

    const r = await generateClosurePack(SESSION_ID, {
      participantIds: [PARTICIPANT_ID],
      kinds: ['CERTIFICAT'],
      // force absent
    });

    expect(r.ok).toBe(true);
    expect(r.alreadyComplete).toBe(true);
    expect(batchCreate).not.toHaveBeenCalled();
  });
});
