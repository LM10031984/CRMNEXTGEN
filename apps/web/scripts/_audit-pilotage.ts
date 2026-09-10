/** Audit du pilotage : de quoi sont faits le réalisé, le prévisionnel, l'atterrissage. */
const { prisma } = await import('@qualiof/db');
const YEAR = 2026;
const now = new Date();
const start = new Date(Date.UTC(YEAR, 0, 1));
const end = new Date(Date.UTC(YEAR + 1, 0, 1));
const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const tenant: any = await prisma.tenant.findFirst({ select: { id: true, name: true } });
const t = tenant.id;

// Exactement les requêtes de pilotage-stats.ts
const [realise, prev] = await Promise.all([
  prisma.sessionParticipant.findMany({
    where: { session: { tenantId: t, startDate: { gte: start, lt: end }, endDate: { lt: now } } },
    select: { priceHT: true, enrollmentStatus: true, session: { select: { code: true, name: true, startDate: true, endDate: true, status: true } } },
  }),
  prisma.sessionParticipant.findMany({
    where: { session: { tenantId: t, startDate: { gte: start, lt: end }, endDate: { gte: now } } },
    select: { priceHT: true, enrollmentStatus: true, session: { select: { code: true, name: true, startDate: true, endDate: true, status: true } } },
  }),
]);
const somme = (rows: any[]) => rows.reduce((a, r) => a + Number(r.priceHT ?? 0), 0);
console.log(`Tenant : ${tenant.name} · année ${YEAR} · maintenant = ${now.toISOString().slice(0, 10)}\n`);
console.log(`CA réalisé YTD      : ${eur(somme(realise))}  (${realise.length} inscrits, sessions terminées)`);
console.log(`Prévisionnel        : ${eur(somme(prev))}  (${prev.length} inscrits, sessions non terminées)`);
console.log(`ATTERRISSAGE        : ${eur(somme(realise) + somme(prev))}\n`);

// 1. Sessions EN COURS (commencées mais pas finies) dans le prévisionnel
const enCours = prev.filter((r: any) => r.session.startDate < now);
const aVenir = prev.filter((r: any) => r.session.startDate >= now);
console.log(`  dont sessions EN COURS (déjà commencées) : ${eur(somme(enCours))} — ${new Set(enCours.map((r: any) => r.session.code)).size} sessions`);
console.log(`  dont sessions À VENIR                    : ${eur(somme(aVenir))} — ${new Set(aVenir.map((r: any) => r.session.code)).size} sessions\n`);

// 2. Statuts d'inscription comptés
const parStatut = new Map<string, { n: number; ca: number }>();
for (const r of [...realise, ...prev] as any[]) {
  const k = String(r.enrollmentStatus);
  const cur = parStatut.get(k) ?? { n: 0, ca: 0 };
  parStatut.set(k, { n: cur.n + 1, ca: cur.ca + Number(r.priceHT ?? 0) });
}
console.log('Statuts d’inscription comptés dans le total :');
for (const [k, v] of [...parStatut.entries()].sort((a, b) => b[1].ca - a[1].ca)) console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(3)} inscrits · ${eur(v.ca)}`);

// 3. Statuts de session comptés
const parSessionStatut = new Map<string, { s: Set<string>; ca: number }>();
for (const r of [...realise, ...prev] as any[]) {
  const k = String(r.session.status);
  const cur = parSessionStatut.get(k) ?? { s: new Set<string>(), ca: 0 };
  cur.s.add(r.session.code); cur.ca += Number(r.priceHT ?? 0);
  parSessionStatut.set(k, cur);
}
console.log('\nStatuts de SESSION comptés dans le total :');
for (const [k, v] of [...parSessionStatut.entries()].sort((a, b) => b[1].ca - a[1].ca)) console.log(`  ${k.padEnd(12)} ${String(v.s.size).padStart(3)} sessions · ${eur(v.ca)}`);

// 4. Croisement bucket × statut de session
const croise = (rows: any[], label: string) => {
  const m = new Map<string, { s: Set<string>; ca: number; n: number }>();
  for (const r of rows) {
    const k = String(r.session.status);
    const cur = m.get(k) ?? { s: new Set<string>(), ca: 0, n: 0 };
    cur.s.add(r.session.code); cur.ca += Number(r.priceHT ?? 0); cur.n++;
    m.set(k, cur);
  }
  console.log(`\n${label} :`);
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1].ca - a[1].ca)) console.log(`  ${k.padEnd(11)} ${String(v.s.size).padStart(2)} sessions · ${String(v.n).padStart(3)} inscrits · ${eur(v.ca)}`);
};
croise(realise, 'RÉALISÉ (sessions terminées) par statut de session');
croise(prev, 'PRÉVISIONNEL par statut de session');

// 5. Les sessions DRAFT comptées comme du CA
const draft = [...realise, ...prev].filter((r: any) => r.session.status === 'DRAFT');
const parSession = new Map<string, { nom: string; ca: number; n: number; d: string }>();
for (const r of draft as any[]) {
  const cur = parSession.get(r.session.code) ?? { nom: r.session.name ?? '', ca: 0, n: 0, d: r.session.startDate.toISOString().slice(0, 10) };
  cur.ca += Number(r.priceHT ?? 0); cur.n++;
  parSession.set(r.session.code, cur);
}
console.log('\n⚠ Sessions en BROUILLON comptées dans l’atterrissage :');
for (const [code, v] of [...parSession.entries()].sort((a, b) => b[1].ca - a[1].ca)) console.log(`  ${code} ${v.d} · ${String(v.n).padStart(2)} inscrits · ${eur(v.ca)} · ${v.nom.slice(0, 45)}`);

// 6. Inscrits annulés / no-show quelque part ?
const annules = await prisma.sessionParticipant.count({ where: { session: { tenantId: t, startDate: { gte: start, lt: end } }, enrollmentStatus: { in: ['CANCELLED', 'NO_SHOW'] as any } } });
const sessAnnulees = await prisma.trainingSession.count({ where: { tenantId: t, startDate: { gte: start, lt: end }, status: 'CANCELLED' as any } });
console.log(`\nInscrits CANCELLED/NO_SHOW sur ${YEAR} : ${annules} · Sessions CANCELLED : ${sessAnnulees} (si >0, elles sont comptées aussi)`);

// 7. Inscrits à 0 €
const zero = [...realise, ...prev].filter((r: any) => Number(r.priceHT ?? 0) === 0);
console.log(`Inscrits comptés à 0 € : ${zero.length} — sessions ${[...new Set(zero.map((r: any) => r.session.code))].slice(0, 10).join(', ') || '—'}`);

// 8. Sessions à cheval sur deux années
const cheval = await prisma.trainingSession.findMany({ where: { tenantId: t, startDate: { gte: start, lt: end }, endDate: { gte: end } }, select: { code: true, startDate: true, endDate: true } });
console.log(`Sessions commencées en ${YEAR} et finissant après : ${cheval.length}${cheval.length ? ' → ' + cheval.map((c: any) => c.code).join(', ') : ''}`);

// 9. Facturation comparée
const [facture, encaisse] = await Promise.all([
  prisma.invoice.aggregate({ where: { tenantId: t, issueDate: { gte: start, lt: end }, status: { in: ['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'] as any } }, _sum: { amountHT: true } }),
  prisma.invoice.aggregate({ where: { tenantId: t, issueDate: { gte: start, lt: end } }, _sum: { amountPaid: true } }),
]);
console.log(`\nFacturation ${YEAR} : facturé HT ${eur(Number(facture._sum?.amountHT ?? 0))} · encaissé ${eur(Number(encaisse._sum?.amountPaid ?? 0))}`);
const obj = await prisma.revenueTarget.findFirst({ where: { tenantId: t, year: YEAR }, select: { amountHT: true } });
console.log(`Objectif ${YEAR} : ${obj ? eur(obj.amountHT) : 'AUCUN'}`);
await prisma.$disconnect();
