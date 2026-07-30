/**
 * Export PDF du registre des traitements RGPD (art. 30) + 7 fiches DPA.
 *
 * Lit `docs/rgpd/REGISTRE-TRAITEMENTS.md` puis concatène les fiches
 * `docs/rgpd/dpa/*.md` (ordre alphabétique, saut de page entre fiches),
 * convertit en HTML via `marked`, enveloppe dans un gabarit A4 sobre et
 * rend via `renderHtmlToPdf` (pipeline interne Gotenberg — AUCUNE nouvelle
 * lib PDF). Footer in-body `position:fixed bottom:0` 11pt (convention
 * projet — JAMAIS le footer Gotenberg natif). Sortie :
 * `docs/rgpd/REGISTRE-TRAITEMENTS.pdf` (versionné, imprimable pour un
 * auditeur Qualiopi/CNIL — D-15).
 *
 * Usage : cd apps/web && dotenv -e ../../.env -- tsx scripts/_export-registre-rgpd.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const { renderHtmlToPdf } = await import('../src/lib/pdf-render');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RGPD_DIR = path.join(REPO_ROOT, 'docs/rgpd');
const DPA_DIR = path.join(RGPD_DIR, 'dpa');
const OUT_PDF = path.join(RGPD_DIR, 'REGISTRE-TRAITEMENTS.pdf');

const registreMd = fs.readFileSync(path.join(RGPD_DIR, 'REGISTRE-TRAITEMENTS.md'), 'utf-8');

const dpaFiles = fs
  .readdirSync(DPA_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort(); // ordre alphabétique

const registreHtml = await marked.parse(registreMd);
const dpaSections = await Promise.all(
  dpaFiles.map(async (f) => {
    const html = await marked.parse(fs.readFileSync(path.join(DPA_DIR, f), 'utf-8'));
    // Saut de page CSS entre fiches (page-break-before: always)
    return `<section class="dpa-fiche" style="page-break-before: always;">${html}</section>`;
  }),
);

const generatedAt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Europe/Paris',
}).format(new Date());

// Footer in-body position:fixed bottom:0 11pt — convention projet
// (JAMAIS le footer Gotenberg natif, illisible après downscale Chromium).
const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 16mm 14mm 24mm 14mm; }
  body {
    font-family: Calibri, Helvetica, Arial, sans-serif;
    font-size: 10.5pt; color: #1F2937; line-height: 1.45; margin: 0;
  }
  h1 { font-size: 17pt; color: #00527A; border-bottom: 2px solid #00527A; padding-bottom: 4px; }
  h2 { font-size: 13pt; color: #00527A; margin-top: 18px; }
  h3 { font-size: 11.5pt; color: #0F172A; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #94A3B8; padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: #EFF6FF; color: #0F172A; }
  blockquote { border-left: 3px solid #94A3B8; margin: 8px 0; padding: 2px 12px; color: #475569; }
  code { font-family: Menlo, monospace; font-size: 9pt; background: #F1F5F9; padding: 0 3px; }
  a { color: #00527A; text-decoration: none; }
  hr { border: none; border-top: 1px solid #CBD5E1; margin: 14px 0; }
  ul, ol { padding-left: 20px; }
  .footer-inbody {
    position: fixed; bottom: 0; left: 0; right: 0;
    font-size: 11pt; color: #475569; text-align: center;
    border-top: 1px solid #94A3B8; padding-top: 4px;
  }
</style>
</head>
<body>
  <div class="footer-inbody">Start Academy — Registre des traitements — généré le ${generatedAt}</div>
  ${registreHtml}
  ${dpaSections.join('\n')}
</body>
</html>`;

console.log(
  `[export-registre-rgpd] registre + ${dpaFiles.length} fiches DPA (${dpaFiles.join(', ')})`,
);

const pdf = await renderHtmlToPdf(html);

if (!pdf.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
  throw new Error('Le rendu ne commence pas par %PDF- — export invalide');
}

fs.writeFileSync(OUT_PDF, pdf);
console.log(`[export-registre-rgpd] écrit ${OUT_PDF} (${(pdf.length / 1024).toFixed(1)} Ko)`);
