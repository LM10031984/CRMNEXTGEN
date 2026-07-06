const { prisma } = await import('@qualiof/db');
const s: any = await prisma.trainingSession.findFirst({ where: { code:'SES-0097' }, select: { trainers: { select: { isPrimary:true, person: { select: { firstName:true, lastName:true, email:true } } } } } });
for (const t of s.trainers) console.log(`${t.isPrimary?'[principal] ':''}${t.person.firstName} ${t.person.lastName} → ${t.person.email ?? 'PAS D EMAIL'}`);
await prisma.$disconnect();
