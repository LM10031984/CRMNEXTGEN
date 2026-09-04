/**
 * APERÇU NON DESTRUCTIF de la feuille d'émargement et de la ligne « Horaires »
 * de la convocation, à partir des créneaux RÉELS d'une session en base.
 * N'écrit rien : rend le HTML et en extrait les horaires.
 *
 * Usage : SES=SES-0111 node --import tsx --env-file=../../.env scripts/_preview-emargement-horaires.ts
 */
const { prisma } = await import('@qualiof/db');
const { renderEmargementHtml } = await import('../src/lib/closure/emargement-template');
const { resumeHorairesSession } = await import('../src/lib/sessions/horaires');

const SES = process.env.SES ?? 'SES-0111';
const session = await prisma.trainingSession.findFirstOrThrow({
  where: { code: SES },
  select: {
    code: true, name: true, startDate: true, endDate: true, tenantId: true,
    product: { select: { title: true, durationHours: true } },
    trainers: { select: { isPrimary: true, person: { select: { firstName: true, lastName: true } } } },
    slots: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
  },
});

const primary = session.trainers.find((t) => t.isPrimary) ?? session.trainers[0];
const html = renderEmargementHtml({
  apprenantPrenom: 'Prénom',
  apprenantNom: 'TEST',
  apprenantCivility: null,
  sessionId: 'preview',
  sessionCode: session.code,
  sessionTitle: session.product.title,
  sessionStartDate: session.startDate,
  sessionEndDate: session.endDate,
  sessionLocation: 'Lieu de test, 06000 Nice',
  sessionLocationCity: 'Nice',
  sessionTrainers: primary ? [`${primary.person.firstName} ${primary.person.lastName}`] : [],
  sessionSlots: session.slots,
  durationHours: session.product.durationHours,
  tenantId: session.tenantId,
});

console.log(`=== ${session.code} — ${session.slots.length} créneaux en base ===`);
for (const s of session.slots) console.log(`  ${s.date.toISOString().slice(0, 10)} ${s.halfDay.padEnd(9)} ${s.startTime}–${s.endTime}`);

console.log('\n=== Tableau rendu dans la feuille d’émargement ===');
const thead = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? '';
for (const th of thead.matchAll(/<span[^>]*>([^<]+)<\/span>/g)) console.log(`  colonne : ${th[1]}`);
// Le premier <tbody> est celui de l'encart info : on prend celui qui suit le <thead>.
const apresThead = html.slice(html.indexOf('</thead>'));
const tbody = apresThead.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
for (const tr of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
  const cells = [...tr[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
    c[1]!.replace(/<[^>]+>/g, '').trim() || '(case vide)',
  );
  console.log(`  ${cells.join('  |  ')}`);
}

console.log('\n=== Ligne « Horaires » de la convocation ===');
console.log('  ' + (resumeHorairesSession(session.slots) ?? '(fallback générique 9h00 – 17h00)'));

console.log('\n=== Contrôle : mentions de la norme maison encore présentes ? ===');
for (const faux of ['9h00–13h00', '14h00–18h00']) {
  console.log(`  « ${faux} » → ${html.includes(faux) ? '❌ PRÉSENT' : '✓ absent'}`);
}
await prisma.$disconnect();
