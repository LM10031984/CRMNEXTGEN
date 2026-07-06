const { prisma } = await import('@qualiof/db');
const find = async (q:string) => prisma.person.findMany({ where: { OR: [
  { firstName: { contains: q, mode:'insensitive' } }, { lastName: { contains: q, mode:'insensitive' } },
  { email: { contains: q, mode:'insensitive' } } ] }, select: { id:true, firstName:true, lastName:true, email:true } });
console.log('— Touati —', JSON.stringify(await find('touati')));
console.log('— Commissaire —', JSON.stringify(await find('commissaire')));
console.log('— Lasselin —', JSON.stringify(await find('lasselin')));
const orgs = await prisma.organization.findMany({ where: { OR:[{ legalName:{ contains:'century', mode:'insensitive' } }, { brandName:{ contains:'century', mode:'insensitive' } }] }, select:{ id:true, legalName:true, brandName:true } });
console.log('— Orgs Century 21 —', JSON.stringify(orgs));
// Sophie sur SES-0097 : où est-elle ailleurs ?
const sophie = (await find('lasselin'))[0];
if (sophie) {
  const parts = await prisma.sessionParticipant.findMany({ where: { personId: sophie.id }, select: { session:{ select:{ code:true } } } });
  console.log('— Sophie Lasselin participations :', parts.map((p:any)=>p.session.code).join(', '));
}
// location Mandelieu existe ?
const loc = await prisma.location.findMany({ where: { OR:[{ name:{ contains:'mandelieu', mode:'insensitive' } }, { address:{ contains:'mandelieu', mode:'insensitive' } }, { address:{ contains:'cannes', mode:'insensitive' } }] }, select:{ id:true, name:true, address:true } });
console.log('— Locations Mandelieu/cannes —', JSON.stringify(loc));
await prisma.$disconnect();
