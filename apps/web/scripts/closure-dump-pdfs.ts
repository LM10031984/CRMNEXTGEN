/**
 * Récupère les 5 PDFs du batch le plus récent et les écrit dans `/tmp/closure-day2/`
 * pour visualisation manuelle.
 *
 * Usage : pnpm --filter @qualiof/web dump:closure
 */

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@qualiof/db';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';

const OUT_DIR = '/tmp/closure-day2';

async function main() {
  const batch = await prisma.closureBatch.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      jobs: {
        include: {
          // pas de relation native, on charge à part
        },
      },
    },
  });
  if (!batch) {
    console.error('Aucun batch trouvé');
    process.exit(1);
  }
  console.log(`→ Dump du batch ${batch.id} (status=${batch.status})`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const job of batch.jobs) {
    let pdfKey: string | null = null;
    if (job.documentId) {
      const d = await prisma.document.findUnique({ where: { id: job.documentId } });
      pdfKey = d?.pdfUrl ?? null;
    } else if (job.pedagogicalAssetId) {
      const a = await prisma.pedagogicalAsset.findUnique({ where: { id: job.pedagogicalAssetId } });
      pdfKey = a?.pdfUrl ?? null;
    }
    if (!pdfKey) {
      console.log(`  - ${job.kind} : pas de pdfKey`);
      continue;
    }
    const buf = await downloadFile(DOCS_BUCKET, pdfKey);
    const outPath = path.join(OUT_DIR, `${job.kind.toLowerCase()}.pdf`);
    fs.writeFileSync(outPath, buf);
    console.log(`  ✓ ${job.kind.padEnd(15)} → ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\nOuvre les PDFs avec : open ${OUT_DIR}/*.pdf`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
