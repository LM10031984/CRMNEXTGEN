import fs from 'node:fs';
import { prisma } from '@qualiof/db';
import { enqueueClosureJob } from '../src/lib/closure/queue-postgres';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';
const sess = await prisma.trainingSession.findFirstOrThrow({ where: { code: 'SES-0032' }, select: { id: true, tenantId: true, participants: { where: { person: { firstName: { contains: 'Caroline', mode: 'insensitive' } } }, select: { id: true } } } });
const p = sess.participants[0]!;
const batch = await prisma.closureBatch.create({ data: { tenantId: sess.tenantId, sessionId: sess.id, status: 'PENDING', totalDocs: 1, jobs: { create: [{ participantId: p.id, kind: 'EMARGEMENT' as any, status: 'QUEUED' as const }] } }, include: { jobs: true } });
const j0 = batch.jobs[0]!;
await enqueueClosureJob({ jobId: j0.id, batchId: batch.id, tenantId: sess.tenantId, sessionId: sess.id, participantId: p.id, kind: 'EMARGEMENT' as any });
let st = 'QUEUED', docId: string | null = null, err: string | null = null;
for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,2000)); const j = await prisma.closureJob.findUnique({ where: { id: j0.id }, select: { status: true, documentId: true, errorMessage: true } }); st=j!.status; docId=j!.documentId; err=j!.errorMessage; if (st==='DONE'||st==='ERROR') break; }
process.stdout.write(`EMARGEMENT status=${st} doc=${docId} err=${err}\n`);
if (docId) { const d = await prisma.document.findUnique({ where: { id: docId }, select: { pdfUrl: true } }); if (d?.pdfUrl) { fs.writeFileSync('/tmp/closure-day2/pack-SES0032/EMARGEMENT__Caroline-MARIACCI.pdf', await downloadFile(DOCS_BUCKET, d.pdfUrl)); process.stdout.write('downloaded OK\n'); } }
await prisma.$disconnect();
