/**
 * Clôture des ClosureBatch « zombies » — les « packs en cours » fantômes (15-04).
 *
 * Contexte : quand le worker de closure est tué entre deux jobs (Ollama timeout,
 * kill -9, reboot Mac), la transition finale (bumpAndFinalize, worker.ts) n'a
 * jamais lieu et le batch reste en RUNNING/PENDING indéfiniment. La fiche session
 * l'affiche « en cours » à tort (BatchProgressAutoRefresh lit le dernier batch).
 *
 * Ce script détecte ces batches via le prédicat PUR `isZombieBatch`
 * (src/lib/closure/close-zombie-batches.ts, 15-RESEARCH Q6) et les bascule vers
 * leur statut terminal (COMPLETED/PARTIAL/FAILED selon doneDocs/errorDocs).
 * Un batch dont un job est encore QUEUED/PROCESSING récent (< 15min) est
 * réellement actif → JAMAIS touché.
 *
 * SÉCURITÉ (pattern destructif projet, cf. calendar:purge) :
 *   - DRY par défaut : liste seulement les batches à clore + leur statut cible.
 *     Aucune écriture.
 *   - WRITE=1 requis pour appliquer réellement (updateMany where status IN
 *     PENDING/RUNNING → statut final + completedAt).
 *   - Filtre optionnel SESSION_CODE=SES-0093 pour cibler une session.
 *
 * ⚠️ À NE PAS exécuter en WRITE sans validation humaine du DRY :
 *   1. cd apps/web && pnpm closure:close-zombies          (DRY, vérifier la liste)
 *   2. WRITE=1 pnpm closure:close-zombies                 (clôture réelle)
 *   3. pnpm closure:close-zombies                          (re-DRY → 0 zombie)
 *
 * Worker/CLI-safe : n'importe que @qualiof/db + le prédicat pur (0 dépendance
 * d'auth ni de rendu côté serveur).
 */

import { prisma } from '@qualiof/db';
import {
  isZombieBatch,
  finalStatusFor,
  STALE_MINUTES,
} from '../src/lib/closure/close-zombie-batches';

const WRITE = process.env.WRITE === '1';

async function main() {
  const sessionCodeArg = process.env.SESSION_CODE ?? process.argv[2];
  const now = new Date();

  let sessionFilter: string | undefined;
  if (sessionCodeArg) {
    const session = await prisma.trainingSession.findFirst({
      where: { code: sessionCodeArg },
      select: { id: true, code: true },
    });
    if (!session) {
      console.error(`✗ Session ${sessionCodeArg} introuvable`);
      process.exit(1);
    }
    sessionFilter = session.id;
    console.log(`◆ Filtre session : ${session.code} (${session.id})`);
  }

  console.log(`◆ Mode : ${WRITE ? 'WRITE (clôture réelle)' : 'DRY-RUN (lecture seule)'}`);
  console.log(`◆ Seuil d'inactivité : ${STALE_MINUTES} min\n`);

  // Charge les batches encore ouverts + leurs jobs (statut + timestamps).
  const openBatches = await prisma.closureBatch.findMany({
    where: {
      status: { in: ['PENDING', 'RUNNING'] },
      ...(sessionFilter ? { sessionId: sessionFilter } : {}),
    },
    select: {
      id: true,
      status: true,
      sessionId: true,
      totalDocs: true,
      doneDocs: true,
      errorDocs: true,
      startedAt: true,
      updatedAt: true,
      jobs: { select: { status: true, startedAt: true, updatedAt: true } },
    },
  });

  console.log(`◆ ${openBatches.length} batch(es) PENDING/RUNNING trouvé(s).`);

  const zombies = openBatches.filter((b) => isZombieBatch(b, b.jobs, now));

  if (zombies.length === 0) {
    console.log('\n✓ Aucun batch zombie à clore. Rien à faire.\n');
    return;
  }

  console.log(`\n◆ ${zombies.length} batch(es) ZOMBIE(s) à clore :\n`);
  const codeBySession = new Map<string, string>();
  for (const b of zombies) {
    if (!codeBySession.has(b.sessionId)) {
      const s = await prisma.trainingSession.findUnique({
        where: { id: b.sessionId },
        select: { code: true },
      });
      codeBySession.set(b.sessionId, s?.code ?? b.sessionId.slice(0, 8));
    }
    const target = finalStatusFor(b);
    console.log(
      `   - ${codeBySession.get(b.sessionId)} · batch ${b.id.slice(0, 8)}… ` +
        `[${b.status}] done=${b.doneDocs} err=${b.errorDocs} total=${b.totalDocs} ` +
        `updatedAt=${b.updatedAt?.toISOString() ?? 'null'} → ${target}`,
    );
  }

  if (!WRITE) {
    console.log(
      `\n◆ DRY-RUN : aucune écriture. Pour appliquer :\n` +
        `    WRITE=1 pnpm closure:close-zombies${sessionCodeArg ? ` ${sessionCodeArg}` : ''}\n`,
    );
    return;
  }

  console.log('\n◆ WRITE : clôture en cours…');
  let closed = 0;
  for (const b of zombies) {
    const target = finalStatusFor(b);
    // Garde d'idempotence : ne bascule que si le batch est TOUJOURS ouvert
    // (course avec un worker qui aurait finalisé entre-temps).
    const res = await prisma.closureBatch.updateMany({
      where: { id: b.id, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: target, completedAt: new Date() },
    });
    if (res.count === 1) {
      closed += 1;
      console.log(`   ✓ ${b.id.slice(0, 8)}… → ${target}`);
    } else {
      console.log(`   ⤳ ${b.id.slice(0, 8)}… déjà finalisé entre-temps (ignoré)`);
    }
  }

  console.log(`\n✓ Terminé : ${closed}/${zombies.length} batch(es) clos.`);
  console.log('  Re-lance en DRY pour confirmer : pnpm closure:close-zombies\n');
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
