/**
 * _discover-optimmo-152h-2.ts — DÉCOUVERTE LECTURE SEULE (suite, quick 2026-08-12).
 * Modèles programMd PROD-0063/PROD-0042, slots SES-0097, codes numériques max.
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_discover-optimmo-152h-2.ts
 */
import { prisma } from '@qualiof/db';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

async function main() {
  for (const code of ['PROD-0063', 'PROD-0042']) {
    const p = await prisma.trainingProduct.findFirst({
      where: { tenantId: TENANT_ID, code },
    });
    if (!p) continue;
    console.log(`\n########## ${code} — ${p.title}`);
    console.log('prerequisites:', p.prerequisites);
    console.log('targetAudience:', p.targetAudience);
    console.log('objectives:', JSON.stringify(p.objectives, null, 1));
    console.log('pedagogicalMethods:', p.pedagogicalMethods);
    console.log('evaluationMethods:', p.evaluationMethods);
    console.log('accessibility:', p.accessibility?.slice(0, 400));
    console.log('accessConditions:', p.accessConditions);
    console.log('trainerProfile:', p.trainerProfile);
    console.log('pedagogicalSupport:', p.pedagogicalSupport);
    console.log('theme:', p.theme, '| bpf:', p.bpfSpecialty, p.bpfCategory, p.bpfLevel, '| excludedFromBpf:', p.excludedFromBpf);
    console.log('agefice:', p.ageficeFormationType, p.ageficeNiveau, p.ageficeCertif, p.ageficeAttestation, JSON.stringify(p.ageficeEvaluations), p.ageficeEnEntreprise, p.ageficeMandat);
    console.log('capacityMin/Max:', p.capacityMin, p.capacityMax, '| aiDraftedAt:', p.aiDraftedAt, '| version:', p.version);
    console.log('--- programMd (INTÉGRAL) ---');
    console.log(p.programMd);
    console.log('--- fin programMd ---');
    const modules = await prisma.trainingModule.count({ where: { productId: p.id } });
    console.log('modules:', modules, '| derouleJson:', p.derouleJson ? 'présent' : 'null');
  }

  // Slots SES-0097 (format)
  const s97 = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, code: 'SES-0097' },
    select: { id: true },
  });
  if (s97) {
    const slots = await prisma.sessionSlot.findMany({
      where: { sessionId: s97.id },
      orderBy: { date: 'asc' },
      take: 4,
    });
    console.log('\nSLOTS SES-0097 (échantillon):', JSON.stringify(slots, null, 1));
  }

  // Codes numériques max
  const prods = await prisma.trainingProduct.findMany({
    where: { tenantId: TENANT_ID, code: { startsWith: 'PROD-' } },
    select: { code: true },
  });
  const numeric = prods
    .map((p) => /^PROD-(\d{4})$/.exec(p.code)?.[1])
    .filter((x): x is string => !!x)
    .map(Number)
    .sort((a, b) => b - a);
  console.log('\nMAX PROD numérique:', numeric[0], '| top5:', numeric.slice(0, 5).join(', '));

  const sess = await prisma.trainingSession.findMany({
    where: { tenantId: TENANT_ID, code: { startsWith: 'SES-' } },
    select: { code: true },
  });
  const numericS = sess
    .map((s) => /^SES-(\d{4})$/.exec(s.code)?.[1])
    .filter((x): x is string => !!x)
    .map(Number)
    .sort((a, b) => b - a);
  console.log('MAX SES numérique:', numericS[0], '| top5:', numericS.slice(0, 5).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
