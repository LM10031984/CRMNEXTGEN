/**
 * Smoke test Day 1 — vérifie la plomberie sans UI :
 *   1. Trouve une session avec ≥1 participant
 *   2. Crée un ClosureBatch + 5 ClosureJob × N participants
 *   3. Enqueue dans BullMQ
 *   4. Poll le statut toutes les 1s (max 90s)
 *   5. Affiche un résumé final
 *
 * Pré-requis : `pnpm --filter @qualiof/web worker:closure` dans un autre terminal.
 *
 * Usage :
 *   pnpm --filter @qualiof/web smoke:closure              → prend la session la plus récente
 *   pnpm --filter @qualiof/web smoke:closure SES-2024-001 → cible une session précise par code
 */

import { prisma } from '@qualiof/db';
import { enqueueClosureJob } from '../src/lib/closure/queue';
import { CLOSURE_DOC_KINDS } from '../src/lib/closure/types';

const argSessionCode = process.argv[2] ?? null;

async function main() {
  const where = argSessionCode ? { code: argSessionCode } : {};
  const session = await prisma.trainingSession.findFirst({
    where: { ...where, participants: { some: {} } },
    include: {
      participants: {
        take: 5,
        select: { id: true, person: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) {
    console.error('Aucune session avec participants trouvée');
    process.exit(1);
  }
  console.log(
    `→ Session "${session.code}" — ${session.name ?? '(sans nom)'} — ${session.participants.length} participant(s)`,
  );

  const totalDocs = session.participants.length * CLOSURE_DOC_KINDS.length;
  const batch = await prisma.closureBatch.create({
    data: {
      tenantId: session.tenantId,
      sessionId: session.id,
      status: 'PENDING',
      totalDocs,
      jobs: {
        create: session.participants.flatMap((p) =>
          CLOSURE_DOC_KINDS.map((kind) => ({
            participantId: p.id,
            kind,
            status: 'QUEUED' as const,
          })),
        ),
      },
    },
    include: { jobs: { select: { id: true, participantId: true, kind: true } } },
  });
  console.log(`→ Batch créé : ${batch.id} — ${totalDocs} jobs`);

  for (const job of batch.jobs) {
    await enqueueClosureJob({
      jobId: job.id,
      batchId: batch.id,
      tenantId: session.tenantId,
      sessionId: session.id,
      participantId: job.participantId,
      kind: job.kind,
    });
  }
  console.log(`→ ${batch.jobs.length} jobs enqueued dans BullMQ`);

  const startedAt = Date.now();
  const TIMEOUT_MS = 90_000;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1000));
    const b = await prisma.closureBatch.findUnique({ where: { id: batch.id } });
    if (!b) break;
    process.stdout.write(
      `\r  status=${b.status} done=${b.doneDocs}/${b.totalDocs} errors=${b.errorDocs}      `,
    );
    if (b.status !== 'PENDING' && b.status !== 'RUNNING') break;
  }
  console.log('');

  const final = await prisma.closureBatch.findUnique({
    where: { id: batch.id },
    include: { jobs: true },
  });
  if (!final) {
    console.error('Batch disparu ?');
    process.exit(1);
  }
  console.log(`\n=== RÉSUMÉ batch ${final.id} ===`);
  console.log(`Status final : ${final.status}`);
  console.log(`Done : ${final.doneDocs}/${final.totalDocs}`);
  console.log(`Errors : ${final.errorDocs}`);
  if (final.errorDocs > 0) {
    console.log('\nErreurs :');
    for (const j of final.jobs.filter((x) => x.status === 'ERROR')) {
      console.log(
        `  - ${j.kind} (participant ${j.participantId.slice(0, 8)}) : ${j.errorMessage}`,
      );
    }
  }
  if (final.doneDocs > 0) {
    const sample = final.jobs.find((j) => j.status === 'DONE');
    if (sample) {
      console.log(
        `\nExemple job OK : ${sample.kind} → documentId=${sample.documentId} pedagogicalAssetId=${sample.pedagogicalAssetId}`,
      );
    }
  }

  await prisma.$disconnect();
  process.exit(final.status === 'COMPLETED' ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
