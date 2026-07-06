import fs from 'node:fs';
const { prisma } = await import('@qualiof/db');
const { buildClosureContextForParticipant } = await import('../src/lib/closure/build-context');
const { renderDerouleHtml } = await import('../src/lib/closure/deroule-template');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

const derouleJson = JSON.parse(fs.readFileSync('/tmp/deroule-tracfin.json', 'utf8'));
const part = await prisma.sessionParticipant.findFirst({
  where: { session: { code: 'SES-0086' } },
  select: { id: true, session: { select: { tenantId: true } } },
});
const ctx = await buildClosureContextForParticipant(part!.id, part!.session.tenantId);
console.log('Formateur(s) ctx :', (ctx as any)?.sessionTrainers);
const html = renderDerouleHtml(ctx as any, derouleJson);
const pdf = await renderHtmlToPdfWeasy(html);
fs.writeFileSync('/tmp/PREVIEW-deroule-SESSION-tracfin.pdf', pdf);
console.log('Aperçu session : /tmp/PREVIEW-deroule-SESSION-tracfin.pdf');
await prisma.$disconnect();
