/**
 * Preuve du lot B — spec signature 2026-09-04 §5.
 *
 * Déroule la chaîne SANS RÉSEAU (provider dry-run) et vérifie le seul point
 * réellement risqué de la décision D-7 : **les ancres blanches survivent-elles
 * au rendu WeasyPrint et restent-elles extractibles du PDF ?** Si le texte
 * n'est pas extractible, DocuSeal ne crée aucun champ — sans erreur, l'envoi
 * part et le signataire n'a rien à signer.
 *
 *   pnpm -F @qualiof/web exec dotenv -e ../../.env -e ../../.env.local -- \
 *     tsx scripts/proof-signature-lot-b.ts
 */

import { writeFileSync } from 'node:fs';
import { renderConventionHtml, type ConventionData } from '../src/lib/convention-template';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import { extractTextFromPdf } from '../src/lib/pdf-extract';
import { resolveOfConfig } from '../src/lib/of-config';
import { createDryRunProvider } from '../src/lib/signature/dry-run';
import {
  SIGNATURE_ROLES,
  SIGNATURE_ZONE_HEIGHT_PT,
  SIGNATURE_ZONE_WIDTH_PT,
  signatureTag,
} from '../src/lib/signature/text-tags';

const OUT = process.env.PROOF_OUT ?? '/tmp/preuve-signature-lot-b';

function conventionData(signatureTags: boolean): ConventionData {
  return {
    beneficiaireRaisonSociale: 'EXPERTA',
    beneficiaireSiret: '81234567800042',
    beneficiaireSiren: '812345678',
    beneficiaireRcsVille: 'Nice',
    beneficiaireRepresentantNom: 'Gilles BLANCHON',
    stagiaires: [{ prenom: 'Sophie', nom: 'Augustin', email: 'sophie@experta.fr' }],
    sessionStartDate: new Date('2026-10-07T00:00:00Z'),
    sessionEndDate: new Date('2026-12-16T00:00:00Z'),
    sessionLieu: "EXPERTA, 5 place de l'Ile de Beauté, 06300 Nice",
    conventionDate: new Date('2026-09-16T00:00:00Z'),
    produitTitre: "Intégrer l'IA dans son entreprise",
    produitDureeHeures: 88,
    produitObjectifs: ['Comprendre les usages IA du métier'],
    produitProgrammeMd: '## Module 1\n\nPrise en main des outils.',
    produitTrainerProfile: null,
    produitPriceHTPerStagiaire: 2500,
    signatureTags,
  };
}

let echecs = 0;
function verifier(libelle: string, ok: boolean, detail = ''): void {
  if (!ok) echecs++;
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} │ ${libelle}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const of = resolveOfConfig(null);

  console.log('\n=== 1. Rendu WeasyPrint : les ancres survivent-elles au PDF ? ===\n');

  const pdfAncres = await renderHtmlToPdfWeasy(renderConventionHtml(conventionData(true), of));
  const pdfNormal = await renderHtmlToPdfWeasy(renderConventionHtml(conventionData(false), of));
  writeFileSync(`${OUT}-convention-ancres.pdf`, pdfAncres);
  writeFileSync(`${OUT}-convention-sans-ancres.pdf`, pdfNormal);

  const texte = (await extractTextFromPdf(pdfAncres)).text;
  const dimensions = { width: SIGNATURE_ZONE_WIDTH_PT, height: SIGNATURE_ZONE_HEIGHT_PT };
  const tagClient = signatureTag({
    name: 'Signature client',
    role: SIGNATURE_ROLES.CLIENT,
    type: 'signature',
    ...dimensions,
  });
  const tagOf = signatureTag({
    name: 'Signature organisme de formation',
    role: SIGNATURE_ROLES.OF,
    type: 'signature',
    ...dimensions,
  });

  // Le texte extrait peut porter des césures d'espaces selon le moteur : on
  // compare sur une forme normalisée sans blancs, ce qui reste strict sur les
  // caractères qui font la grammaire du tag.
  const compact = texte.replace(/\s+/g, '');
  verifier('ancre CLIENT extractible du PDF', compact.includes(tagClient.replace(/\s+/g, '')));
  verifier('ancre OF extractible du PDF', compact.includes(tagOf.replace(/\s+/g, '')));
  verifier(
    'aucune ancre dans le PDF sans mode e-signature',
    !(await extractTextFromPdf(pdfNormal)).text.includes('{{'),
  );
  verifier(
    'le PDF avec ancres reste un PDF valide et non vide',
    pdfAncres.subarray(0, 4).toString() === '%PDF' && pdfAncres.length > 10_000,
    `${Math.round(pdfAncres.length / 1024)} Ko`,
  );

  console.log('\n=== 2. Chaîne complète en provider dry-run (zéro réseau) ===\n');

  const p = createDryRunProvider();
  const envoi = await p.createRequest({
    name: 'SES-PREUVE — Convention EXPERTA',
    externalId: 'sr-preuve-1',
    documents: [{ name: 'convention', pdf: pdfAncres }],
    signers: [
      { role: SIGNATURE_ROLES.CLIENT, name: 'Gilles BLANCHON', email: 'gilles@experta.fr', order: 0 },
      { role: SIGNATURE_ROLES.OF, name: 'Laurent MARX', email: 'laurent@start-academy.fr', order: 1 },
    ],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  });

  verifier('envoi créé', envoi.providerId.startsWith('dry-run-'), envoi.providerId);
  verifier('2 signataires avec lien de signature', envoi.signers.every((s) => !!s.signUrl));
  verifier('statut initial « en attente »', (await p.getRequest(envoi.providerId)).status === 'SENT');

  let refus = '';
  try {
    await p.downloadSignedDocument(envoi.providerId);
  } catch (e) {
    refus = (e as Error).message;
  }
  verifier('refus de livrer un signé avant signature', refus.includes('pas encore'));

  p.simulateCompletion(envoi.providerId);
  const etat = await p.getRequest(envoi.providerId);
  verifier('après signature : statut DONE', etat.status === 'DONE');
  verifier('date de complétion mémorisée', etat.completedAt !== null);

  const signes = await p.downloadSignedDocument(envoi.providerId);
  const certificat = await p.downloadAuditTrail(envoi.providerId);
  writeFileSync(`${OUT}-dryrun-signe.pdf`, signes[0]!.pdf);
  writeFileSync(`${OUT}-dryrun-certificat.pdf`, certificat);
  verifier('PDF signé récupéré', signes[0]!.pdf.subarray(0, 4).toString() === '%PDF');
  verifier('certificat de signature récupéré', certificat.subarray(0, 4).toString() === '%PDF');

  const ev = p.parseEvent(
    JSON.stringify({ event_type: 'submission.completed', data: { id: envoi.providerId } }),
  );
  verifier('webhook simulé → request.completed', ev.type === 'request.completed');

  console.log(`\nFichiers écrits sous ${OUT}-*.pdf`);
  console.log(echecs === 0 ? '\n✅ Preuve lot B (dry-run) : tout vert\n' : `\n❌ ${echecs} échec(s)\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
