const { prisma } = await import('@qualiof/db');
const s = await prisma.trainingSession.findFirst({
  where: { code: 'SES-0086' },
  select: {
    id: true, code: true, name: true, status: true, startDate: true, endDate: true,
    productId: true,
    product: { select: { id: true, code: true, title: true, durationHours: true, priceHT: true, programMd: true, derouleJson: true } },
    participants: {
      select: { id: true, enrollmentStatus: true, priceHT: true,
        person: { select: { firstName: true, lastName: true } } },
    },
  },
});
if (!s) { console.log('SES-0086 introuvable'); process.exit(0); }
console.log('Session :', s.code, '| name:', s.name, '| status:', s.status);
console.log('Dates   :', s.startDate?.toISOString().slice(0,10), '→', s.endDate?.toISOString().slice(0,10));
console.log('Produit :', s.product ? `${s.product.code} — ${s.product.title}` : 'AUCUN (productId='+s.productId+')');
if (s.product) {
  console.log('  durationHours:', s.product.durationHours, '| priceHT:', s.product.priceHT);
  console.log('  programMd:', s.product.programMd ? s.product.programMd.length+' chars' : 'VIDE/null');
  console.log('  derouleJson:', s.product.derouleJson ? 'présent' : 'VIDE/null');
}
console.log('Participants :', s.participants.length);
const byStatus: Record<string, number> = {};
for (const p of s.participants) byStatus[p.enrollmentStatus] = (byStatus[p.enrollmentStatus]??0)+1;
console.log('  par statut :', JSON.stringify(byStatus));
console.log('  prix HT renseigné :', s.participants.filter(p=>p.priceHT && p.priceHT>0).length, '/', s.participants.length);

const docs = await prisma.document.count({ where: { sessionId: s.id } });
const assets = await prisma.pedagogicalAsset.count({ where: { sessionId: s.id } });
const batches = await prisma.closureBatch.findMany({ where: { sessionId: s.id },
  select: { id: true, status: true, totalDocs: true, doneDocs: true, errorDocs: true, createdAt: true } });
console.log('\nDocuments en base   :', docs);
console.log('PedagogicalAssets   :', assets);
console.log('ClosureBatch        :', batches.length);
for (const b of batches) console.log('  batch', b.id.slice(0,8), b.status, `done=${b.doneDocs}/${b.totalDocs} err=${b.errorDocs}`, b.createdAt.toISOString().slice(0,16));
if (batches.length) {
  const jobs = await prisma.closureJob.groupBy({ by: ['kind','status'], where: { batch: { sessionId: s.id } }, _count: true });
  console.log('  jobs :', jobs.map(j=>`${j.kind}:${j.status}=${j._count}`).join(' '));
  const errJob = await prisma.closureJob.findFirst({ where: { batch: { sessionId: s.id }, status: 'ERROR' }, select: { kind: true, errorMessage: true } });
  if (errJob) console.log('  1er err:', errJob.kind, '→', errJob.errorMessage);
}
await prisma.$disconnect();
