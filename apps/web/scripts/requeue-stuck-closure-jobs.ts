/**
 * Script de déblocage des ClosureJob fantômes.
 *
 * Symptôme : `ClosureJob.status = PROCESSING` ou `QUEUED` en BDD, mais
 * absent de la queue BullMQ Redis. Cause habituelle : le worker a été tué
 * en cours de traitement (Ollama timeout, kill -9, reboot Mac), et BullMQ
 * a perdu le job au passage.
 *
 * Action :
 *   1. Les jobs `PROCESSING` depuis > 15 min → marqués `ERROR`
 *      (le worker a clairement abandonné — typique Ollama qui tourne dans le vide).
 *   2. Les jobs `QUEUED` orphelins → re-enqueue dans BullMQ avec leur jobId existant.
 *
 * Usage :
 *   pnpm --filter @qualiof/web requeue-stuck-jobs           # toutes les sessions
 *   pnpm --filter @qualiof/web requeue-stuck-jobs SES-0093  # une seule session
 */

import { prisma } from '@qualiof/db';
import { enqueueClosureJob } from '../src/lib/closure/queue';

const STUCK_PROCESSING_MINUTES = 15;

async function main() {
  const sessionCodeArg = process.argv[2];

  // 1. Trouve le sessionId si filtre passé
  let sessionFilter: { sessionId?: string } = {};
  if (sessionCodeArg) {
    const session = await prisma.trainingSession.findFirst({
      where: { code: sessionCodeArg },
      select: { id: true, code: true },
    });
    if (!session) {
      console.error(`✗ Session ${sessionCodeArg} introuvable`);
      process.exit(1);
    }
    sessionFilter = { sessionId: session.id };
    console.log(`◆ Filtre session : ${session.code} (${session.id})`);
  }

  // 2. Marque les PROCESSING > 15 min comme ERROR
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000);
  const stuckProcessing = await prisma.closureJob.findMany({
    where: {
      status: 'PROCESSING',
      startedAt: { lt: cutoff },
      batch: sessionFilter.sessionId
        ? { sessionId: sessionFilter.sessionId }
        : undefined,
    },
    select: {
      id: true,
      kind: true,
      participantId: true,
      startedAt: true,
      batchId: true,
    },
  });

  if (stuckProcessing.length > 0) {
    console.log(`\n◆ ${stuckProcessing.length} job(s) PROCESSING > ${STUCK_PROCESSING_MINUTES}min → marqués ERROR :`);
    for (const j of stuckProcessing) {
      console.log(`   - ${j.kind} (${j.id.slice(0, 8)}…) startedAt=${j.startedAt?.toISOString()}`);
    }
    await prisma.closureJob.updateMany({
      where: { id: { in: stuckProcessing.map((j) => j.id) } },
      data: {
        status: 'ERROR',
        errorMessage: `Worker stalled (>${STUCK_PROCESSING_MINUTES}min en PROCESSING) — reset manuel via requeue-stuck-closure-jobs script`,
        completedAt: new Date(),
      },
    });
  } else {
    console.log(`◆ Aucun job PROCESSING > ${STUCK_PROCESSING_MINUTES}min`);
  }

  // 3. Re-enqueue les QUEUED orphelins (sans entrée BullMQ)
  const queued = await prisma.closureJob.findMany({
    where: {
      status: 'QUEUED',
      batch: sessionFilter.sessionId
        ? { sessionId: sessionFilter.sessionId }
        : undefined,
    },
    select: {
      id: true,
      kind: true,
      participantId: true,
      batchId: true,
      batch: { select: { tenantId: true, sessionId: true } },
    },
  });

  if (queued.length === 0) {
    console.log('\n◆ Aucun job QUEUED à re-enqueue\n');
    return;
  }

  console.log(`\n◆ ${queued.length} job(s) QUEUED → re-enqueue dans BullMQ :`);
  for (const j of queued) {
    await enqueueClosureJob({
      jobId: j.id,
      batchId: j.batchId,
      tenantId: j.batch.tenantId,
      sessionId: j.batch.sessionId,
      participantId: j.participantId,
      kind: j.kind,
    });
    console.log(`   ✓ ${j.kind} (${j.id.slice(0, 8)}…) participant=${j.participantId.slice(0, 8)}…`);
  }

  console.log('\n✓ Terminé. Le worker devrait traiter les jobs dans les prochaines secondes.');
  console.log('  Surveille la queue : docker exec qualiof_redis redis-cli LLEN bull:closure-generation:wait\n');
}

main()
  .catch((e) => {
    console.error('✗ Erreur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
