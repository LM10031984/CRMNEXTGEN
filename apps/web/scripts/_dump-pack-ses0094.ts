/**
 * One-off Phase 20 (checkpoint Task 3) — dump du pack témoin cloud SES-0094
 * pour validation visuelle Laurent : les 21 PDFs du dernier batch, nommés
 * <kind>--<participant>.pdf, + champs extraits de la pré-inscription OCR P6d.
 *
 * Usage : dotenv -e ../../.env -- tsx scripts/_dump-pack-ses0094.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@qualiof/db';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';

const OUT_DIR = '/tmp/pack-temoin-ses0094';

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

async function main() {
  const session = await prisma.trainingSession.findFirst({
    where: { code: 'SES-0094' },
  });
  if (!session) {
    console.error('Session SES-0094 introuvable');
    process.exit(1);
  }

  const batch = await prisma.closureBatch.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });
  if (!batch) {
    console.error('Aucun batch pour SES-0094');
    process.exit(1);
  }
  console.log(`→ Batch ${batch.id.slice(0, 8)} (${batch.status}, ${batch.doneDocs}/${batch.totalDocs} docs, créé ${batch.createdAt.toISOString()})`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0;
  for (const job of batch.jobs) {
    const sp = await prisma.sessionParticipant.findUnique({
      where: { id: job.participantId },
      include: { person: true },
    });
    const who = sp?.person ? `${sp.person.firstName}-${sp.person.lastName}` : job.participantId.slice(0, 8);

    let pdfKey: string | null = null;
    if (job.documentId) {
      const d = await prisma.document.findUnique({ where: { id: job.documentId } });
      pdfKey = d?.pdfUrl ?? null;
    } else if (job.pedagogicalAssetId) {
      const a = await prisma.pedagogicalAsset.findUnique({ where: { id: job.pedagogicalAssetId } });
      pdfKey = a?.pdfUrl ?? null;
    }
    if (!pdfKey) {
      console.log(`  ✗ ${job.kind} / ${who} : pas de pdfKey (status=${job.status})`);
      continue;
    }
    const buf = await downloadFile(DOCS_BUCKET, pdfKey);
    const outPath = path.join(OUT_DIR, `${job.kind.toLowerCase()}--${slug(who)}.pdf`);
    fs.writeFileSync(outPath, buf);
    ok++;
    console.log(`  ✓ ${job.kind.padEnd(18)} ${who.padEnd(25)} stub=${job.usedStub} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`\n${ok}/${batch.jobs.length} PDFs dans ${OUT_DIR}`);

  // Pré-inscription OCR P6d — champs extraits (pas de dump du scan, PII fictive suffit en console)
  const pre = await prisma.preEnrollment.findFirst({
    where: { status: 'EXTRACTED' },
    orderBy: { updatedAt: 'desc' },
  });
  if (pre) {
    console.log(`\n→ Pré-inscription OCR (P6d) : id=${pre.id.slice(0, 8)} status=${pre.status}`);
    const { extractedJson } = pre as unknown as { extractedJson?: unknown };
    console.log(JSON.stringify(extractedJson ?? pre, null, 2).slice(0, 2000));
  } else {
    console.log('\n(Pas de PreEnrollment EXTRACTED trouvée)');
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
