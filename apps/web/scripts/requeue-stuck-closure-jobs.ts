/**
 * Script CLI de déblocage des ClosureJob fantômes (QUEUED/PROCESSING en base
 * mais absents de BullMQ — worker tué en cours). Réutilise la MÊME logique que
 * la reprise automatique au démarrage du worker (`lib/closure/requeue.ts`).
 *
 * Usage :
 *   pnpm --filter @qualiof/web requeue-stuck-jobs           # toutes les sessions
 *   pnpm --filter @qualiof/web requeue-stuck-jobs SES-0093  # une seule session
 *
 * NB : depuis la reprise auto au (re)démarrage du worker, ce script n'est en
 * général plus nécessaire — il reste utile pour forcer une reprise ciblée sans
 * redémarrer le worker.
 */

import { prisma } from '@qualiof/db';
import { requeueStuckClosureJobs, STUCK_PROCESSING_MINUTES } from '../src/lib/closure/requeue';

async function main() {
  const sessionCodeArg = process.argv[2];

  let sessionId: string | undefined;
  if (sessionCodeArg) {
    const session = await prisma.trainingSession.findFirst({
      where: { code: sessionCodeArg },
      select: { id: true, code: true },
    });
    if (!session) {
      console.error(`✗ Session ${sessionCodeArg} introuvable`);
      process.exit(1);
    }
    sessionId = session.id;
    console.log(`◆ Filtre session : ${session.code} (${session.id})`);
  }

  const r = await requeueStuckClosureJobs({ sessionId });
  console.log(`◆ ${r.markedError} job(s) PROCESSING > ${STUCK_PROCESSING_MINUTES}min → marqués ERROR`);
  console.log(`◆ ${r.requeued} job(s) QUEUED → ré-enfilés dans BullMQ`);
  if (r.requeued > 0) {
    console.log('\n✓ Le worker devrait traiter les jobs dans les prochaines secondes.');
    console.log('  Surveille : docker exec qualiof_redis redis-cli LLEN bull:closure-generation:wait\n');
  } else {
    console.log('◆ Aucun job QUEUED à ré-enfiler.\n');
  }
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
