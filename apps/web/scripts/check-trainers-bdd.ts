import { prisma } from '@qualiof/db';

async function main() {
  // 1. Persons déjà liés à au moins une session comme formateur
  const trainers = await prisma.person.findMany({
    where: { trainerSessions: { some: {} } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { lastName: 'asc' },
  });
  console.log(`👨‍🏫 ${trainers.length} Persons avec roleHint TRAINER en BDD :`);
  for (const t of trainers) {
    console.log(`   ${t.firstName} ${t.lastName} (${t.email ?? 'no email'}) — ${t.id}`);
  }

  // 2. Lister les noms apparaissant déjà comme SessionTrainer (isPrimary ou pas)
  const stCount = await prisma.sessionTrainer.groupBy({
    by: ['personId'],
    _count: { id: true },
  });
  console.log(`\n📊 ${stCount.length} formateurs distincts déjà liés via SessionTrainer :`);
  for (const row of stCount) {
    const p = await prisma.person.findUnique({
      where: { id: row.personId },
      select: { firstName: true, lastName: true },
    });
    console.log(`   ${p?.firstName ?? '?'} ${p?.lastName ?? '?'} : ${row._count.id} sessions`);
  }

  // 3. Total SessionTrainer avec isPrimary=true vs false
  const withPrimary = await prisma.sessionTrainer.count({ where: { isPrimary: true } });
  const total = await prisma.sessionTrainer.count();
  console.log(`\n📍 SessionTrainer : ${total} total, dont ${withPrimary} avec isPrimary=true`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
