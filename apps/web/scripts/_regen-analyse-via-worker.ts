// Régénère l'analyse besoin de Kristin King EN PASSANT PAR LA VRAIE FILE BullMQ
// (le worker cloud lancé à la main l'attrape). Puis télécharge le PDF stocké.
import fs from 'node:fs';

const { prisma } = await import('@qualiof/db');
const { enqueueClosureJob } = await import('../src/lib/closure/queue');
const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');

const sp = await prisma.sessionParticipant.findFirstOrThrow({
  where: {
    person: { firstName: { contains: 'Kristin', mode: 'insensitive' }, lastName: { contains: 'King', mode: 'insensitive' } },
  },
  select: { id: true, sessionId: true, session: { select: { tenantId: true, code: true } } },
});
const { id: participantId, sessionId } = sp;
const tenantId = sp.session.tenantId;
console.log(`Participant=${participantId} session=${sp.session.code} (${sessionId})`);

const batch = await prisma.closureBatch.create({
  data: { tenantId, sessionId, status: 'PENDING', totalDocs: 1, doneDocs: 0, errorDocs: 0 },
});
const job = await prisma.closureJob.create({
  data: { batchId: batch.id, participantId, kind: 'ANALYSE_BESOIN', status: 'QUEUED' },
});
await enqueueClosureJob({ jobId: job.id, batchId: batch.id, tenantId, sessionId, participantId, kind: 'ANALYSE_BESOIN' });
console.log(`Job ${job.id} enqueued → attente du worker cloud…`);

// Poll jusqu'à DONE/ERROR (max 180s)
let final: { status: string; errorMessage: string | null; pedagogicalAssetId: string | null; usedStub: boolean } | null = null;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const j = await prisma.closureJob.findUnique({
    where: { id: job.id },
    select: { status: true, errorMessage: true, pedagogicalAssetId: true, usedStub: true },
  });
  if (j && (j.status === 'DONE' || j.status === 'ERROR')) { final = j; break; }
  if (i % 5 === 0) console.log(`  …${j?.status} (${i * 2}s)`);
}
if (!final) throw new Error('Timeout — le worker n’a pas terminé en 180s');
console.log(`\nRésultat job: status=${final.status} usedStub=${final.usedStub} err=${final.errorMessage ?? '—'}`);
if (final.status === 'ERROR') throw new Error(`Job ERROR: ${final.errorMessage}`);

const asset = await prisma.pedagogicalAsset.findFirstOrThrow({
  where: { sessionId, participantId, kind: 'ANALYSE_BESOIN' },
  select: { pdfUrl: true, generatedAt: true, rawJson: true },
});
console.log(`PedagogicalAsset pdfUrl=${asset.pdfUrl} generatedAt=${asset.generatedAt.toISOString()}`);

const pdf = await downloadFile(DOCS_BUCKET, asset.pdfUrl);
const OUT = '/tmp/closure-day2/analyse-besoin-VIA-WORKER.pdf';
fs.mkdirSync('/tmp/closure-day2', { recursive: true });
fs.writeFileSync(OUT, pdf);
console.log(`\n✓ ${OUT} — ${(pdf.length / 1024).toFixed(0)}KB (téléchargé depuis MinIO, généré par le worker)`);
await prisma.$disconnect();
