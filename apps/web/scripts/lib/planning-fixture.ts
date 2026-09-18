import { prisma } from '@qualiof/db';
import { analyserCible } from '../../../../packages/db/scripts/assert-db-target';

/** Données fictives réservées aux deux bases locales du chantier planning. */
export async function seedPlanningFixture() {
  const target = analyserCible(process.env.DATABASE_URL);
  if (
    !target.autorisee ||
    !['qualiof_dev_files-planning', 'qualiof_dev_files-planning_test'].includes(target.base)
  )
    throw new Error('Fixture planning : cible locale dédiée obligatoire.');
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length !== 1 || tenants[0]!.name !== 'E2E-Planning')
    throw new Error('Fixture planning : population E2E-Planning uniquement.');
  const tenantId = tenants[0]!.id;
  const product = await prisma.trainingProduct.upsert({
    where: { id: 'planning-demo-product' },
    update: {},
    create: {
      id: 'planning-demo-product',
      tenantId,
      code: 'DEMO-PLANNING',
      title: 'Intelligence artificielle et immobilier',
      durationHours: 21,
      modality: 'PRESENTIEL',
      objectives: ['Pratiquer'],
      programMd: 'Démonstration locale du planning.',
    },
  });
  for (const [id, firstName, lastName] of [
    ['planning-alice', 'Alice', 'Martin'],
    ['planning-benoit', 'Benoît', 'Durand'],
    ['planning-claire', 'Claire', 'Moreau'],
  ]) {
    await prisma.person.upsert({
      where: { id: id! },
      update: {},
      create: { id, tenantId, firstName: firstName!, lastName: lastName! },
    });
    const found = await prisma.externalIdentity.findFirst({
      where: { tenantId, entityType: 'Person.Trainer', entityId: id },
    });
    if (!found)
      await prisma.externalIdentity.create({
        data: {
          tenantId,
          entityType: 'Person.Trainer',
          entityId: id!,
          source: 'planning-demo',
          externalId: id!,
        },
      });
  }
  const fixtures = [
    {
      id: 'planning-individuel',
      code: 'DEMO-101',
      name: 'IA pour les agents co',
      regime: 'INDIVIDUEL' as const,
      days: [14, 15, 16],
      trainer: 'planning-alice',
    },
    {
      id: 'planning-entreprise',
      code: 'DEMO-102',
      name: 'IA en entreprise',
      regime: 'ENTREPRISE' as const,
      days: [14, 15, 16],
      trainer: 'planning-alice',
    },
    {
      id: 'planning-co',
      code: 'DEMO-103',
      name: 'Prospection augmentée',
      regime: 'INDIVIDUEL' as const,
      days: [21, 22, 23],
      trainer: 'planning-benoit',
    },
    {
      id: 'planning-historique',
      code: 'DEMO-104',
      name: 'Relation client',
      regime: null,
      days: [24, 25],
      trainer: 'planning-claire',
    },
    {
      id: 'planning-conflit',
      code: 'DEMO-105',
      name: 'Atelier management',
      regime: 'ENTREPRISE' as const,
      days: [17, 18],
      trainer: 'planning-claire',
    },
  ];
  for (const f of fixtures) {
    const date = (day: number) => new Date(`2026-09-${day}T00:00:00Z`);
    await prisma.trainingSession.upsert({
      where: { id: f.id },
      update: {},
      create: {
        id: f.id,
        tenantId,
        productId: product.id,
        code: f.code,
        name: f.name,
        regime: f.regime,
        status: 'PLANNED',
        startDate: date(f.days[0]!),
        endDate: date(f.days[f.days.length - 1]!),
        modality: 'PRESENTIEL',
        trainers: {
          create: [
            { personId: f.trainer, role: 'FORMATEUR', isPrimary: true },
            ...(f.id === 'planning-individuel'
              ? [{ personId: 'planning-benoit', role: 'FORMATEUR', isPrimary: false }]
              : []),
          ],
        },
        slots: {
          create:
            f.regime === null
              ? []
              : f.days.map((day) => ({
                  date: date(day),
                  halfDay: f.id === 'planning-individuel' ? 'morning' : 'full',
                  startTime: '09:00',
                  endTime: f.id === 'planning-individuel' ? '12:00' : '17:00',
                })),
        },
      },
    });
  }
  for (const a of [
    {
      id: 'planning-busy',
      trainerId: 'planning-claire',
      startsAt: new Date('2026-09-18T08:00:00Z'),
      endsAt: new Date('2026-09-18T18:00:00Z'),
      status: 'busy',
      note: 'Indisponibilité de démonstration',
    },
    {
      id: 'planning-tentative',
      trainerId: 'planning-benoit',
      startsAt: new Date('2026-09-28T08:00:00Z'),
      endsAt: new Date('2026-09-29T18:00:00Z'),
      status: 'tentative',
      note: 'À confirmer',
    },
  ])
    await prisma.trainerAvailability.upsert({
      where: { id: a.id },
      update: {},
      create: { ...a, tenantId },
    });
}
