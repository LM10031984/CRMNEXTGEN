const { listSessions, listProducts } = await import('../src/lib/smartof/client');
const { prisma } = await import('@qualiof/db');
const raw: any = await listSessions();
const sessions = (raw.sessions ?? raw.data ?? raw.items ?? []) as any[];
const s = sessions.find(x => x.customId === 'SES-0097');
if (!s) { console.log('SES-0097 introuvable'); process.exit(0); }
console.log('===== SES-0097 (SmartOF, brut) =====');
console.log(JSON.stringify(s, null, 2));
// produit
try {
  const pr: any = await listProducts();
  const prods = (pr.products ?? pr.data ?? pr.items ?? []) as any[];
  const prod = prods.find(p => (p.produitUid||p.id||p.uid) === s.produitFormationViseeUid);
  console.log('\nProduit SmartOF visé :', prod ? (prod.nom||prod.name||prod.title) : '(non résolu '+s.produitFormationViseeUid+')');
} catch(e){ console.log('produit: erreur', (e as any).message); }
// déjà en base QualiOF ?
const inDb = await prisma.trainingSession.findFirst({ where: { code: 'SES-0097' }, select: { id: true, name: true, status: true } });
console.log('\nDans QualiOF (DB) :', inDb ? `OUI (${inDb.status})` : 'NON — pas encore importée');
await prisma.$disconnect();
