/**
 * Régénération CIBLÉE de l'émargement pour SES-0101 (uniquement ce kind).
 * Réutilise processClosureJobPayload (worker) + copyToDrive, SANS toucher à la
 * convention/programme/déroulé (Laurent gère la convention lui-même).
 *
 * Usage : cd apps/web && node --import tsx --env-file=../../.env scripts/_regen-emargement-ses0101.ts
 * Idempotent : re-générable (écrase MinIO + Drive).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// Provider cloud (même config que _gen-session-pack).
const backupPath = path.resolve(process.cwd(), '../../.env.local.cloud-backup');
const backup = fs.readFileSync(backupPath, 'utf8');
const pick = (k: string) => backup.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = pick('OPENROUTER_API_KEY')!;
process.env.OPENROUTER_MODEL_FAST = pick('OPENROUTER_MODEL_FAST') ?? 'anthropic/claude-haiku-4.5';
process.env.OPENROUTER_MODEL_QUALITY = pick('OPENROUTER_MODEL_QUALITY') ?? 'anthropic/claude-sonnet-4.6';

const { prisma } = await import('@qualiof/db');
const { processClosureJobPayload } = await import('../src/lib/closure/worker');
const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');
const { sanitize, buildSessionPaths, KIND_FR } = await import('./gen-session-pack-helpers');

const CODE = 'SES-0101';
const DRIVE_BASE =
  process.env.DRIVE_BASE ??
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Process, Tableaux suivis & Documents/Formations dispensées/2025/Sessions de formation 2026';

async function copyToDrive(pdfUrl: string | null | undefined, destFile: string): Promise<boolean> {
  if (!pdfUrl) return false;
  const buf = await downloadFile(DOCS_BUCKET, pdfUrl);
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, buf);
  return true;
}

const session = await prisma.trainingSession.findFirst({
  where: { code: CODE },
  include: {
    product: true,
    participants: { include: { person: true } },
  },
});
if (!session) throw new Error(`${CODE} introuvable`);

const parts = session.participants;
console.log(`\n=== ${CODE} — régénération émargement (${parts.length} apprenants) ===`);

const paths = buildSessionPaths(
  DRIVE_BASE,
  session.product?.title ?? CODE,
  session.startDate,
  parts.map((p) => ({ prenom: p.person.firstName, nom: p.person.lastName })),
);

// 1) Batch closure limité au kind EMARGEMENT (EN DIRECT, pas de queue).
const batch = await prisma.closureBatch.create({
  data: {
    tenantId: session.tenantId,
    sessionId: session.id,
    status: 'RUNNING',
    totalDocs: parts.length,
    jobs: {
      create: parts.map((part) => ({
        participantId: part.id,
        kind: 'EMARGEMENT' as any,
        status: 'QUEUED' as const,
      })),
    },
  },
  include: { jobs: true },
});

for (const job of batch.jobs) {
  await processClosureJobPayload(
    {
      jobId: job.id,
      batchId: batch.id,
      tenantId: session.tenantId,
      sessionId: session.id,
      participantId: job.participantId!,
      kind: 'EMARGEMENT' as any,
    },
    { attemptsMade: 0, maxAttempts: 1, markProcessing: true },
  );
}

// 2) Copie Drive : <learnerDir>/Émargement.pdf
let ok = 0;
for (const part of parts) {
  const who = sanitize(`${part.person.firstName} ${part.person.lastName}`);
  const learnerDir = `${paths.rootDir}/${who}`;
  const job = await prisma.closureJob.findFirst({
    where: { batchId: batch.id, participantId: part.id, kind: 'EMARGEMENT' as any },
    orderBy: { updatedAt: 'desc' },
  });
  let pdfUrl: string | null = null;
  if (job?.pedagogicalAssetId) {
    pdfUrl = (await prisma.pedagogicalAsset.findUnique({ where: { id: job.pedagogicalAssetId }, select: { pdfUrl: true } }))?.pdfUrl ?? null;
  }
  if (!pdfUrl && job?.documentId) {
    pdfUrl = (await prisma.document.findUnique({ where: { id: job.documentId }, select: { pdfUrl: true } }))?.pdfUrl ?? null;
  }
  const copied = await copyToDrive(pdfUrl, `${learnerDir}/${KIND_FR.EMARGEMENT}.pdf`);
  console.log(`  ${copied ? '✓' : '✗'} Émargement — ${part.person.firstName} ${part.person.lastName}`);
  if (copied) ok++;
}

await prisma.closureBatch.update({ where: { id: batch.id }, data: { status: 'COMPLETED' } });
console.log(`\n=== Terminé : ${ok}/${parts.length} émargements régénérés + copiés Drive ===`);
console.log(`Drive : ${paths.rootDir}`);
await prisma.$disconnect();
