const { prisma } = await import('@qualiof/db');
const p: any = await prisma.trainingProduct.findFirst({ where: { code: 'PROD-0671' }, select: { programMd: true, objectives: true } });
console.log('objectives:', JSON.stringify(p.objectives));
console.log('\n===== programMd COMPLET =====\n');
console.log(p.programMd);
await prisma.$disconnect();
