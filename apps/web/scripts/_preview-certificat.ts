/**
 * APERÇU NON DESTRUCTIF du certificat de réalisation avec le nouveau template
 * (tampon en superposition + signature solidaire page 1).
 * N'écrit RIEN en DB / MinIO / Drive — rend juste un PDF dans /tmp.
 *
 * Usage : SES=SES-XXXX tsx scripts/_preview-certificat.ts   (sinon session au hasard)
 */
import fs from 'node:fs';

const { prisma } = await import('@qualiof/db');
const { buildClosureContextForParticipant } = await import('../src/lib/closure/build-context');
const { renderCertificatHtml } = await import('../src/lib/closure/certificat-template');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

const SES = process.env.SES;

// Session cible : celle demandée, sinon une session TERMINÉE au hasard ayant
// déjà au moins un certificat généré (pour rester sur un cas réel de "remplacement").
let session;
if (SES) {
  session = await prisma.trainingSession.findFirstOrThrow({
    where: { code: SES },
    select: { id: true, code: true, tenantId: true },
  });
} else {
  const withCert = await prisma.document.findFirst({
    where: { type: 'CERTIFICAT_REALISATION' as never },
    select: { session: { select: { id: true, code: true, tenantId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!withCert?.session) throw new Error('Aucune session avec certificat trouvée.');
  session = withCert.session;
}

const part = await prisma.sessionParticipant.findFirst({
  where: { sessionId: session.id, enrollmentStatus: { in: ['ATTENDED', 'CONFIRMED'] } },
  select: { id: true, person: { select: { firstName: true, lastName: true } } },
});
if (!part) throw new Error(`Session ${session.code} : aucun participant ATTENDED/CONFIRMED.`);

const ctx = await buildClosureContextForParticipant(part.id, session.tenantId);
if (!ctx) throw new Error('Contexte closure introuvable.');

const html = renderCertificatHtml(ctx);
const pdf = await renderHtmlToPdfWeasy(html);

const who = `${part.person.firstName}-${part.person.lastName}`.replace(/\s+/g, '_');
const out = `/tmp/PREVIEW-certificat-${session.code}-${who}.pdf`;
fs.writeFileSync(out, pdf);
console.log(`✓ Aperçu rendu (rien écrasé) : ${out}`);
console.log(`  Session ${session.code} · ${part.person.firstName} ${part.person.lastName}`);

await prisma.$disconnect();
