/**
 * Test rapide de rendu des 5 templates closure SANS BullMQ/Ollama/DB.
 *
 * Génère les 5 PDFs avec un ClosureContext mock + contenu stub, en passant
 * directement par renderHtmlToPdf (Gotenberg). Permet d'itérer vite sur le
 * style des templates sans déclencher la pipeline complète.
 *
 * Usage : pnpm --filter @qualiof/web exec tsx scripts/closure-render-mock.ts
 * Sortie : /tmp/closure-mock/*.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import type { ClosureContext } from '../src/lib/closure/shared-template';
import { renderAttestationHtml } from '../src/lib/closure/attestation-template';
import { renderCertificatHtml } from '../src/lib/closure/certificat-template';
import { renderQcmHtml } from '../src/lib/closure/qcm-template';
import { renderGrilleObservationHtml } from '../src/lib/closure/grille-observation-template';
import { renderAnalyseBesoinHtml } from '../src/lib/closure/analyse-besoin-template';
import { renderEmargementHtml } from '../src/lib/closure/emargement-template';
import { renderPositionnementHtml } from '../src/lib/closure/positionnement-template';
import { renderSatisfactionChaudHtml } from '../src/lib/closure/satisfaction-chaud-template';
import { renderSatisfactionFroidHtml } from '../src/lib/closure/satisfaction-froid-template';
import { renderDerouleHtml } from '../src/lib/closure/deroule-template';
import {
  stubAnalyseBesoinContent,
  stubGrilleContent,
  stubQcmContent,
  stubPositionnementContent,
  stubSatisfactionChaudContent,
  stubSatisfactionFroidContent,
  stubDerouleContent,
} from '../src/lib/closure/stub-content';

const OUT = '/tmp/closure-mock';

const ctx: ClosureContext = {
  apprenantPrenom: 'Caroline',
  apprenantNom: 'VESCOVI',
  apprenantCivility: 'Mme',
  sessionId: 'mock-session-id',
  sessionCode: 'SES-0010',
  sessionTitle: "Maîtrisez l'IA en 3 jours — formation immobilier",
  sessionStartDate: new Date('2026-04-15'),
  sessionEndDate: new Date('2026-04-17'),
  sessionLocation: 'Vence (06140)',
  sessionTrainers: ['Julien Lafitte'],
  durationHours: 21,
  formationMeta: {
    programmeMd: '# Programme\n\nJour 1 : Introduction à l\'IA\nJour 2 : Outils\nJour 3 : Pratique',
  },
  stagiaireMeta: {
    entreprise: 'AKORIMMO',
    fonction: 'Agent commercial',
    anciennete: '3 ans',
    diplomes: 'Bac+2 immobilier',
    professionalStatus: 'Auto-entrepreneur',
  },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const docs: { name: string; html: string }[] = [
    { name: 'attestation.pdf', html: renderAttestationHtml(ctx) },
    { name: 'certificat.pdf', html: renderCertificatHtml(ctx) },
    { name: 'qcm.pdf', html: renderQcmHtml(ctx, stubQcmContent(ctx)) },
    { name: 'grille_obs.pdf', html: renderGrilleObservationHtml(ctx, stubGrilleContent(ctx)) },
    { name: 'analyse_besoin.pdf', html: renderAnalyseBesoinHtml(ctx, stubAnalyseBesoinContent(ctx)) },
    { name: 'positionnement.pdf', html: renderPositionnementHtml(ctx, stubPositionnementContent(ctx)) },
    { name: 'satisfaction_chaud.pdf', html: renderSatisfactionChaudHtml(ctx, stubSatisfactionChaudContent(ctx)) },
    { name: 'satisfaction_froid.pdf', html: renderSatisfactionFroidHtml(ctx, stubSatisfactionFroidContent(ctx)) },
    { name: 'deroule_peda.pdf', html: renderDerouleHtml(ctx, stubDerouleContent(ctx)) },
    { name: 'emargement.pdf', html: renderEmargementHtml(ctx) },
  ];

  for (const { name, html } of docs) {
    const pdf = await renderHtmlToPdfWeasy(html);
    const p = path.join(OUT, name);
    fs.writeFileSync(p, pdf);
    console.log(`  ✓ ${name.padEnd(22)} → ${p} (${(pdf.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\nOuvre les PDFs avec : open ${OUT}/*.pdf`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
