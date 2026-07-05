import { prisma } from '@qualiof/db';
import { enqueueClosureJob } from '../src/lib/closure/queue-postgres';
const sess = await prisma.trainingSession.findFirstOrThrow({
  where: { code: 'SES-0032' },
  select: { id: true, tenantId: true, participants: { where: { enrollmentStatus: { in: ['PRE_ENROLLED','CONFIRMED','ATTENDED'] } }, select: { id: true } } },
});
const batch = await prisma.closureBatch.create({ data: { tenantId: sess.tenantId, sessionId: sess.id, status: 'PENDING', totalDocs: sess.participants.length,
  jobs: { create: sess.participants.map(p => ({ participantId: p.id, kind: 'SATISFACTION_FROID' as any, status: 'QUEUED' as const })) } }, include: { jobs: true } });
await Promise.all(batch.jobs.map(j => enqueueClosureJob({ jobId: j.id, batchId: batch.id, tenantId: sess.tenantId, sessionId: sess.id, participantId: j.participantId!, kind: 'SATISFACTION_FROID' as any })));
console.log(`Enqueued ${batch.jobs.length} SATISFACTION_FROID…`);
for (let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,3000));
  const c = await prisma.closureJob.groupBy({ by:['status'], where:{batchId:batch.id}, _count:true });
  const m = Object.fromEntries(c.map(x=>[x.status,x._count]));
  if (((m['DONE']??0)+(m['ERROR']??0))>=batch.jobs.length) break;
}
const done = await prisma.closureJob.findMany({ where:{batchId:batch.id}, select:{status:true,usedStub:true} });
console.log('Résultat:', JSON.stringify({ done: done.filter(d=>d.status==='DONE').length, stubs: done.filter(d=>d.usedStub).length, err: done.filter(d=>d.status==='ERROR').length }));
await prisma.$disconnect();
