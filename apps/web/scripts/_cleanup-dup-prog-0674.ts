import { prisma } from '@qualiof/db';
async function main() {
  // Doublon PROGRAMME créé par le run 1 de _gen-optimmo-152h-docs (WeasyPrint
  // non byte-déterministe → hash différent au run 2). Suppression ciblée par id.
  const r = await prisma.document.deleteMany({
    where: {
      id: 'e4827ea3-c9d3-4ffc-90e3-251294647eb6',
      tenantId: 'db191440-a144-48d1-93c1-767e6f647f2c',
      type: 'PROGRAMME',
      pdfUrl: 'programmes/produits/prod-0674-37f27666.pdf',
    },
  });
  console.log('Doublon supprimé:', r.count);
  const remaining = await prisma.document.findMany({
    where: { tenantId: 'db191440-a144-48d1-93c1-767e6f647f2c', type: { in: ['PROGRAMME', 'CONVENTION'] }, OR: [
      { entityId: '924ae33d-c144-4d5e-a8ed-353d9f7d5b21' },
      { entityId: '63311a5a-6dcb-4557-9bd9-e553d71292ab' },
    ] },
    select: { id: true, type: true, entityType: true, pdfUrl: true },
  });
  console.log('Documents restants PROD-0674/SES-0106:', JSON.stringify(remaining, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
