/**
 * Lecture du Tableau récapitulatif informations agents (Drive)
 * pour récupérer les noms des formateurs et autres infos manquantes.
 */

import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const PATH = '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/Mon Drive/Test Qualiopi/Tableau_recapitulatif_informations agent (2).xlsx';

const buf = readFileSync(PATH);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) continue;
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📂 Feuille "${sheetName}" — ${range.e.c + 1} cols × ${range.e.r + 1} lignes`);
  console.log('='.repeat(80));

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  // Header
  const header = rows[0] ?? [];
  console.log('\nHeader :');
  header.forEach((h, i) => {
    const lib = h === null || h === undefined ? '' : String(h).trim();
    if (lib) console.log(`  [${i.toString().padStart(2)}] ${lib}`);
  });

  // 3 échantillons
  console.log(`\nÉchantillons :`);
  for (const idx of [1, Math.floor(rows.length / 2), rows.length - 2]) {
    if (idx < 0 || idx >= rows.length) continue;
    const r = rows[idx];
    if (!r) continue;
    const display = r
      .map((c, i) => {
        const v = c === null || c === undefined ? '' : String(c).slice(0, 40);
        return v ? `[${i}]${v}` : '';
      })
      .filter((s) => s)
      .join(' | ');
    console.log(`  L${idx + 1}: ${display}`);
  }
}
