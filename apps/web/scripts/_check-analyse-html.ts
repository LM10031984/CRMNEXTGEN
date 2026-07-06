const { prisma } = await import('@qualiof/db');
const { buildClosureContextForParticipant } = await import('../src/lib/closure/build-context');
const { renderAnalyseBesoinHtml } = await import('../src/lib/closure/analyse-besoin-template');
const sp = await prisma.sessionParticipant.findFirstOrThrow({
  where: { person: { firstName: { contains: 'Kristin', mode: 'insensitive' }, lastName: { contains: 'King', mode: 'insensitive' } } },
  select: { id: true, session: { select: { tenantId: true } } },
});
const ctx = await buildClosureContextForParticipant(sp.id, sp.session.tenantId);
const html = renderAnalyseBesoinHtml(ctx!, { contexte_professionnel: 'x', objectifs_stagiaire: ['y'] });
const checks = ['Formation envisagée', 'Date(s)', 'Lieu :', 'Durée', '&#9744; OUI', '&#9745; NON', 'info-box'];
for (const c of checks) console.log(`${html.includes(c) ? '✓ PRÉSENT' : '✗ absent  '}  "${c}"`);
await prisma.$disconnect();
