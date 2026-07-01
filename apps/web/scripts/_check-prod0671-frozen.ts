const { prisma } = await import('@qualiof/db');
const p: any = await prisma.trainingProduct.findFirst({ where: { code: 'PROD-0671' }, select: { objectives: true, derouleJson: true } });
console.log('objectives :', Array.isArray(p.objectives) ? p.objectives.length+' objectifs' : 'VIDE');
console.log('derouleJson :', p.derouleJson ? 'PRÉSENT ('+(p.derouleJson.jours?.length)+' jour, '+(p.derouleJson.jours?.[0]?.sequences?.length)+' séquences)' : 'VIDE');
await prisma.$disconnect();
