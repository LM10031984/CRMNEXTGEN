/**
 * Envoi TÉMOIN de l'email « fin de formation » (attestation + facture) sur une
 * adresse de test — jamais sur celle du stagiaire.
 *
 * Contexte 04/09/2026 : Laurent veut voir le mail que recevra un stagiaire à la
 * fin d'une formation avant d'automatiser l'envoi. On prend un stagiaire RÉEL
 * qui a déjà une attestation (Document ATTESTATION_FIN) et une facture avec PDF,
 * on rend le template `mailer-templates/fin-formation.ts`, on joint les 2 PDF
 * et on envoie via `sendMail` (chokepoint fail-closed, catégorie
 * `internal_notification` — c'est un test interne, la catégorie stagiaire
 * n'existe pas encore).
 *
 * Usage (depuis apps/web, sur le Mac) :
 *   pnpm exec dotenv -e ../../.env.local -e ../../.env -- tsx scripts/_test-mail-fin-formation.ts
 *   … --to laurent@start-academy.fr            (défaut)
 *   … --session SES-0097                       (sinon : le plus récent éligible)
 *   … --participant Dupont                     (filtre nom/prénom, insensible à la casse)
 *   … --dry-run                                (rend + écrit /tmp/fin-formation-test.html, n'envoie rien)
 *
 * Garde-fous : refuse tout `--to` qui n'est pas @start-academy.fr ; n'écrit
 * RIEN en base (pas de Document, pas d'AuditLog, pas de statut).
 */

import fs from 'node:fs';
import { prisma } from '@qualiof/db';
import { sendMail } from '../src/lib/mailer';
import { loadOfConfig } from '../src/lib/of-config';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderFinFormationEmail } from '../src/lib/mailer-templates/fin-formation';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes('--dry-run');
const TO = arg('to') ?? 'laurent@start-academy.fr';
const SESSION = arg('session');
const PARTICIPANT = arg('participant');

if (!/@start-academy\.fr$/i.test(TO)) {
  console.error(`✗ Refus : --to doit être une adresse @start-academy.fr (reçu : ${TO})`);
  process.exit(1);
}

function safeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// 1. Candidats : participants avec attestation ET facture PDF
const attestations = await prisma.document.findMany({
  where: {
    type: 'ATTESTATION_FIN',
    participantId: { not: null },
    ...(SESSION ? { session: { code: SESSION } } : {}),
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true, pdfUrl: true, participantId: true, createdAt: true },
  take: 200,
});

let chosen: { attestationKey: string; participantId: string } | null = null;
for (const a of attestations) {
  const p = await prisma.sessionParticipant.findUnique({
    where: { id: a.participantId! },
    select: {
      id: true,
      person: { select: { firstName: true, lastName: true } },
      invoices: { where: { pdfUrl: { not: null }, status: { not: 'CANCELLED' } }, select: { id: true }, take: 1 },
    },
  });
  if (!p || p.invoices.length === 0) continue;
  if (PARTICIPANT) {
    const full = `${p.person.firstName} ${p.person.lastName}`.toLowerCase();
    if (!full.includes(PARTICIPANT.toLowerCase())) continue;
  }
  chosen = { attestationKey: a.pdfUrl, participantId: p.id };
  break;
}

if (!chosen) {
  console.error('✗ Aucun stagiaire avec attestation + facture PDF ne correspond aux critères.');
  await prisma.$disconnect();
  process.exit(1);
}

// 2. Contexte complet
const participant = await prisma.sessionParticipant.findUniqueOrThrow({
  where: { id: chosen.participantId },
  select: {
    id: true,
    person: { select: { firstName: true, lastName: true, email: true } },
    session: {
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        startDate: true,
        endDate: true,
        product: { select: { title: true, durationHours: true } },
      },
    },
    invoices: {
      where: { pdfUrl: { not: null }, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: { number: true, pdfUrl: true, status: true, issueDate: true },
      take: 1,
    },
  },
});
const invoice = participant.invoices[0]!;
const s = participant.session;
const who = `${participant.person.firstName} ${participant.person.lastName}`;

console.log(`Stagiaire     : ${who} (email réel masqué — envoi vers ${TO})`);
console.log(`Session       : ${s.code} — ${s.product.title}`);
console.log(`Attestation   : ${chosen.attestationKey}`);
console.log(`Facture       : ${invoice.number} (${invoice.status}) — ${invoice.pdfUrl}`);

// 3. Pièces jointes
const attestationName = `Attestation-${safeName(who)}-${s.code}.pdf`;
const invoiceName = `Facture-${invoice.number}.pdf`;
const [attestationPdf, invoicePdf] = await Promise.all([
  downloadFile(DOCS_BUCKET, chosen.attestationKey),
  downloadFile(DOCS_BUCKET, invoice.pdfUrl!),
]);
console.log(`PJ            : ${attestationName} (${attestationPdf.length} o), ${invoiceName} (${invoicePdf.length} o)`);

// 4. Rendu
const of = await loadOfConfig(s.tenantId);
const mail = renderFinFormationEmail(
  {
    learnerFirstName: participant.person.firstName,
    learnerLastName: participant.person.lastName,
    trainingTitle: s.product.title,
    sessionCode: s.code,
    startDate: s.startDate,
    endDate: s.endDate,
    durationHours: s.product.durationHours,
    invoiceNumber: invoice.number,
    attachmentNames: [attestationName, invoiceName],
  },
  of,
);
console.log(`Sujet         : ${mail.subject}`);

if (DRY) {
  fs.writeFileSync('/tmp/fin-formation-test.html', mail.html);
  console.log('— dry-run : rien envoyé, aperçu écrit dans /tmp/fin-formation-test.html');
  await prisma.$disconnect();
  process.exit(0);
}

// 5. Envoi (subject préfixé pour ne pas confondre avec un vrai envoi)
const r = await sendMail({
  to: TO,
  subject: `[TEST] ${mail.subject}`,
  html: mail.html,
  text: mail.text,
  attachments: [
    { filename: attestationName, content: attestationPdf, contentType: 'application/pdf' },
    { filename: invoiceName, content: invoicePdf, contentType: 'application/pdf' },
  ],
  context: { tenantId: s.tenantId, category: 'internal_notification', sessionId: s.id },
});

if (r.ok && !r.dryRun) console.log(`✓ Envoyé à ${TO} — messageId ${r.messageId}`);
else if (r.suppressed) console.log('✗ Supprimé par Paramètres → Emails (interrupteur général ou « notifications internes » décoché)');
else if (r.dryRun) console.log('✗ Dry-run mailer : SMTP_HOST vide ou MAIL_DRY_RUN=true dans .env/.env.local');
else console.log(`✗ Échec : ${r.error}`);

await prisma.$disconnect();
