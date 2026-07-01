const { prisma } = await import('@qualiof/db');
const NOW = new Date('2026-06-25');
const sessions = await prisma.trainingSession.findMany({
  where: { startDate: { gte: new Date('2025-03-01') } },
  select: { code:true, startDate:true, endDate:true, status:true,
    product: { select: { title:true } },
    _count: { select: { participants: true } } },
  orderBy: { startDate: 'asc' },
});
let past=0, future=0, froidPending=0;
for (const s of sessions) {
  const end = s.endDate ?? s.startDate;
  if (end < NOW) past++; else future++;
  // froid relances (jusqu'à 2 mois après fin) encore à venir ?
  const froidEnd = new Date(end); froidEnd.setMonth(froidEnd.getMonth()+2);
  if (froidEnd >= NOW) froidPending++;
}
console.log('Sessions depuis 01/03/2025 :', sessions.length);
console.log('  passées (fin < 25/06/2026) :', past);
console.log('  à venir / en cours         :', future);
console.log('  avec relances froid encore à venir (≤ 2 mois après fin) :', froidPending);
console.log('  total participants (somme) :', sessions.reduce((a,s)=>a+s._count.participants,0));
console.log('\n— échantillon (5 premières / 5 dernières) —');
for (const s of [...sessions.slice(0,5), ...sessions.slice(-5)]) console.log(`  ${s.code} | ${s.startDate?.toISOString().slice(0,10)}→${s.endDate?.toISOString().slice(0,10)} | ${s.status} | ${s._count.participants} pers | ${s.product?.title?.slice(0,40)}`);
await prisma.$disconnect();
