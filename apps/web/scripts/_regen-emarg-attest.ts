import fs from 'node:fs';
import { prisma } from '@qualiof/db';
import { enqueueClosureJob } from '../src/lib/closure/queue-postgres';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';
const sess = await prisma.trainingSession.findFirstOrThrow({ where: { code: 'SES-0032' }, select: { id: true, tenantId: true, participants: { where: { person: { firstName: { contains: 'Caroline', mode: 'insensitive' } } }, select: { id: true, person: { select: { firstName: true, lastName: true } } } } } });
const p = sess.participants[0]!;
const batch = await prisma.closureBatch.create({ data: { tenantId: sess.tenantId, sessionId: sess.id, status: 'PENDING', totalDocs: 2, jobs: { create: [{ participantId: p.id, kind: 'EMARGEMENT' as any, status: 'QUEUED' as const }, { participantId: p.id, kind: 'ATTESTATION' as any, status: 'QUEUED' as const }] } }, include: { jobs: true } });
await Promise.all(batch.jobs.map(j => enqueueClosureJob({ jobId: j.id, batchId: batch.id, tenantId: sess.tenantId, sessionId: sess.id, participantId: p.id, kind: j.kind as any })));
for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,2000)); const c = await prisma.closureJob.count({ where: { batchId: batch.id, status: { in: ['DONE','ERROR'] } } }); if (c>=2) break; }
const jobs = await prisma.closureJob.findMany({ where: { batchId: batch.id }, select: { kind: true, status: true, documentId: true } });
const who = `${p.person.firstName}-${p.person.lastName}`.replace(/\s+/g,'_');
for (const j of jobs) {
  const d = j.documentId ? await prisma.document.findUnique({ where: { id: j.documentId }, select: { pdfUrl: true } }) : null;
  if (d?.pdfUrl) { fs.writeFileSync(`/tmp/closure-day2/pack-SES0032/${j.kind}__${who}.pdf`, await downloadFile(DOCS_BUCKET, d.pdfUrl)); console.log(`✓ ${j.kind} ${j.status}`); }
  else console.log(`✗ ${j.kind} ${j.status} (pas de doc)`);
}
await prisma.$disconnect();
