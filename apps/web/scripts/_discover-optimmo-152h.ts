/**
 * _discover-optimmo-152h.ts — DÉCOUVERTE LECTURE SEULE (quick 2026-08-12).
 * Prépare la création produit 152h + session OPTIMMO + 11 inscriptions.
 * AUCUNE écriture. Run :
 *   cd apps/web && node --import tsx --env-file=../../.env scripts/_discover-optimmo-152h.ts
 */
import { prisma } from '@qualiof/db';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

const NAMES: Array<[string, string]> = [
  ['Caroline', 'ROZIER'],
  ['Elisabeth', 'SAVIGNAC'],
  ['Marianne', 'PERSICI'],
  ['Manuella', 'BARTOLI'],
  ['Agnès', 'RAGOT'],
  ['Lorena', 'MICALI'],
  ['Magalie', 'BOUMENDJEL'],
  ['Evelyne', 'SISMONDINI'],
  ['Kellie', 'CARDOSO-SOUSAN'],
  ['Marie', 'SIMONNEAU'],
  ['Sabrine', 'GADER'],
];

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { id: true, name: true },
  });
  console.log('TENANT:', JSON.stringify(tenant));

  // Produits IA existants (modèles programMd)
  const iaProducts = await prisma.trainingProduct.findMany({
    where: {
      tenantId: TENANT_ID,
      OR: [
        { theme: { contains: 'IA', mode: 'insensitive' } },
        { title: { contains: 'intelligence artificielle', mode: 'insensitive' } },
      ],
    },
    select: {
      code: true,
      title: true,
      durationHours: true,
      priceHT: true,
      vatRate: true,
      groupFlatPrice: true,
      modality: true,
      theme: true,
      isActive: true,
      capacityMax: true,
    },
    orderBy: { code: 'asc' },
  });
  console.log('\nPRODUITS IA:', iaProducts.length);
  for (const p of iaProducts) {
    console.log(
      `  ${p.code} | ${p.durationHours}h | ${p.priceHT} HT / TVA ${p.vatRate} / forfait ${p.groupFlatPrice} | ${p.modality} | actif=${p.isActive} | ${p.title.slice(0, 70)}`,
    );
  }

  // Derniers codes produit + session
  const lastProd = await prisma.trainingProduct.findFirst({
    where: { tenantId: TENANT_ID, code: { startsWith: 'PROD-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const lastSes = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, code: { startsWith: 'SES-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  console.log('\nDERNIER PROD:', lastProd?.code, '| DERNIÈRE SES:', lastSes?.code);

  // OPTIMMO ?
  const orgs = await prisma.organization.findMany({
    where: {
      tenantId: TENANT_ID,
      OR: [
        { siret: '43143029700033' },
        { legalName: { contains: 'OPTIMMO', mode: 'insensitive' } },
        { brandName: { contains: 'OPTIMMO', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      legalName: true,
      legalForm: true,
      siret: true,
      brandName: true,
      network: true,
      address: true,
      email: true,
      phone: true,
      representative: true,
      opcoCode: true,
    },
  });
  console.log('\nORGS OPTIMMO:', JSON.stringify(orgs, null, 2));

  // Les 11 personnes existent-elles ?
  console.log('\nPERSONNES:');
  for (const [firstName, lastName] of NAMES) {
    const found = await prisma.person.findMany({
      where: {
        tenantId: TENANT_ID,
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const exact = found.filter((f) => f.firstName.toLowerCase() === firstName.toLowerCase());
    console.log(
      `  ${lastName} ${firstName}: exact=${exact.length} homonymes-nom=${found.length}`,
      found.length ? JSON.stringify(found.map((f) => `${f.firstName} ${f.lastName} <${f.email ?? '∅'}> ${f.id.slice(0, 8)}`)) : '',
    );
  }

  // Lieux candidats
  const locs = await prisma.location.findMany({
    where: { tenantId: TENANT_ID, name: { contains: 'OPTIMMO', mode: 'insensitive' } },
    select: { id: true, name: true, legalName: true, address: true },
  });
  console.log('\nLOCATIONS OPTIMMO:', JSON.stringify(locs));

  // Pratique SessionSlot sur sessions multi-jours
  const multi = await prisma.trainingSession.findMany({
    where: { tenantId: TENANT_ID },
    select: { code: true, startDate: true, endDate: true, _count: { select: { slots: true } } },
    orderBy: { startDate: 'desc' },
    take: 12,
  });
  console.log('\nSESSIONS RÉCENTES (slots):');
  for (const s of multi) {
    const days =
      Math.round((s.endDate.getTime() - s.startDate.getTime()) / 86400000) + 1;
    console.log(`  ${s.code} | ${s.startDate.toISOString().slice(0, 10)} → ${s.endDate.toISOString().slice(0, 10)} (${days}j cal) | slots=${s._count.slots}`);
  }

  // Formateur le plus fréquent (info rapport)
  const trainers = await prisma.sessionTrainer.groupBy({
    by: ['personId'],
    _count: { personId: true },
    orderBy: { _count: { personId: 'desc' } },
    take: 3,
  });
  for (const t of trainers) {
    const p = await prisma.person.findUnique({ where: { id: t.personId }, select: { firstName: true, lastName: true } });
    console.log(`FORMATEUR fréquent: ${p?.firstName} ${p?.lastName} (${t._count.personId} sessions) ${t.personId}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
