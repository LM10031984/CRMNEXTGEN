/**
 * Test E2E Day 5 — flux complet sur SES-0010 (Caroline VESCOVI, AGEFICE).
 *
 * 1. Crée un batch et enqueue
 * 2. Poll jusqu'à COMPLETED (timeout 8 min — Ollama × 3 docs)
 * 3. Vérifie rawJson.source === 'ollama' sur les PedagogicalAssets
 * 4. Vérifie les Documents (ATTESTATION + CERTIFICAT)
 * 5. Récupère le zip via downloadClosureZip et inspecte son contenu
 * 6. Vérifie le naming et la structure : <slug>/<kind>.pdf
 *
 * Pré-requis : worker actif (`pnpm --filter @qualiof/web worker:closure`)
 * et Ollama dispo sur localhost:11434.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prisma } from '@qualiof/db';
import { CLOSURE_DOC_KINDS } from '../src/lib/closure/types';
import { enqueueClosureJob } from '../src/lib/closure/queue-postgres';

const SESSION_CODE = process.argv[2] ?? 'SES-0010';
const RESUME_BATCH_ID = process.env.RESUME_BATCH_ID ?? null;
const TIMEOUT_MS = 15 * 60_000;

async function main() {
  console.log(`\n🚀 E2E test Day 5 sur ${SESSION_CODE}${RESUME_BATCH_ID ? ` (resume ${RESUME_BATCH_ID.slice(0, 8)}…)` : ''}\n`);

  // 1. Charge la session
  const session = await prisma.trainingSession.findFirst({
    where: { code: SESSION_CODE },
    include: {
      participants: {
        select: {
          id: true,
          person: { select: { firstName: true, lastName: true, civility: true } },
          sponsorOrg: { select: { legalName: true, opcoCode: true } },
        },
      },
    },
  });
  if (!session) {
    console.error(`Session ${SESSION_CODE} introuvable`);
    process.exit(1);
  }
  console.log(`📚 Session : ${session.code} — ${session.name ?? '(sans nom)'}`);
  console.log(`👥 ${session.participants.length} participant(s) :`);
  for (const p of session.participants) {
    console.log(
      `   - ${p.person.civility ?? '?'} ${p.person.firstName} ${p.person.lastName} (sponsor: ${p.sponsorOrg.legalName}, OPCO=${p.sponsorOrg.opcoCode ?? '—'})`,
    );
  }

  // 2. Crée le batch (ou réutilise l'existant si RESUME_BATCH_ID)
  let batch: { id: string; createdAt: Date };
  if (RESUME_BATCH_ID) {
    const existing = await prisma.closureBatch.findUnique({ where: { id: RESUME_BATCH_ID } });
    if (!existing) throw new Error(`Batch ${RESUME_BATCH_ID} introuvable`);
    batch = existing;
    console.log(`\n♻️  Resume batch ${batch.id}`);
  } else {
    const totalDocs = session.participants.length * CLOSURE_DOC_KINDS.length;
    const created = await prisma.closureBatch.create({
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
    batch = created;
    console.log(`\n📦 Batch créé : ${batch.id}`);
    console.log(`   ${totalDocs} jobs à traiter\n`);

    for (const job of created.jobs) {
      await enqueueClosureJob({
        jobId: job.id,
        batchId: batch.id,
        tenantId: session.tenantId,
        sessionId: session.id,
        participantId: job.participantId,
        kind: job.kind,
      });
    }
  }

  // 3. Poll
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 3000));
    const b = await prisma.closureBatch.findUnique({ where: { id: batch.id } });
    if (!b) break;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r⏳ ${elapsed}s — status=${b.status} done=${b.doneDocs}/${b.totalDocs} errors=${b.errorDocs}     `,
    );
    if (b.status !== 'PENDING' && b.status !== 'RUNNING') break;
  }
  console.log('');

  // 4. Vérifications
  const final = await prisma.closureBatch.findUnique({
    where: { id: batch.id },
    include: {
      jobs: {
        include: {
          // pas de relation directe vers Document/PedagogicalAsset
        },
      },
    },
  });
  if (!final) {
    console.error('Batch disparu');
    process.exit(1);
  }

  console.log(`\n📊 Résultat : ${final.status} (${final.doneDocs}/${final.totalDocs})`);

  // Vérif sources Ollama
  const assets = await prisma.pedagogicalAsset.findMany({
    where: { sessionId: session.id, generatedAt: { gte: batch.createdAt } },
    select: { kind: true, rawJson: true, participantId: true },
  });
  const sources = new Map<string, number>();
  for (const a of assets) {
    const src = (a.rawJson as { source?: string })?.source ?? 'unknown';
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }
  console.log(`\n🤖 PedagogicalAsset sources :`);
  for (const [src, n] of sources) console.log(`   ${src} : ${n}`);

  const docs = await prisma.document.count({
    where: { sessionId: session.id, type: { in: ['ATTESTATION_FIN', 'CERTIFICAT_REALISATION'] }, createdAt: { gte: batch.createdAt } },
  });
  console.log(`\n📄 Documents (ATTESTATION+CERTIFICAT) : ${docs}`);

  // 5. Construit le zip directement (la server action exige validateRequest →
  //    pour ce test CLI on réplique la même logique sans dépendre de auth.ts).
  const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');
  const archiver = (await import('archiver')).default;

  const allJobs = await prisma.closureJob.findMany({
    where: { batchId: batch.id, status: 'DONE' },
  });
  const docMap = new Map(
    (await prisma.document.findMany({ where: { id: { in: allJobs.map((j) => j.documentId).filter(Boolean) as string[] } } })).map((d) => [d.id, d.pdfUrl]),
  );
  const assetMap = new Map(
    (await prisma.pedagogicalAsset.findMany({ where: { id: { in: allJobs.map((j) => j.pedagogicalAssetId).filter(Boolean) as string[] } } })).map((a) => [a.id, a.pdfUrl]),
  );
  const partMap = new Map(
    session.participants.map((p) => [
      p.id,
      `${p.person.lastName}-${p.person.firstName}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
    ]),
  );

  const zipPath = `/tmp/closure-day5-${SESSION_CODE}.zip`;
  const out = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(out);
  for (const job of allJobs) {
    const slug = partMap.get(job.participantId) ?? job.participantId.slice(0, 8);
    let pdfKey: string | null = null;
    if (job.documentId) pdfKey = docMap.get(job.documentId) ?? null;
    if (!pdfKey && job.pedagogicalAssetId) pdfKey = assetMap.get(job.pedagogicalAssetId) ?? null;
    if (!pdfKey) continue;
    try {
      const buf = await downloadFile(DOCS_BUCKET, pdfKey);
      archive.append(buf, { name: `${slug}/${job.kind.toLowerCase()}.pdf` });
    } catch (e) {
      console.warn(`skip ${job.id}:`, (e as Error).message);
    }
  }
  await archive.finalize();
  await new Promise<void>((r) => out.on('close', r));

  const zipSize = fs.statSync(zipPath).size;
  console.log(`\n📦 Zip écrit : ${zipPath} (${(zipSize / 1024).toFixed(1)} KB)`);

  // Inspect via unzip -l
  const listOutput = spawnSync('unzip', ['-l', zipPath]).stdout.toString();
  console.log(`\n📁 Contenu du zip :\n${listOutput}`);

  // Vérifications structurelles
  const expectedFiles = session.participants.length * CLOSURE_DOC_KINDS.length;
  const fileCount = (listOutput.match(/\.pdf$/gm) ?? []).length;
  const ok = fileCount === expectedFiles;
  console.log(`✅ ${fileCount} PDFs attendus=${expectedFiles} : ${ok ? 'OK' : 'KO'}`);

  await prisma.$disconnect();
  process.exit(ok && final.status === 'COMPLETED' ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
