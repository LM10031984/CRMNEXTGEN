const { prisma } = await import('@qualiof/db');
const s = await prisma.trainingSession.findMany({ where:{ startDate:{ gte:new Date('2025-03-01') } },
  select:{ endDate:true, startDate:true, trainers:{ select:{ isPrimary:true, person:{ select:{ firstName:true, lastName:true, email:true } } } } } });
const NOW=new Date('2026-06-25');
const dist:Record<string,number>={};
let future=0;
for (const x of s){ const f=x.trainers.find(t=>t.isPrimary)?.person??x.trainers[0]?.person; const k=f?`${f.firstName} ${f.lastName} <${f.email??'sans email'}>`:'(aucun)'; dist[k]=(dist[k]||0)+1; if((x.endDate??x.startDate)>=NOW)future++; }
console.log('Répartition formateur principal (70 sessions) :');
for (const [k,v] of Object.entries(dist).sort((a,b)=>b[1]-a[1])) console.log(`  ${v}×  ${k}`);
console.log('Sessions à venir/en cours :', future);
await prisma.$disconnect();
