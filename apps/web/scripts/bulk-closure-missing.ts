/**
 * Phase B reconciliation Treso : régénère en lot les docs Qualiopi manquants
 * pour toutes les sessions terminées 2025-2026.
 *
 * Stratégie :
 *   1. Liste les TrainingSession terminées 2025-2026 (endDate dans [2025-01-01, today])
 *   2. Filtre celles avec completeness OK (formateur, prix, dates, programme)
 *   3. Pour chaque session :
 *      - Identifie les docs déjà présents (Document ATTESTATION/CERTIFICAT + PedagogicalAsset)
 *      - Crée un ClosureBatch + 1 ClosureJob par doc manquant × participant
 *      - Enqueue dans BullMQ
 *   4. Le worker (process séparé, concurrency=3) traite tout en arrière-plan
 *
 * Dry-run par défaut. Ajouter --commit pour vraiment créer les batches.
 *
 * Usage :
 *   dry-run : cd apps/web && npx dotenv -e ../../.env -- tsx scripts/bulk-closure-missing.ts
 *   commit  : cd apps/web && npx dotenv -e ../../.env -- tsx scripts/bulk-closure-missing.ts --commit
 */

import { prisma, type ClosureDocKind } from '@qualiof/db';
import { CLOSURE_DOC_KINDS } from '@/lib/closure/types';
import { enqueueClosureJob } from '@/lib/closure/queue-postgres';
import { getSessionCompleteness } from '@/lib/sessions/completeness';

const COMMIT = process.argv.includes('--commit');

const RANGE_START = new Date('2025-01-01T00:00:00Z');
const RANGE_END = new Date(); // today

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  BULK CLOSURE — ${COMMIT ? '⚠️  MODE COMMIT' : '🧪 DRY-RUN'}`);
  console.log(`  Sessions terminées entre ${RANGE_START.toISOString().slice(0, 10)} et ${RANGE_END.toISOString().slice(0, 10)}`);
  console.log(`${'='.repeat(70)}\n`);

  // Récupérer le 1er tenant + 1er ADMIN (mono-tenant Start Academy)
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) {
    console.error('❌ Aucun tenant trouvé en BDD.');
    process.exit(1);
  }
  const adminUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'ADMIN' },
    select: { id: true, email: true },
  });
  if (!adminUser) {
    console.error('❌ Aucun user ADMIN trouvé pour ce tenant.');
    process.exit(1);
  }
  console.log(`🏢 Tenant : ${tenant.name} (${tenant.id})`);
  console.log(`👤 Created-by (ADMIN) : ${adminUser.email}\n`);

  // 1. Lister les sessions du périmètre
  const sessions = await prisma.trainingSession.findMany({
    where: {
      tenantId: tenant.id,
      endDate: { gte: RANGE_START, lt: RANGE_END },
    },
    include: {
      product: { select: { id: true, programMd: true } },
      // AGEFICE 2026-08-28 — mêmes critères que closure-pack.ts : le lieu doit
      // porter raison sociale + CP + ville, pas seulement exister.
      location: { select: { legalName: true, address: true } },
      trainers: { select: { isPrimary: true } },
      participants: {
        where: {
          enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] },
        },
        select: { id: true, sponsorOrg: { select: { opcoCode: true } } },
      },
    },
    orderBy: { startDate: 'asc' },
  });
  console.log(`📥 ${sessions.length} sessions dans la période`);

  let nIncomplete = 0;
  let nNoParticipants = 0;
  let nAlreadyDone = 0;
  let totalJobsToCreate = 0;
  let totalBatchesCreated = 0;
  const plan: Array<{
    sessionCode: string;
    sessionId: string;
    sessionName: string;
    nParticipants: number;
    nJobsToCreate: number;
    docKindsBreakdown: Map<ClosureDocKind, number>;
  }> = [];
  const incompleteSessions: Array<{ code: string; name: string; nParticipants: number; blockers: string[] }> = [];

  for (const session of sessions) {
    if (session.participants.length === 0) {
      nNoParticipants++;
      continue;
    }

    // 2. Filtre completeness (mêmes critères que closure-pack.ts)
    const completeness = getSessionCompleteness({
      startDate: session.startDate,
      endDate: session.endDate,
      pricePerLearner: session.pricePerLearner,
      locationId: session.locationId,
      location: session.location,
      modality: session.modality,
      trainers: session.trainers,
      product: session.product ? { programMd: session.product.programMd } : null,
      participantsCount: session.participants.length,
    });
    if (!completeness.ready) {
      nIncomplete++;
      incompleteSessions.push({
        code: session.code,
        name: session.name,
        nParticipants: session.participants.length,
        blockers: completeness.blockers.map((b) => b.label),
      });
      continue;
    }

    // 3. Charger docs existants pour cette session
    const participantIds = session.participants.map((p) => p.id);
    const [existingDocs, existingAssets] = await Promise.all([
      prisma.document.findMany({
        where: {
          tenantId: tenant.id,
          sessionId: session.id,
          participantId: { in: participantIds },
          type: { in: ['ATTESTATION_FIN', 'CERTIFICAT_REALISATION'] },
        },
        select: { participantId: true, type: true },
      }),
      prisma.pedagogicalAsset.findMany({
        where: {
          tenantId: tenant.id,
          sessionId: session.id,
          participantId: { in: participantIds },
          pdfUrl: { not: null },
        },
        select: { participantId: true, kind: true },
      }),
    ]);

    // 4. Calculer les docs déjà faits par participant
    const doneByParticipant = new Map<string, Set<ClosureDocKind>>();
    for (const d of existingDocs) {
      if (!d.participantId) continue;
      const set = doneByParticipant.get(d.participantId) ?? new Set<ClosureDocKind>();
      if (d.type === 'ATTESTATION_FIN') set.add('ATTESTATION');
      if (d.type === 'CERTIFICAT_REALISATION') set.add('CERTIFICAT');
      doneByParticipant.set(d.participantId, set);
    }
    for (const a of existingAssets) {
      if (!a.participantId) continue;
      const set = doneByParticipant.get(a.participantId) ?? new Set<ClosureDocKind>();
      const closureKind = a.kind === 'DEROULE' ? 'DEROULE_PEDA' : a.kind;
      if ((CLOSURE_DOC_KINDS as readonly string[]).includes(closureKind)) {
        set.add(closureKind as ClosureDocKind);
      }
      doneByParticipant.set(a.participantId, set);
    }

    // 5. Construire la liste des jobs à créer (= docs manquants)
    const jobsToCreate: Array<{ participantId: string; kind: ClosureDocKind }> = [];
    for (const p of session.participants) {
      const done = doneByParticipant.get(p.id) ?? new Set<ClosureDocKind>();
      for (const kind of CLOSURE_DOC_KINDS) {
        if (!done.has(kind)) {
          jobsToCreate.push({ participantId: p.id, kind });
        }
      }
    }

    if (jobsToCreate.length === 0) {
      nAlreadyDone++;
      continue;
    }

    // 6. Breakdown par docKind (juste pour le récap)
    const docKindsBreakdown = new Map<ClosureDocKind, number>();
    for (const j of jobsToCreate) {
      docKindsBreakdown.set(j.kind, (docKindsBreakdown.get(j.kind) ?? 0) + 1);
    }

    plan.push({
      sessionCode: session.code,
      sessionId: session.id,
      sessionName: session.name,
      nParticipants: session.participants.length,
      nJobsToCreate: jobsToCreate.length,
      docKindsBreakdown,
    });
    totalJobsToCreate += jobsToCreate.length;
  }

  // === Récap dry-run ===
  console.log(`\n📊 SYNTHÈSE`);
  console.log(`   Sessions analysées            : ${sessions.length}`);
  console.log(`   Sans participants éligibles   : ${nNoParticipants}`);
  console.log(`   Incomplètes (skip)            : ${nIncomplete}`);
  console.log(`   Déjà complètes               : ${nAlreadyDone}`);
  console.log(`   À traiter                    : ${plan.length}`);
  console.log(`   Total jobs à enqueue         : ${totalJobsToCreate}`);

  if (plan.length === 0) {
    if (incompleteSessions.length > 0) {
      console.log(`\n⚠️  ${incompleteSessions.length} sessions sont marquées INCOMPLÈTES par le check Qualiopi.`);
      console.log(`   Stat des blockers (raison de skip) :\n`);
      const blockerStats = new Map<string, number>();
      for (const s of incompleteSessions) {
        for (const b of s.blockers) blockerStats.set(b, (blockerStats.get(b) ?? 0) + 1);
      }
      for (const [b, n] of [...blockerStats.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`   ${n.toString().padStart(4)}× ${b}`);
      }
      console.log(`\n   Top 15 sessions incomplètes (par nb participants) :`);
      const topIncomplete = [...incompleteSessions]
        .sort((a, b) => b.nParticipants - a.nParticipants)
        .slice(0, 15);
      for (const s of topIncomplete) {
        console.log(`   ${s.code.padEnd(10)} ${s.nParticipants.toString().padStart(3)} part. · ${s.blockers.join(', ')}`);
        console.log(`            ${s.name.slice(0, 80)}`);
      }
      console.log(`\n💡 Pour traiter ces sessions : corriger les blockers (formateur/prix/programme/etc.) dans QualiOF.`);
    } else {
      console.log('\n✅ Rien à faire — toutes les sessions sont déjà complètes.');
    }
    await prisma.$disconnect();
    return;
  }

  // Top 10 sessions par nombre de jobs
  console.log(`\n🔥 Top 10 sessions à traiter :`);
  const topPlan = [...plan].sort((a, b) => b.nJobsToCreate - a.nJobsToCreate).slice(0, 10);
  for (const p of topPlan) {
    console.log(`   ${p.sessionCode.padEnd(10)} ${p.nParticipants.toString().padStart(3)} part. · ${p.nJobsToCreate.toString().padStart(4)} jobs · ${p.sessionName.slice(0, 60)}`);
  }

  // Breakdown global par docKind
  const globalKinds = new Map<ClosureDocKind, number>();
  for (const p of plan) {
    for (const [k, n] of p.docKindsBreakdown) {
      globalKinds.set(k, (globalKinds.get(k) ?? 0) + n);
    }
  }
  console.log(`\n📋 Breakdown par type de doc :`);
  for (const [k, n] of [...globalKinds.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(k).padEnd(20)} ${n}`);
  }

  // Estimation temps : ~30s/job avec concurrency=3 = 10s/job moyen
  const estimMinutes = Math.ceil((totalJobsToCreate * 10) / 60);
  console.log(`\n⏱️  Estimation temps worker (concurrency=3, ~30s/job) : ~${estimMinutes} min (${Math.ceil(estimMinutes / 60)}h)`);

  if (!COMMIT) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  🧪 DRY-RUN terminé. Aucun batch créé.`);
    console.log(`  Pour lancer : ajouter --commit en argument.`);
    console.log(`${'='.repeat(70)}\n`);
    await prisma.$disconnect();
    return;
  }

  // === COMMIT : créer les batches + enqueue ===
  console.log(`\n⚠️  Création des ClosureBatch et enqueue BullMQ...`);
  let okBatches = 0;
  let failBatches = 0;

  for (const p of plan) {
    try {
      // Re-fetch la session pour récupérer les participantIds frais
      const session = await prisma.trainingSession.findUnique({
        where: { id: p.sessionId },
        include: {
          participants: {
            where: { enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] } },
            select: { id: true },
          },
        },
      });
      if (!session) continue;

      // Re-calculer les jobs (en cas de changement entre dry-run et commit)
      const sessionParticipantIds = session.participants.map((sp) => sp.id);
      const [existingDocs, existingAssets] = await Promise.all([
        prisma.document.findMany({
          where: {
            tenantId: tenant.id,
            sessionId: p.sessionId,
            participantId: { in: sessionParticipantIds },
            type: { in: ['ATTESTATION_FIN', 'CERTIFICAT_REALISATION'] },
          },
          select: { participantId: true, type: true },
        }),
        prisma.pedagogicalAsset.findMany({
          where: {
            tenantId: tenant.id,
            sessionId: p.sessionId,
            participantId: { in: sessionParticipantIds },
            pdfUrl: { not: null },
          },
          select: { participantId: true, kind: true },
        }),
      ]);

      const doneByPid = new Map<string, Set<ClosureDocKind>>();
      for (const d of existingDocs) {
        if (!d.participantId) continue;
        const set = doneByPid.get(d.participantId) ?? new Set<ClosureDocKind>();
        if (d.type === 'ATTESTATION_FIN') set.add('ATTESTATION');
        if (d.type === 'CERTIFICAT_REALISATION') set.add('CERTIFICAT');
        doneByPid.set(d.participantId, set);
      }
      for (const a of existingAssets) {
        if (!a.participantId) continue;
        const set = doneByPid.get(a.participantId) ?? new Set<ClosureDocKind>();
        const ck = a.kind === 'DEROULE' ? 'DEROULE_PEDA' : a.kind;
        if ((CLOSURE_DOC_KINDS as readonly string[]).includes(ck)) {
          set.add(ck as ClosureDocKind);
        }
        doneByPid.set(a.participantId, set);
      }

      const jobsData = sessionParticipantIds.flatMap((pid) => {
        const done = doneByPid.get(pid) ?? new Set<ClosureDocKind>();
        return CLOSURE_DOC_KINDS.filter((k) => !done.has(k)).map((kind) => ({
          participantId: pid,
          kind,
          status: 'QUEUED' as const,
        }));
      });

      if (jobsData.length === 0) continue; // déjà complet entre dry-run et commit

      const batch = await prisma.closureBatch.create({
        data: {
          tenantId: tenant.id,
          sessionId: p.sessionId,
          status: 'PENDING',
          totalDocs: jobsData.length,
          createdByUserId: adminUser.id,
          jobs: { create: jobsData },
        },
        include: { jobs: { select: { id: true, participantId: true, kind: true } } },
      });

      await Promise.all(
        batch.jobs.map((job) =>
          enqueueClosureJob({
            jobId: job.id,
            batchId: batch.id,
            tenantId: tenant.id,
            sessionId: p.sessionId,
            participantId: job.participantId,
            kind: job.kind,
          }),
        ),
      );

      okBatches++;
      totalBatchesCreated++;
      console.log(`   ✅ ${p.sessionCode} : batch ${batch.id} (${jobsData.length} jobs)`);
    } catch (err) {
      failBatches++;
      console.error(`   ❌ ${p.sessionCode} :`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ✅ ${okBatches} batches créés · ❌ ${failBatches} échecs`);
  console.log(`  ${totalJobsToCreate} jobs enqueued dans BullMQ`);
  console.log(`  Le worker (concurrency=3) traite ça en arrière-plan.`);
  console.log(`  Suivi : http://localhost:3010/app  → section "Génération en cours"`);
  console.log(`${'='.repeat(70)}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Erreur :', err);
  prisma.$disconnect().finally(() => process.exit(1));
});
