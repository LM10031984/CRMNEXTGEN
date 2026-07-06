const { prisma } = await import('@qualiof/db');
const s: any = await prisma.trainingSession.findFirst({
  where: { code: 'SES-0086' },
  select: { trainers: { select: { isPrimary: true, person: { select: { firstName: true, lastName: true } } } } },
});
console.log('Formateurs SES-0086 :', s.trainers.length);
for (const t of s.trainers) console.log(`  ${t.isPrimary?'[principal] ':''}${t.person.firstName} ${t.person.lastName}`);
const { loadTrainerSignatureDataUrl } = await import('../src/lib/closure/shared-template');
for (const t of s.trainers) {
  const name = `${t.person.firstName} ${t.person.lastName}`;
  const sig = loadTrainerSignatureDataUrl(undefined, name);
  console.log(`  signature « ${name} » : ${sig ? 'TROUVÉE ('+sig.length+' chars)' : 'AUCUNE (placeholder vide)'}`);
}
await prisma.$disconnect();
