const { prisma } = await import('@qualiof/db');
// Toutes les sessions du produit Tracfin PROD-0671
const sessions = await prisma.trainingSession.findMany({
  where: { product: { code: 'PROD-0671' } },
  select: { id: true, code: true, status: true, startDate: true,
    _count: { select: { participants: true } } },
  orderBy: { startDate: 'asc' },
});
console.log('Sessions PROD-0671 (Tracfin) :', sessions.length);
for (const s of sessions) {
  const docs = await prisma.document.count({ where: { sessionId: s.id } });
  console.log(`  ${s.code} ${s.status} ${s.startDate?.toISOString().slice(0,10)} | participants=${s._count.participants} | docs=${docs}`);
}
await prisma.$disconnect();
