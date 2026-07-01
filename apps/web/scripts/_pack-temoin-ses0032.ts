// PACK TÉMOIN COMPLET SES-0032 via le VRAI worker (9 CLOSURE_DOC_KINDS × participants).
// Réplique generateClosurePack (mode global) sans la couche auth.
import fs from 'node:fs';

const { prisma } = await import('@qualiof/db');
const { enqueueClosureJob } = await import('../src/lib/closure/queue');
const { CLOSURE_DOC_KINDS } = await import('../src/lib/closure/types');
const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');
const { normalizeGender } = await import('../src/lib/closure/shared-template');

const session = await prisma.trainingSession.findFirstOrThrow({
  where: { code: 'SES-0032' },
  select: {
    id: true, code: true, tenantId: true,
    participants: {
      where: { enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] } },
      select: { id: true, person: { select: { firstName: true, lastName: true, civility: true } } },
    },
  },
});
const parts = session.participants;
console.log(`Session ${session.code} — ${parts.length} participants :`);
for (const p of parts) {
  const g = normalizeGender(p.person.civility);
  console.log(`  - ${p.person.firstName} ${p.person.lastName} [${p.person.civility ?? '—'} → ${g ?? 'neutre'}]`);
}
const kinds = CLOSURE_DOC_KINDS as readonly string[];
console.log(`\n${kinds.length} docs × ${parts.length} pers = ${kinds.length * parts.length} jobs : ${kinds.join(', ')}`);

const batch = await prisma.closureBatch.create({
  data: {
    tenantId: session.tenantId, sessionId: session.id, status: 'PENDING',
    totalDocs: kinds.length * parts.length,
    jobs: { create: parts.flatMap((p) => kinds.map((kind) => ({ participantId: p.id, kind: kind as any, status: 'QUEUED' as const }))) },
  },
  include: { jobs: { select: { id: true, participantId: true, kind: true } } },
});
await Promise.all(batch.jobs.map((j) =>
  enqueueClosureJob({ jobId: j.id, batchId: batch.id, tenantId: session.tenantId, sessionId: session.id, participantId: j.participantId!, kind: j.kind as any })));
console.log(`\nBatch ${batch.id} enqueued (${batch.jobs.length} jobs) → worker cloud…\n`);

// Poll batch
const total = batch.jobs.length;
let done = 0;
for (let i = 0; i < 360; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const counts = await prisma.closureJob.groupBy({ by: ['status'], where: { batchId: batch.id }, _count: true });
  const m = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  done = (m['DONE'] ?? 0) + (m['ERROR'] ?? 0);
  if (i % 4 === 0) console.log(`  …DONE=${m['DONE'] ?? 0} ERROR=${m['ERROR'] ?? 0} RUNNING=${m['RUNNING'] ?? 0} QUEUED=${m['QUEUED'] ?? 0} / ${total}`);
  if (done >= total) break;
}

const jobs = await prisma.closureJob.findMany({
  where: { batchId: batch.id },
  select: { kind: true, status: true, usedStub: true, errorMessage: true, participantId: true, documentId: true, pedagogicalAssetId: true },
});
const partName = new Map(parts.map((p) => [p.id, `${p.person.firstName}-${p.person.lastName}`.replace(/\s+/g, '_')]));
const OUT = '/tmp/closure-day2/pack-SES0032';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let okN = 0, stubN = 0, errN = 0;
for (const j of jobs) {
  const who = partName.get(j.participantId!) ?? j.participantId;
  if (j.status === 'ERROR') { errN++; console.log(`  ✗ ${j.kind} ${who} — ERROR: ${j.errorMessage?.slice(0, 80)}`); continue; }
  let pdfUrl: string | null = null;
  if (j.pedagogicalAssetId) pdfUrl = (await prisma.pedagogicalAsset.findUnique({ where: { id: j.pedagogicalAssetId }, select: { pdfUrl: true } }))?.pdfUrl ?? null;
  if (!pdfUrl && j.documentId) pdfUrl = (await prisma.document.findUnique({ where: { id: j.documentId }, select: { pdfUrl: true } }))?.pdfUrl ?? null;
  if (!pdfUrl) { errN++; console.log(`  ✗ ${j.kind} ${who} — pas de pdfUrl`); continue; }
  const pdf = await downloadFile(DOCS_BUCKET, pdfUrl);
  fs.writeFileSync(`${OUT}/${j.kind}__${who}.pdf`, pdf);
  if (j.usedStub) { stubN++; console.log(`  ⚠ ${j.kind} ${who} — STUB (LLM échoué)`); } else okN++;
}
console.log(`\n✓ Pack écrit dans ${OUT} — ${okN} OK, ${stubN} stub, ${errN} erreur (${jobs.length} jobs)`);
await prisma.$disconnect();
