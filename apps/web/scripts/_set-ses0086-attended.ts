const { prisma } = await import('@qualiof/db');
const s = await prisma.trainingSession.findFirstOrThrow({ where: { code: 'SES-0086' }, select: { id: true } });
const before = await prisma.sessionParticipant.groupBy({ by: ['enrollmentStatus'], where: { sessionId: s.id }, _count: true });
console.log('avant :', before.map(b=>`${b.enrollmentStatus}=${b._count}`).join(' '));
const r = await prisma.sessionParticipant.updateMany({ where: { sessionId: s.id }, data: { enrollmentStatus: 'ATTENDED' } });
console.log('✓ mis à ATTENDED :', r.count);
await prisma.$disconnect();
