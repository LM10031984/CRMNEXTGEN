const { prisma } = await import('@qualiof/db');
const persons = await prisma.person.findMany({
  where: { OR: [{ lastName: { contains: 'KING', mode: 'insensitive' } }, { firstName: { contains: 'Kristin', mode: 'insensitive' } }] },
  select: { id: true, firstName: true, lastName: true, professionalExperience: true, diplomas: true, educationLevel: true,
    legalLinks: { select: { role: true, organization: { select: { legalName: true, brandName: true } } } } },
  take: 5,
});
console.log('PERSONS:', JSON.stringify(persons, null, 2));
for (const p of persons) {
  const sps = await prisma.sessionParticipant.findMany({
    where: { personId: p.id },
    select: { session: { select: { name: true, startDate: true, endDate: true, product: { select: { code: true, title: true, durationHours: true } } } } },
    take: 3,
  });
  console.log(`SESSIONS ${p.firstName} ${p.lastName}:`, JSON.stringify(sps, null, 2));
}
await prisma.$disconnect();
