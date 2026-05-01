/**
 * Compare le texte extrait :
 *   1. Modèle de référence Start Academy (PDF urssaf-attestation Steve Noel)
 *   2. Modèle de référence Start Academy (DOCX programme)
 *   3. PDF généré par QualiOF Day 3 (/tmp/closure-day2/*.pdf)
 *
 * Utilisé pour vérifier que les libellés, mentions légales et structure
 * correspondent à l'identité Start Academy avant Day 4 (UI).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { extractTextFromPdf } from '../src/lib/pdf-extract';

const REF_DIR = '/Users/laurentmarx/Documents/CRM Next gen';
const OUT_DIR = '/tmp/closure-day2';

async function pdfText(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const r = await extractTextFromPdf(buf);
  if (r.warnings.length > 0) console.log(`  (warnings: ${r.warnings.join(' | ')})`);
  return r.text;
}

function docxText(filePath: string): string {
  // Un .docx est un zip avec word/document.xml. On extrait le XML et on retire
  // toutes les balises pour récupérer le texte brut.
  const xml = execSync(`unzip -p "${filePath}" word/document.xml`).toString('utf-8');
  const text = xml
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<w:tab\/?>/g, '\t')
    .replace(/<w:br\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function summary(label: string, text: string, lines = 30): void {
  console.log(`\n══════════════ ${label} ══════════════`);
  const condensed = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(condensed.slice(0, lines).join('\n'));
  if (condensed.length > lines) console.log(`… (+${condensed.length - lines} lignes)`);
}

async function main() {
  // 1. Référence : attestation URSSAF Steve Noel
  try {
    const ref1 = await pdfText(path.join(REF_DIR, 'urssaf-attestation-formation-2026-Steve Noel.pdf'));
    summary('RÉFÉRENCE — urssaf-attestation Steve Noel.pdf', ref1, 50);
  } catch (e) {
    console.log('Skip réf attestation :', (e as Error).message);
  }

  // 2. Référence : programme DOCX
  try {
    const ref2 = docxText(path.join(REF_DIR, "Programme Maitrisez l'IA en 3 jours.docx"));
    summary('RÉFÉRENCE — Programme Maitrisez IA en 3 jours.docx', ref2, 60);
  } catch (e) {
    console.log('Skip réf programme :', (e as Error).message);
  }

  // 3. Mes PDFs générés
  for (const f of ['attestation', 'certificat', 'qcm', 'grille_obs', 'analyse_besoin']) {
    const p = path.join(OUT_DIR, `${f}.pdf`);
    if (!fs.existsSync(p)) continue;
    try {
      const text = await pdfText(p);
      summary(`QualiOF Day 3 — ${f}.pdf`, text, 60);
    } catch (e) {
      console.log(`Skip ${f} :`, (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
