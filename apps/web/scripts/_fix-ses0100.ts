/** SES-0100 — correction produit + prix + dates. DRY-RUN par défaut ; WRITE=1 pour écrire. */
const { prisma } = await import('@qualiof/db');
const WRITE = process.env.WRITE === '1';
const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const s: any = await prisma.trainingSession.findFirst({
  where: { code: 'SES-0100' },
  select: {
    id: true, tenantId: true, code: true, name: true, status: true, startDate: true, endDate: true, productId: true,
    product: { select: { code: true, title: true, durationHours: true, priceHT: true } },
    participants: { select: { id: true, priceHT: true, person: { select: { firstName: true, lastName: true } }, invoices: { select: { number: true } } } },
    slots: { select: { id: true } },
    trainers: { select: { id: true } },
  },
});
const cible: any = await prisma.trainingProduct.findFirst({
  where: { tenantId: s.tenantId, code: 'PROD-0058' },
  select: { id: true, code: true, title: true, durationHours: true, priceHT: true },
});

// ── Dépendances : ce que la correction pourrait casser ────────────────────
const pids = s.participants.map((p: any) => p.id);
const [docs, assets, factures, dossiers, events] = await Promise.all([
  prisma.document.count({ where: { tenantId: s.tenantId, OR: [{ entityType: 'participant', entityId: { in: pids } }, { entityType: 'session', entityId: s.id }] } }),
  prisma.pedagogicalAsset.count({ where: { tenantId: s.tenantId, sessionId: s.id } }),
  prisma.invoice.count({ where: { tenantId: s.tenantId, OR: [{ sessionId: s.id }, { participantId: { in: pids } }] } }),
  prisma.opcoSubmission.count({ where: { participantId: { in: pids } } }),
  prisma.trainingSession.findFirst({ where: { id: s.id }, select: { calendarEventIds: true } }).catch(() => null),
]);

console.log(`═══ SES-0100 — ${WRITE ? 'ÉCRITURE' : 'DRY-RUN'}\n`);
console.log('Dépendances :');
console.log(`  documents générés     : ${docs}`);
console.log(`  supports pédagogiques : ${assets}`);
console.log(`  factures liées        : ${factures}`);
console.log(`  dossiers OPCO         : ${dossiers}`);
console.log(`  événements calendrier : ${events?.calendarEventIds ? JSON.stringify(events.calendarEventIds).slice(0, 60) : 'aucun champ / vide'}`);
console.log(`  créneaux              : ${s.slots.length} · formateurs : ${s.trainers.length}`);

const JOUR = new Date(Date.UTC(2026, 6, 27)); // 27/07/2026
console.log('\nChangements prévus :');
console.log(`  produit  : ${s.product.code} (${s.product.durationHours} h, ${eur(Number(s.product.priceHT))}) → ${cible.code} (${cible.durationHours} h, ${eur(Number(cible.priceHT))})`);
console.log(`  nom      : « ${s.name} »`);
console.log(`             → « ${cible.title} »`);
console.log(`  dates    : ${s.startDate.toISOString().slice(0,10)} → ${s.endDate.toISOString().slice(0,10)}  devient  ${JOUR.toISOString().slice(0,10)} (journée unique)`);
const total = s.participants.reduce((a: number, p: any) => a + Number(p.priceHT ?? 0), 0);
console.log(`  prix     : ${s.participants.length} inscrits à ${eur(Number(s.participants[0]?.priceHT ?? 0))} (${eur(total)}) → ${eur(336)} chacun (${eur(336 * s.participants.length)})`);
console.log(`  effet pilotage : réalisé 2026 −${eur(total - 336 * s.participants.length)}`);

// Sauvegarde avant écriture
const backup = { session: { id: s.id, code: s.code, name: s.name, productId: s.productId, startDate: s.startDate, endDate: s.endDate }, participants: s.participants.map((p: any) => ({ id: p.id, priceHT: Number(p.priceHT), nom: `${p.person.firstName} ${p.person.lastName}` })) };
const fs = await import('node:fs');
fs.writeFileSync('/tmp/backup-ses0100.json', JSON.stringify(backup, null, 2));
console.log('\nSauvegarde de l\'état actuel : /tmp/backup-ses0100.json');

if (!WRITE) { console.log('\n(DRY-RUN — rien écrit. WRITE=1 pour appliquer.)'); await prisma.$disconnect(); process.exit(0); }

await prisma.$transaction([
  prisma.trainingSession.update({ where: { id: s.id }, data: { productId: cible.id, name: cible.title, startDate: JOUR, endDate: JOUR } }),
  prisma.sessionParticipant.updateMany({ where: { sessionId: s.id }, data: { priceHT: 336 } }),
]);
const apres: any = await prisma.trainingSession.findFirst({
  where: { id: s.id },
  select: { name: true, startDate: true, endDate: true, product: { select: { code: true, durationHours: true } }, participants: { select: { priceHT: true } } },
});
console.log('\n✅ Écrit. Relecture :');
console.log(`  ${apres.product.code} · ${apres.product.durationHours} h · ${apres.startDate.toISOString().slice(0,10)} → ${apres.endDate.toISOString().slice(0,10)}`);
console.log(`  ${apres.participants.length} inscrits · total ${eur(apres.participants.reduce((a: number, p: any) => a + Number(p.priceHT ?? 0), 0))}`);
console.log(`  nom : « ${apres.name} »`);
await prisma.$disconnect();
