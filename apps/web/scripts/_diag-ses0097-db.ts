const { prisma } = await import('@qualiof/db');
const s: any = await prisma.trainingSession.findFirst({
  where: { code: 'SES-0097' },
  select: { id:true, code:true, name:true, status:true, startDate:true, endDate:true,
    product: { select: { code:true, title:true, durationHours:true, priceHT:true } },
    location: { select: { name:true, address:true } },
    trainers: { select: { isPrimary:true, person:{ select:{ firstName:true, lastName:true } } } },
    participants: { select: { enrollmentStatus:true, priceHT:true, person:{ select:{ firstName:true, lastName:true } } } } },
});
console.log('code   :', s.code, '| name:', s.name, '| status:', s.status);
console.log('dates  :', s.startDate?.toISOString().slice(0,10), '→', s.endDate?.toISOString().slice(0,10));
console.log('produit:', s.product ? `${s.product.code} ${s.product.title} (${s.product.durationHours}h, ${s.product.priceHT}€)` : 'AUCUN');
console.log('lieu   :', s.location ? `${s.location.name} ${s.location.address??''}` : 'AUCUN');
console.log('formateurs :', s.trainers.map((t:any)=>`${t.person.firstName} ${t.person.lastName}${t.isPrimary?' (principal)':''}`).join(', ') || 'AUCUN');
console.log('participants:', s.participants.length);
for (const p of s.participants) console.log(`  - ${p.person.firstName} ${p.person.lastName} | ${p.enrollmentStatus} | ${p.priceHT??0}€`);
const tot = s.participants.reduce((a:number,p:any)=>a+(p.priceHT||0),0);
console.log('total prix participants :', tot, '€');
await prisma.$disconnect();
