import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260618-a24 Task 1 — worker idempotent ATTESTATION/CERTIFICAT.
 *
 * Vérifie que `processClosureJobPayload` écrit les Document ATTESTATION_FIN /
 * CERTIFICAT_REALISATION via `prisma.$transaction([deleteMany, create])`
 * (atomicité : 1 seul Document par session+participant+type, pas de doublon
 * en régénération). Et que la branche PedagogicalAsset (kind=QCM) ne touche
 * PAS à prisma.document.
 *
 * Test de puissance (consigne Laurent) : retirer le `deleteMany` du
 * $transaction (ou casser son `where`) doit faire virer Test 1/Test 2 ROUGE
 * — l'assertion porte sur l'argument exact passé à deleteMany ET sur la
 * présence des 2 ops ensemble dans le même $transaction.
 *
 * Mock prisma : $transaction est intelligent —
 *   - forme tableau (notre code Document) → exécute chaque thenable et
 *     renvoie [{ count }, { id }].
 *   - forme callback (bumpAndFinalize) → appelle fn(tx) avec un tx minimal.
 */

vi.mock('@qualiof/db', () => {
  // $transaction gère les 2 formes utilisées dans worker.ts.
  const transactionMock = vi.fn(async (arg: unknown, _opts?: unknown) => {
    if (Array.isArray(arg)) {
      // Notre bloc Document : [deleteMany, create]. Les éléments sont déjà des
      // promesses (les mocks renvoient des promesses résolues).
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      // bumpAndFinalize(tx => ...) : tx minimal avec closureBatch.
      const tx = {
        closureBatch: {
          update: vi.fn().mockResolvedValue({
            totalDocs: 1,
            doneDocs: 1,
            errorDocs: 0,
            status: 'RUNNING',
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return (arg as (tx: unknown) => unknown)(tx);
    }
    return undefined;
  });
  return {
    prisma: {
      closureJob: { update: vi.fn().mockResolvedValue({}) },
      closureBatch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      sessionParticipant: { findFirst: vi.fn() },
      document: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      },
      pedagogicalAsset: { upsert: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
      $transaction: transactionMock,
    },
  };
});

vi.mock('bullmq', () => ({
  Worker: class {},
}));

vi.mock('../../storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../mailer', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../renderer', () => ({
  renderClosureDoc: vi.fn().mockResolvedValue({
    pdfBuffer: Buffer.from('x'),
    rawJson: {},
    usedStub: false,
  }),
}));

vi.mock('../../of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '@qualiof/db';
import { processClosureJobPayload } from '../worker';
import type { ClosureJobPayload } from '../types';

const documentDeleteMany = prisma.document.deleteMany as unknown as ReturnType<typeof vi.fn>;
const documentCreate = prisma.document.create as unknown as ReturnType<typeof vi.fn>;
const pedagogicalAssetUpsert = prisma.pedagogicalAsset.upsert as unknown as ReturnType<typeof vi.fn>;
const closureJobUpdate = prisma.closureJob.update as unknown as ReturnType<typeof vi.fn>;
const closureBatchUpdateMany = prisma.closureBatch.updateMany as unknown as ReturnType<typeof vi.fn>;
const sessionParticipantFindFirst = prisma.sessionParticipant.findFirst as unknown as ReturnType<typeof vi.fn>;
const transactionMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const TENANT_ID = 'tnt-1';
const SESSION_ID = 'ses-1';
const PARTICIPANT_ID = 'part-1';

function buildPayload(kind: ClosureJobPayload['kind']): ClosureJobPayload {
  return {
    jobId: 'job-1',
    batchId: 'batch-1',
    tenantId: TENANT_ID,
    sessionId: SESSION_ID,
    participantId: PARTICIPANT_ID,
    kind,
  } as ClosureJobPayload;
}

function buildParticipant() {
  return {
    id: PARTICIPANT_ID,
    person: {
      firstName: 'Jean',
      lastName: 'Dupont',
      civility: 'M',
      legalLinks: [],
      professionalExperience: null,
      diplomas: null,
      professionalStatus: null,
    },
    session: {
      id: SESSION_ID,
      code: 'SES-0001',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-05'),
      location: null,
      product: {
        id: 'prod-1',
        title: 'Formation test',
        durationHours: 8,
        programMd: 'Programme',
      },
      trainers: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  documentDeleteMany.mockResolvedValue({ count: 1 });
  documentCreate.mockResolvedValue({ id: 'doc-1' });
  pedagogicalAssetUpsert.mockResolvedValue({ id: 'asset-1' });
  closureJobUpdate.mockResolvedValue({});
  closureBatchUpdateMany.mockResolvedValue({ count: 0 });
  sessionParticipantFindFirst.mockResolvedValue(buildParticipant());
});

describe('processClosureJobPayload — idempotence Document (Task 1)', () => {
  it("Test 1 — kind=ATTESTATION : deleteMany+create ATTESTATION_FIN dans le MÊME $transaction", async () => {
    await processClosureJobPayload(buildPayload('ATTESTATION'), {
      attemptsMade: 0,
      maxAttempts: 1,
      markProcessing: false,
    });

    // deleteMany appelé avec le where exact (atomicité où type=docType).
    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        sessionId: SESSION_ID,
        participantId: PARTICIPANT_ID,
        type: 'ATTESTATION_FIN',
      },
    });

    // create appelé avec le même type.
    expect(documentCreate).toHaveBeenCalledTimes(1);
    expect(documentCreate.mock.calls[0]![0].data.type).toBe('ATTESTATION_FIN');

    // Les 2 ops sont passées ENSEMBLE dans un $transaction de forme tableau
    // (preuve d'atomicité — test de puissance : retirer le deleteMany casse ici).
    const arrayTxCall = transactionMock.mock.calls.find((c) => Array.isArray(c[0]));
    expect(arrayTxCall).toBeDefined();
    expect((arrayTxCall![0] as unknown[]).length).toBe(2);
  });

  it("Test 2 — kind=CERTIFICAT : deleteMany+create CERTIFICAT_REALISATION dans le MÊME $transaction", async () => {
    await processClosureJobPayload(buildPayload('CERTIFICAT'), {
      attemptsMade: 0,
      maxAttempts: 1,
      markProcessing: false,
    });

    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        sessionId: SESSION_ID,
        participantId: PARTICIPANT_ID,
        type: 'CERTIFICAT_REALISATION',
      },
    });
    expect(documentCreate).toHaveBeenCalledTimes(1);
    expect(documentCreate.mock.calls[0]![0].data.type).toBe('CERTIFICAT_REALISATION');

    const arrayTxCall = transactionMock.mock.calls.find((c) => Array.isArray(c[0]));
    expect(arrayTxCall).toBeDefined();
    expect((arrayTxCall![0] as unknown[]).length).toBe(2);
  });

  it("Test 3 — non-régression : kind=QCM ne touche PAS prisma.document (branche docType skippée)", async () => {
    await processClosureJobPayload(buildPayload('QCM'), {
      attemptsMade: 0,
      maxAttempts: 1,
      markProcessing: false,
    });

    // QCM → PedagogicalAsset upsert (intact), pas de Document.
    expect(pedagogicalAssetUpsert).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
  });
});
