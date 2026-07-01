const { prisma } = await import('@qualiof/db');
const t = await prisma.tenant.findFirst({ select: { id: true } });
console.log('tenantId:', t?.id);
const s: any = await prisma.trainingSession.findFirst({ where: { code:'SES-0097' }, select: { id:true, locationId:true, productId:true } });
console.log('SES-0097 id:', s.id, '| locationId actuel:', s.locationId, '| productId:', s.productId);
const prod = await prisma.trainingProduct.findUnique({ where:{ id:s.productId }, select:{ code:true, priceHT:true } });
console.log('produit:', prod?.code, prod?.priceHT, '€');
const sophie: any = await prisma.person.findFirst({ where: { email:'s.lasselin@ashley-parker.fr' }, select:{ id:true, personalAddress:true } });
console.log('Sophie personalAddress (shape):', JSON.stringify(sophie?.personalAddress));
const sp = await prisma.sessionParticipant.findFirst({ where: { sessionId:s.id, personId: sophie.id }, select:{ id:true } });
console.log('Sophie participation id (à retirer):', sp?.id);
// un EI existant pour voir le shape org address + opcoCode
const ei: any = await prisma.organization.findFirst({ where: { legalForm:'AUTO_ENTREPRENEUR', opcoCode:'AGEFICE' }, select:{ legalName:true, address:true, opcoCode:true, type:true } });
console.log('exemple EI AGEFICE:', JSON.stringify(ei));
await prisma.$disconnect();
