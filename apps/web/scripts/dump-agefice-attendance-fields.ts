/**
 * Script one-shot : dump la liste des form fields du PDF
 * "Attestation d'assiduité AGEFICE" (modèle janvier 2023).
 *
 * BUG-12 (préparation) — sert à scaffolder le helper
 * `agefice-attendance-fill.ts` (à écrire dans une session dédiée).
 *
 * Usage : pnpm --filter @qualiof/web exec tsx scripts/dump-agefice-attendance-fields.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

async function main() {
  const pdfPath = join(
    process.cwd(),
    'public/templates/agefice/attestation-assiduite-2023.pdf',
  );
  const bytes = readFileSync(pdfPath);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const fields = form.getFields();

  console.log(`PDF: ${pdfPath}`);
  console.log(`Pages: ${doc.getPageCount()}`);
  console.log(`Form fields: ${fields.length}`);
  console.log('───────────────────────────────────────────');

  for (const f of fields) {
    const name = f.getName();
    const ctor = f.constructor.name;
    console.log(`  ${ctor.padEnd(20)} → ${name}`);
  }
}

main().catch((e) => {
  console.error('Erreur :', e);
  process.exit(1);
});
