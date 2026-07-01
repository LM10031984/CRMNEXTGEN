import { prisma } from '@qualiof/db';
const p = await prisma.trainingProduct.findFirstOrThrow({ where: { code: 'PROD-0058' } });
for (const f of ['accessibility','accessConditions','pedagogicalSupport','pedagogicalMethods','trainerProfile','targetAudience','prerequisites','evaluationMethods'] as const) {
  const v = (p as any)[f];
  if (v && String(v).length > 2) process.stdout.write(`--- ${f} ---\n${v}\n\n`);
}
await prisma.$disconnect();
