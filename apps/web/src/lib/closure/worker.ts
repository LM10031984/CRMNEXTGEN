/**
 * Worker BullMQ "closure-generation".
 *
 * Lancé via `pnpm --filter @qualiof/web worker:closure` (script séparé).
 * Process indépendant de Next.js — robuste aux redémarrages SSR.
 *
 * Responsabilités :
 *   1. Charger les données nécessaires (participant + session + product)
 *   2. Appeler le renderer (mock pour Day 1, réel à partir de Day 2)
 *   3. Uploader le PDF dans MinIO
 *   4. Créer Document (ATTESTATION, CERTIFICAT) ou PedagogicalAsset
 *      (QCM, GRILLE_OBS, ANALYSE_BESOIN)
 *   5. Mettre à jour ClosureJob + ClosureBatch (compteurs, status)
 */

import { createHash } from 'node:crypto';
import { Worker, type Job } from 'bullmq';
import { prisma, type ClosureBatchStatus, type ClosureDocKind, type DocType, type PedagogicalKind } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { sendMail } from '@/lib/mailer';
import { getWorkerRedis } from './redis';
import { CLOSURE_QUEUE_NAME } from './queue';
import { renderClosureDoc } from './renderer';
import type { ClosureContext } from './shared-template';
import type { ClosureJobPayload } from './types';
import { loadOfConfig } from '@/lib/of-config';

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Concurrency 3 par défaut : sur Apple Silicon avec mistral-small:24b en
// local, 5 contextes en parallèle saturent le GPU et font traîner toutes
// les requêtes (latence moyenne 4-5 min, timeouts en cascade). 3 workers
// laissent assez de bande passante pour que chaque génération se termine
// en ~2 min. À monter jusqu'à 8 quand on bascule sur Claude API.
const CONCURRENCY = Number(process.env.CLOSURE_WORKER_CONCURRENCY ?? 3);

// Mapping kind → DocType pour les documents écrits dans `Document`
const DOC_TYPE_BY_KIND: Partial<Record<ClosureDocKind, DocType>> = {
  ATTESTATION: 'ATTESTATION_FIN',
  CERTIFICAT: 'CERTIFICAT_REALISATION',
};

// Mapping kind → PedagogicalKind pour les actifs écrits dans `PedagogicalAsset`
const PEDAGOGICAL_KIND_BY_KIND: Partial<Record<ClosureDocKind, PedagogicalKind>> = {
  QCM: 'QCM',
  GRILLE_OBS: 'GRILLE_OBS',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
  POSITIONNEMENT: 'POSITIONNEMENT',
  SATISFACTION_CHAUD: 'SATISFACTION_CHAUD',
  SATISFACTION_FROID: 'SATISFACTION_FROID',
  DEROULE_PEDA: 'DEROULE',
  EMARGEMENT: 'EMARGEMENT',
};

export function startClosureWorker(): Worker<ClosureJobPayload> {
  const worker = new Worker<ClosureJobPayload>(
    CLOSURE_QUEUE_NAME,
    async (job) => processClosureJob(job),
    {
      connection: getWorkerRedis(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[closure-worker] ✓ ${job.id} (${job.data.kind} for ${job.data.participantId})`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[closure-worker] ✗ ${job?.id} — ${err.message}`);
  });
  worker.on('error', (err) => {
    console.error('[closure-worker] error:', err);
  });

  console.log(`[closure-worker] started (concurrency=${CONCURRENCY}, queue="${CLOSURE_QUEUE_NAME}")`);
  return worker;
}

async function processClosureJob(job: Job<ClosureJobPayload>): Promise<void> {
  const payload = job.data;

  // 1. Marque le job en PROCESSING dans Postgres
  await prisma.closureJob.update({
    where: { id: payload.jobId },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorMessage: null,
    },
  });
  await markBatchRunningIfNeeded(payload.batchId);

  try {
    // 2. Charge les données nécessaires au render (participant + session + product + location +
    //    trainers + legalLinks pour le profil pro du stagiaire utilisé par les generators IA)
    const participant = await prisma.sessionParticipant.findFirst({
      where: { id: payload.participantId, session: { tenantId: payload.tenantId } },
      include: {
        person: {
          include: {
            legalLinks: {
              where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT', 'SALARIE'] } },
              orderBy: [{ isPrimary: 'desc' }, { startDate: 'desc' }],
              include: { organization: { select: { legalName: true, brandName: true } } },
            },
          },
        },
        session: {
          include: {
            product: true,
            location: true,
            trainers: {
              include: { person: true },
              orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    if (!participant) throw new Error(`Inscription introuvable : ${payload.participantId}`);

    const session = participant.session;
    const product = session.product;
    const sessionLocation = session.location
      ? `${session.location.name}${(session.location.address as { city?: string } | null)?.city ? ` — ${(session.location.address as { city?: string }).city}` : ''}`
      : null;

    // Profil pro du stagiaire à partir du LegalLink primaire (si dispo)
    const primaryLink = participant.person.legalLinks[0] ?? null;
    const entreprise = primaryLink
      ? primaryLink.organization.brandName ?? primaryLink.organization.legalName
      : null;

    // Phase 7 — pre-resolve OF config (BDD fallback ENV via D-01 hybrid).
    // Propagé via ctx.of à tous les templates closure pour cohérence multi-tenant.
    const of = await loadOfConfig(payload.tenantId);

    const ctx: ClosureContext = {
      apprenantPrenom: participant.person.firstName,
      apprenantNom: participant.person.lastName,
      apprenantCivility: participant.person.civility ?? null,
      sessionId: session.id,
      sessionCode: session.code,
      sessionTitle: product.title,
      sessionStartDate: session.startDate,
      sessionEndDate: session.endDate,
      sessionLocation,
      // Seul le formateur principal signe les docs Qualiopi (fallback : 1er
      // par ordre stable si aucun marqué primary).
      sessionTrainers: (() => {
        const primary = session.trainers.find((t) => t.isPrimary) ?? session.trainers[0];
        return primary ? [`${primary.person.firstName} ${primary.person.lastName}`.trim()] : [];
      })(),
      durationHours: product.durationHours,
      tenantId: payload.tenantId,
      of,
      formationMeta: {
        programmeMd: product.programMd ?? '',
      },
      stagiaireMeta: {
        entreprise,
        fonction: primaryLink?.function ?? null,
        anciennete: participant.person.professionalExperience ?? null,
        diplomes: participant.person.diplomas ?? null,
        professionalStatus: participant.person.professionalStatus ?? null,
      },
    };

    // 3. Render PDF via le dispatch real (Day 2 avec stubs IA, Day 3 avec Ollama)
    const { pdfBuffer, rawJson, usedStub } = await renderClosureDoc(payload.kind, ctx);

    // 4. Upload MinIO
    const hash = createHash('sha256').update(pdfBuffer).digest('hex');
    const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks (é → e), unambigu encoding
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase();
    // Path tenant-scoped + batchId complet (122 bits entropie) pour éviter
    // les clés prévisibles si le bucket MinIO devient un jour public par
    // erreur. Cf A5 du code review.
    const key = `closure/${payload.tenantId}/${participant.session.code}/${payload.batchId}/${safePersonSlug}-${payload.kind.toLowerCase()}-${hash.slice(0, 8)}.pdf`;
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

    // 5a. Si ATTESTATION/CERTIFICAT → Document
    let documentId: string | null = null;
    let pedagogicalAssetId: string | null = null;

    const docType = DOC_TYPE_BY_KIND[payload.kind];
    if (docType) {
      const doc = await prisma.document.create({
        data: {
          tenantId: payload.tenantId,
          type: docType,
          entityType: 'participant',
          entityId: payload.participantId,
          pdfUrl: key,
          hashSha256: hash,
          sessionId: payload.sessionId,
          participantId: payload.participantId,
        },
      });
      documentId = doc.id;
    }

    // 5b. Si QCM/GRILLE_OBS/ANALYSE_BESOIN → PedagogicalAsset (upsert : 1 par session+participant+kind)
    const pedKind = PEDAGOGICAL_KIND_BY_KIND[payload.kind];
    if (pedKind) {
      const asset = await prisma.pedagogicalAsset.upsert({
        where: {
          sessionId_participantId_kind: {
            sessionId: payload.sessionId,
            participantId: payload.participantId,
            kind: pedKind,
          },
        },
        update: {
          rawJson: (rawJson ?? {}) as object,
          pdfUrl: key,
          hashSha256: hash,
          generatedAt: new Date(),
        },
        create: {
          tenantId: payload.tenantId,
          sessionId: payload.sessionId,
          participantId: payload.participantId,
          kind: pedKind,
          rawJson: (rawJson ?? {}) as object,
          pdfUrl: key,
          hashSha256: hash,
        },
      });
      pedagogicalAssetId = asset.id;
    }

    // 6. Marque le job DONE + incrémente le batch + finalise atomiquement
    await prisma.closureJob.update({
      where: { id: payload.jobId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        documentId,
        pedagogicalAssetId,
        usedStub: Boolean(usedStub),
        errorMessage: null,
      },
    });
    const finalized = await bumpAndFinalize(payload.batchId, 'done');
    if (finalized) await notifyBatchCompletion(payload.batchId, finalized);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Si BullMQ va retry, on garde le job en PROCESSING (pas ERROR définitif)
    const isFinalAttempt = (job.attemptsMade + 1) >= (job.opts.attempts ?? 1);
    await prisma.closureJob.update({
      where: { id: payload.jobId },
      data: {
        status: isFinalAttempt ? 'ERROR' : 'QUEUED',
        errorMessage: msg.slice(0, 500),
      },
    });
    if (isFinalAttempt) {
      const finalized = await bumpAndFinalize(payload.batchId, 'error');
      if (finalized) await notifyBatchCompletion(payload.batchId, finalized);
    }
    throw err; // BullMQ doit voir l'erreur pour gérer retry
  }
}

async function markBatchRunningIfNeeded(batchId: string): Promise<void> {
  await prisma.closureBatch.updateMany({
    where: { id: batchId, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
}

/**
 * Incrémente atomiquement le compteur (done ou error) du batch et — si tous
 * les jobs sont traités — bascule le status vers COMPLETED / PARTIAL / FAILED
 * dans la même transaction.
 *
 * Sans transaction, jusqu'à 5 workers peuvent terminer en parallèle (concurrency=5)
 * et conclure de manière incohérente que `handled < totalDocs` chacun de leur
 * côté → batch stuck en RUNNING. Cf B1 du code review.
 *
 * Le `where: { status: { in: ['PENDING','RUNNING'] } }` évite d'écraser un
 * batch déjà finalisé (cas retry tardif).
 *
 * Isolation `Serializable` : Postgres garantit que les autres transactions
 * concurrentes voient un état cohérent — à défaut on retombe sur le pattern
 * "ABORTED + retry" Prisma natif.
 */
async function bumpAndFinalize(
  batchId: string,
  kind: 'done' | 'error',
): Promise<'COMPLETED' | 'PARTIAL' | 'FAILED' | null> {
  // Retourne le statut terminal SI ET SEULEMENT SI cette transaction a été
  // celle qui a effectué la transition PENDING/RUNNING → terminal. Avec
  // concurrency=3, plusieurs workers tentent de finaliser en parallèle ; le
  // updateMany filtré garantit qu'une seule tentative compte (count=1) et
  // donc qu'un seul email est envoyé par batch.
  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.closureBatch.update({
        where: { id: batchId },
        data: kind === 'done' ? { doneDocs: { increment: 1 } } : { errorDocs: { increment: 1 } },
        select: { totalDocs: true, doneDocs: true, errorDocs: true, status: true },
      });

      const handled = batch.doneDocs + batch.errorDocs;
      if (handled < batch.totalDocs) return null;
      if (batch.status !== 'PENDING' && batch.status !== 'RUNNING') return null;

      const next: 'COMPLETED' | 'PARTIAL' | 'FAILED' =
        batch.errorDocs === 0 ? 'COMPLETED' : batch.doneDocs === 0 ? 'FAILED' : 'PARTIAL';

      const updated = await tx.closureBatch.updateMany({
        where: { id: batchId, status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: next, completedAt: new Date() },
      });
      return updated.count === 1 ? next : null;
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Envoie un email à l'utilisateur ayant lancé le pack pour signaler que tous
 * les jobs sont traités. Idempotent par construction : `bumpAndFinalize` ne
 * retourne un statut non-null qu'une seule fois par batch (transaction qui
 * gagne la course).
 *
 * Mode dry-run automatique si SMTP_HOST n'est pas configuré (cf lib/mailer.ts) —
 * en dev local, le mail est simplement loggé en console.
 */
async function notifyBatchCompletion(
  batchId: string,
  finalStatus: ClosureBatchStatus,
): Promise<void> {
  try {
    const batch = await prisma.closureBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        sessionId: true,
        totalDocs: true,
        doneDocs: true,
        errorDocs: true,
        createdByUserId: true,
      },
    });
    if (!batch || !batch.createdByUserId) return;

    const [user, session] = await Promise.all([
      prisma.user.findUnique({
        where: { id: batch.createdByUserId },
        select: { email: true, firstName: true },
      }),
      prisma.trainingSession.findUnique({
        where: { id: batch.sessionId },
        select: { code: true, name: true },
      }),
    ]);
    if (!user?.email || !session) return;

    const sessionLabel = session.name ?? session.code;
    const link = `${APP_BASE_URL}/app/sessions/${batch.sessionId}/closure/${batch.id}`;
    const statusLabel: Record<ClosureBatchStatus, { label: string; emoji: string; color: string }> = {
      COMPLETED: { label: 'Pack terminé avec succès', emoji: '✅', color: '#16a34a' },
      PARTIAL: { label: 'Pack terminé partiellement', emoji: '⚠️', color: '#d97706' },
      FAILED: { label: 'Échec de la génération du pack', emoji: '❌', color: '#dc2626' },
      PENDING: { label: '', emoji: '', color: '' },
      RUNNING: { label: '', emoji: '', color: '' },
    };
    const meta = statusLabel[finalStatus];
    if (!meta.label) return;

    const subject = `${meta.emoji} ${meta.label} — ${sessionLabel}`;
    const greeting = user.firstName ? `Bonjour ${user.firstName},` : 'Bonjour,';
    const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 16px;">${greeting}</p>
  <p style="margin:0 0 16px;">La génération du pack fin de formation pour la session
  <strong>${sessionLabel}</strong> est terminée.</p>
  <div style="border-left:4px solid ${meta.color};background:#f9fafb;padding:12px 16px;margin:16px 0;border-radius:4px;">
    <div style="font-weight:600;color:${meta.color};margin-bottom:4px;">${meta.label}</div>
    <div style="font-size:14px;color:#4b5563;">
      ${batch.doneDocs} / ${batch.totalDocs} documents générés${batch.errorDocs > 0 ? ` · ${batch.errorDocs} erreur(s)` : ''}
    </div>
  </div>
  <p style="margin:24px 0;">
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:500;">
      Ouvrir le pack
    </a>
  </p>
  <p style="margin:0;font-size:12px;color:#6b7280;">
    Vous recevez cet email car vous avez lancé la génération du pack depuis QualiOF.
  </p>
</body></html>`;
    const text = `${greeting}

${meta.label} pour la session ${sessionLabel}.
${batch.doneDocs} / ${batch.totalDocs} documents générés${batch.errorDocs > 0 ? ` · ${batch.errorDocs} erreur(s)` : ''}.

Ouvrir le pack : ${link}
`;

    const r = await sendMail({ to: user.email, subject, html, text });
    if (r.ok && !r.dryRun) {
      console.log(`[closure-worker] ✉ notif sent to ${user.email} (batch=${batch.id}, status=${finalStatus})`);
    }
  } catch (e) {
    // Une erreur d'email ne doit jamais casser le worker.
    console.error('[closure-worker] notifyBatchCompletion error:', (e as Error).message);
  }
}
