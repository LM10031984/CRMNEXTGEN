'use server';

import archiver from 'archiver';
import { revalidatePath } from 'next/cache';
import { prisma, type ClosureDocKind } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { CLOSURE_DOC_KINDS, CLOSURE_DOC_KIND_LABELS } from '@/lib/closure/types';
import { enqueueClosureJob, getClosureQueue } from '@/lib/closure/queue';
import { generateDerouleForProduct } from './deroule-product-generator';
import { generateGrilleObsSessionForSession } from './generate-grille-obs-session';
import { generateProgrammeForProduct } from './programme-generator';
import { generateConventionForParticipant } from './convention-generator';
import { generateAgeficeForParticipant } from './agefice-generator';

/**
 * Lance la génération du pack fin de formation pour TOUS les participants
 * confirmés/présents/préinscrits d'une session.
 *
 * Stratégie :
 *   1. Crée un ClosureBatch (status PENDING)
 *   2. Crée 5 ClosureJob par participant (une par kind)
 *   3. Enqueue chaque job dans BullMQ (le worker prend le relais)
 *
 * On NE relance PAS automatiquement les batches précédents — chaque clic crée
 * un nouveau batch (idempotence via hashSha256 si le doc est déjà identique).
 *
 * Mode mono-participant (options.participantIds fourni) : on skip les `kind`
 * déjà présents en base pour ce stagiaire — sinon on écraserait QCM, scoring,
 * etc. déjà générés par un pack global précédent. Seuls les manquants sont
 * relancés. Si tout existe → on retourne {alreadyComplete:true}.
 */
const PEDAGOGICAL_KIND_BY_CLOSURE_KIND: Partial<Record<ClosureDocKind, string>> = {
  QCM: 'QCM',
  GRILLE_OBS: 'GRILLE_OBS',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
  POSITIONNEMENT: 'POSITIONNEMENT',
  SATISFACTION_CHAUD: 'SATISFACTION_CHAUD',
  SATISFACTION_FROID: 'SATISFACTION_FROID',
  DEROULE_PEDA: 'DEROULE',
  EMARGEMENT: 'EMARGEMENT',
};

const DOC_TYPE_BY_CLOSURE_KIND: Partial<Record<ClosureDocKind, string>> = {
  ATTESTATION: 'ATTESTATION_FIN',
  CERTIFICAT: 'CERTIFICAT_REALISATION',
};

export async function generateClosurePack(
  sessionId: string,
  options?: { participantIds?: string[] },
): Promise<{
  ok: boolean;
  batchId?: string;
  total?: number;
  alreadyComplete?: boolean;
  skippedExisting?: number;
  error?: string;
}> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'FORMATEUR']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    include: {
      product: { select: { id: true } },
      participants: {
        where: {
          enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] },
          ...(options?.participantIds && options.participantIds.length > 0
            ? { id: { in: options.participantIds } }
            : {}),
        },
        select: { id: true, sponsorOrg: { select: { opcoCode: true } } },
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  if (session.participants.length === 0) {
    return { ok: false, error: 'Aucun apprenant éligible (statut PRE_ENROLLED/CONFIRMED/ATTENDED)' };
  }

  // Assets niveau session/produit générés en amont du batch BullMQ :
  //  - Déroulé pédagogique : PRODUIT (1 fichier partagé toutes sessions du produit)
  //  - Programme : PRODUIT (1 fichier partagé) — find-or-create idempotent
  //  - Convention : PAR PARTICIPANT (template pur, ~1s) — find-or-create
  //  - AGEFICE PA : PAR PARTICIPANT éligible AGEFICE — find-or-create
  // Tous idempotents : pas de régen si déjà présents (skip via existing).
  await Promise.allSettled([
    generateDerouleForProduct(session.product.id).catch((e) => {
      console.warn('[closure-pack] déroulé produit non généré :', e?.message ?? e);
    }),
    generateProgrammeForProduct(session.product.id).catch((e) => {
      console.warn('[closure-pack] programme produit non généré :', e?.message ?? e);
    }),
  ]);

  // Convention + AGEFICE par participant — find-or-create dans le generator
  // (skip si Document de ce type existe déjà pour ce participant).
  const sessionParticipantList = session.participants;
  await Promise.allSettled(
    sessionParticipantList.flatMap((p) => {
      const tasks: Promise<unknown>[] = [];
      const isAgefice = p.sponsorOrg?.opcoCode === 'AGEFICE';
      tasks.push(
        generateConventionForParticipant(p.id).catch((e) => {
          console.warn(`[closure-pack] convention non générée pour ${p.id} :`, e?.message ?? e);
        }),
      );
      if (isAgefice) {
        tasks.push(
          generateAgeficeForParticipant(p.id).catch((e) => {
            console.warn(`[closure-pack] AGEFICE non généré pour ${p.id} :`, e?.message ?? e);
          }),
        );
      }
      return tasks;
    }),
  );

  // En mode mono-participant : on liste les kinds déjà présents pour skipper.
  // En mode global : on régénère tout (l'idempotence sha256 dédoublonne au render).
  const isMonoMode = !!options?.participantIds && options.participantIds.length > 0;
  const participantIds = session.participants.map((p) => p.id);

  let alreadyDoneByParticipant = new Map<string, Set<ClosureDocKind>>();
  if (isMonoMode) {
    const [existingDocs, existingAssets] = await Promise.all([
      prisma.document.findMany({
        where: {
          tenantId: user.tenantId,
          sessionId,
          participantId: { in: participantIds },
          type: { in: ['ATTESTATION_FIN', 'CERTIFICAT_REALISATION'] },
        },
        select: { participantId: true, type: true },
      }),
      prisma.pedagogicalAsset.findMany({
        where: {
          tenantId: user.tenantId,
          sessionId,
          participantId: { in: participantIds },
          pdfUrl: { not: null },
        },
        select: { participantId: true, kind: true },
      }),
    ]);

    for (const d of existingDocs) {
      if (!d.participantId) continue;
      const set = alreadyDoneByParticipant.get(d.participantId) ?? new Set<ClosureDocKind>();
      if (d.type === 'ATTESTATION_FIN') set.add('ATTESTATION');
      if (d.type === 'CERTIFICAT_REALISATION') set.add('CERTIFICAT');
      alreadyDoneByParticipant.set(d.participantId, set);
    }
    for (const a of existingAssets) {
      if (!a.participantId) continue;
      const set = alreadyDoneByParticipant.get(a.participantId) ?? new Set<ClosureDocKind>();
      // PedagogicalKind 'DEROULE' ↔ ClosureDocKind 'DEROULE_PEDA'
      const closureKind = a.kind === 'DEROULE' ? 'DEROULE_PEDA' : a.kind;
      if ((CLOSURE_DOC_KINDS as readonly string[]).includes(closureKind)) {
        set.add(closureKind as ClosureDocKind);
      }
      alreadyDoneByParticipant.set(a.participantId, set);
    }
  }

  // Construit la liste des jobs à créer en filtrant les kinds déjà faits.
  const jobsToCreate = session.participants.flatMap((p) => {
    const done = alreadyDoneByParticipant.get(p.id) ?? new Set<ClosureDocKind>();
    return CLOSURE_DOC_KINDS.filter((kind) => !done.has(kind)).map((kind) => ({
      participantId: p.id,
      kind,
      status: 'QUEUED' as const,
    }));
  });

  const expectedTotal = session.participants.length * CLOSURE_DOC_KINDS.length;
  const skippedExisting = expectedTotal - jobsToCreate.length;

  if (jobsToCreate.length === 0) {
    return {
      ok: true,
      alreadyComplete: true,
      total: 0,
      skippedExisting,
    };
  }

  const batch = await prisma.closureBatch.create({
    data: {
      tenantId: user.tenantId,
      sessionId,
      status: 'PENDING',
      totalDocs: jobsToCreate.length,
      createdByUserId: user.id,
      jobs: { create: jobsToCreate },
    },
    include: { jobs: { select: { id: true, participantId: true, kind: true } } },
  });

  // Enqueue tous les jobs BullMQ en parallèle (150 round-trips Redis
  // séquentiels = ~1s ; en parallèle ~50ms). Cf A1 du code review.
  await Promise.all(
    batch.jobs.map((job) =>
      enqueueClosureJob({
        jobId: job.id,
        batchId: batch.id,
        tenantId: user.tenantId,
        sessionId,
        participantId: job.participantId,
        kind: job.kind,
      }),
    ),
  );

  revalidatePath(`/app/sessions/${sessionId}`);
  return {
    ok: true,
    batchId: batch.id,
    total: jobsToCreate.length,
    skippedExisting,
  };
}

export interface ClosureBatchStatusJob {
  id: string;
  participantId: string;
  participantName: string;
  kind: ClosureDocKind;
  kindLabel: string;
  status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR';
  attempts: number;
  errorMessage: string | null;
  documentId: string | null;
  pedagogicalAssetId: string | null;
  usedStub: boolean;
}

export interface ClosureBatchStatusPayload {
  id: string;
  sessionId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalDocs: number;
  doneDocs: number;
  errorDocs: number;
  startedAt: string | null;
  completedAt: string | null;
  jobs: ClosureBatchStatusJob[];
}

export async function getClosureBatchStatus(
  batchId: string,
): Promise<{ ok: boolean; batch?: ClosureBatchStatusPayload; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
    include: {
      jobs: {
        orderBy: [{ kind: 'asc' }, { participantId: 'asc' }],
      },
    },
  });
  if (!batch) return { ok: false, error: 'Batch introuvable' };

  // Charge les noms des participants en bulk
  const participantIds = Array.from(new Set(batch.jobs.map((j) => j.participantId)));
  const participants = await prisma.sessionParticipant.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, person: { select: { firstName: true, lastName: true } } },
  });
  const nameById = new Map(
    participants.map((p) => [p.id, `${p.person.firstName} ${p.person.lastName}`.trim()]),
  );

  return {
    ok: true,
    batch: {
      id: batch.id,
      sessionId: batch.sessionId,
      status: batch.status,
      totalDocs: batch.totalDocs,
      doneDocs: batch.doneDocs,
      errorDocs: batch.errorDocs,
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      jobs: batch.jobs.map((j) => ({
        id: j.id,
        participantId: j.participantId,
        participantName: nameById.get(j.participantId) ?? '?',
        kind: j.kind,
        kindLabel: CLOSURE_DOC_KIND_LABELS[j.kind],
        status: j.status,
        attempts: j.attempts,
        errorMessage: j.errorMessage,
        documentId: j.documentId,
        pedagogicalAssetId: j.pedagogicalAssetId,
        usedStub: j.usedStub,
      })),
    },
  };
}

/**
 * Construit un buffer ZIP en streaming contenant tous les PDFs générés du batch.
 * Les jobs en erreur sont ignorés.
 *
 * Renommé en `pack-fin-formation_<sessionCode>_<date>.zip` côté API route.
 */
export async function buildClosureZipBuffer(
  batchId: string,
): Promise<{ ok: boolean; buffer?: Buffer; filename?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
    include: {
      jobs: {
        where: { status: 'DONE' },
        include: {
          batch: { select: { sessionId: true } },
        },
      },
    },
  });
  if (!batch) return { ok: false, error: 'Batch introuvable' };
  if (batch.jobs.length === 0) return { ok: false, error: 'Aucun document généré' };

  const session = await prisma.trainingSession.findUnique({
    where: { id: batch.sessionId },
    select: { code: true },
  });
  const sessionCode = session?.code ?? batch.sessionId.slice(0, 8);

  // Récupère les PDFs en parallèle (Documents + PedagogicalAssets)
  const docIds = batch.jobs.map((j) => j.documentId).filter((x): x is string => Boolean(x));
  const assetIds = batch.jobs
    .map((j) => j.pedagogicalAssetId)
    .filter((x): x is string => Boolean(x));

  const [docs, assets, participants] = await Promise.all([
    prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, pdfUrl: true, type: true, participantId: true },
    }),
    prisma.pedagogicalAsset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, pdfUrl: true, kind: true, participantId: true },
    }),
    prisma.sessionParticipant.findMany({
      where: { id: { in: Array.from(new Set(batch.jobs.map((j) => j.participantId))) } },
      select: { id: true, person: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const nameById = new Map(
    participants.map((p) => [
      p.id,
      slugify(`${p.person.lastName}-${p.person.firstName}`),
    ]),
  );
  const docById = new Map(docs.map((d) => [d.id, d]));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  // Build le zip
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on('data', (c: Buffer) => chunks.push(c));
  const finalized = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

  for (const job of batch.jobs) {
    const slug = nameById.get(job.participantId) ?? job.participantId.slice(0, 8);
    let pdfKey: string | null = null;
    if (job.documentId) pdfKey = docById.get(job.documentId)?.pdfUrl ?? null;
    if (!pdfKey && job.pedagogicalAssetId) pdfKey = assetById.get(job.pedagogicalAssetId)?.pdfUrl ?? null;
    if (!pdfKey) continue;

    try {
      const buf = await downloadFile(DOCS_BUCKET, pdfKey);
      const fname = `${slug}/${job.kind.toLowerCase()}.pdf`;
      archive.append(buf, { name: fname });
    } catch (e) {
      console.error(`[closure-zip] skip ${job.id}: ${(e as Error).message}`);
    }
  }
  archive.finalize();
  await finalized;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    ok: true,
    buffer: Buffer.concat(chunks),
    filename: `pack-fin-formation_${sessionCode}_${today}.zip`,
  };
}

/**
 * Compte les ClosureBatch encore en cours (PENDING ou RUNNING) pour le
 * tenant courant. Utilisé par le badge "génération en cours" de la sidebar
 * pour rassurer l'utilisateur qui quitte la page batch (les jobs continuent
 * de tourner dans le worker BullMQ — le polling de progression seulement
 * s'arrête).
 *
 * Retourne aussi l'ID du batch le plus récent pour permettre un lien direct
 * vers sa page de progression.
 */
export async function getActiveClosureBatches(): Promise<{
  count: number;
  latest?: { id: string; sessionId: string; totalDocs: number; doneDocs: number };
}> {
  const { user } = await validateRequest();
  if (!user) return { count: 0 };

  const batches = await prisma.closureBatch.findMany({
    where: {
      tenantId: user.tenantId,
      status: { in: ['PENDING', 'RUNNING'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, sessionId: true, totalDocs: true, doneDocs: true },
  });

  if (batches.length === 0) return { count: 0 };
  return { count: batches.length, latest: batches[0]! };
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Re-enqueue les jobs ERROR (et optionnellement les jobs DONE avec stub
 * fallback) du batch. Utile pour la page batch (bouton "Régénérer les
 * erreurs / les stubs"). Idempotent : un job en cours n'est pas touché.
 *
 * @param includeStubs si true, inclut aussi les jobs DONE avec usedStub=true
 *   (cas où Ollama avait échoué et qu'on veut re-tenter pour avoir un
 *   contenu IA personnalisé avant audit Qualiopi).
 */
export async function retryClosureBatchErrors(
  batchId: string,
  options: { includeStubs?: boolean } = {},
): Promise<{ ok: boolean; relaunched?: number; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'FORMATEUR']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const orFilter = options.includeStubs
    ? [{ status: 'ERROR' as const }, { status: 'DONE' as const, usedStub: true }]
    : [{ status: 'ERROR' as const }];

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
    include: { jobs: { where: { OR: orFilter } } },
  });
  if (!batch) return { ok: false, error: 'Batch introuvable' };
  if (batch.jobs.length === 0) return { ok: true, relaunched: 0 };

  // Compteur ERROR à décrémenter (les stubs étaient comptés en doneDocs, on les
  // décrémente symétriquement et ils repasseront en doneDocs après re-génération)
  const errorJobs = batch.jobs.filter((j) => j.status === 'ERROR');
  const stubJobs = batch.jobs.filter((j) => j.status === 'DONE' && j.usedStub);

  await prisma.$transaction([
    prisma.closureJob.updateMany({
      where: { id: { in: batch.jobs.map((j) => j.id) } },
      data: {
        status: 'QUEUED',
        errorMessage: null,
        attempts: 0,
        startedAt: null,
        completedAt: null,
        usedStub: false,
        documentId: null,
        pedagogicalAssetId: null,
      },
    }),
    prisma.closureBatch.update({
      where: { id: batchId },
      data: {
        status: 'RUNNING',
        errorDocs: { decrement: errorJobs.length },
        doneDocs: { decrement: stubJobs.length },
        completedAt: null,
      },
    }),
  ]);

  // BullMQ refuse silencieusement queue.add({ jobId }) si le job existe déjà
  // côté Redis (typiquement en état "failed" après les 3 attempts initiaux).
  // → on supprime explicitement avant de re-enqueue. Cf B2 du code review.
  const queue = getClosureQueue();
  await Promise.all(
    batch.jobs.map(async (job) => {
      try {
        const existing = await queue.getJob(job.id);
        if (existing) await existing.remove();
      } catch {
        /* job déjà parti, OK */
      }
      await enqueueClosureJob({
        jobId: job.id,
        batchId,
        tenantId: user.tenantId,
        sessionId: batch.sessionId,
        participantId: job.participantId,
        kind: job.kind,
      });
    }),
  );

  revalidatePath(`/app/sessions/${batch.sessionId}/closure/${batchId}`);
  return { ok: true, relaunched: batch.jobs.length };
}
