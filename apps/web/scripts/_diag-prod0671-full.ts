const { prisma } = await import('@qualiof/db');
const p: any = await prisma.trainingProduct.findFirst({
  where: { code: 'PROD-0671' },
  include: { modules: { orderBy: { order: 'asc' } } },
});
if (!p) { console.log('PROD-0671 introuvable'); process.exit(0); }
console.log('=== PROD-0671 ===');
console.log('title         :', p.title);
console.log('durationHours :', p.durationHours);
console.log('priceHT       :', p.priceHT);
console.log('programMd     :', p.programMd ? p.programMd.length+' chars' : 'VIDE');
console.log('derouleJson   :', p.derouleJson ? 'présent' : 'VIDE/null');
console.log('modules       :', p.modules.length);
for (const m of p.modules) console.log(`   - [${m.order}] ${m.title} | ${m.durationMin ?? '?'}min | contentMd=${m.contentMd? m.contentMd.length+'c':'—'}`);
// liste tous les champs scalaires non vides du produit
console.log('\n--- champs produit renseignés ---');
for (const [k,v] of Object.entries(p)) {
  if (k==='modules'||k==='programMd'||k==='derouleJson') continue;
  if (v===null||v===undefined||v==='') continue;
  const val = typeof v==='string' ? (v.length>60? v.slice(0,60)+'…':v) : (v instanceof Date? v.toISOString().slice(0,10): JSON.stringify(v));
  console.log(`   ${k}: ${val}`);
}
console.log('\n--- programMd (400 chars) ---');
console.log((p.programMd ?? '').slice(0,400));
await prisma.$disconnect();
