/**
 * Va chercher les totaux officiels en bas de chaque feuille Excel
 * pour comprendre quelle colonne "Montant Total" est la bonne.
 *
 * Usage : pnpm --filter @qualiof/web exec tsx scripts/check-totaux-treso.ts
 */

import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const FILE = '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice.xlsx';

const buf = readFileSync(FILE);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) continue;
  console.log('\n' + '='.repeat(80));
  console.log(`📂 Feuille "${sheetName}"`);
  console.log('='.repeat(80));

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  // Afficher header complet avec indices de colonne
  const header = rows[0] ?? [];
  console.log('\nHEADER (index → libellé) :');
  header.forEach((h, i) => {
    const lib = h === null || h === undefined ? '<vide>' : String(h).trim();
    if (lib) console.log(`  [${i}] ${lib.slice(0, 60)}`);
  });

  // Chercher la dernière ligne non-vide
  let lastNonEmpty = -1;
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r];
    if (row && row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) {
      lastNonEmpty = r;
      break;
    }
  }
  console.log(`\nDernière ligne non-vide : L${lastNonEmpty + 1} (sur ${rows.length} lignes totales)`);

  // Afficher les 10 dernières lignes non-vides pour repérer les totaux
  console.log('\nDernières lignes utiles (chercher "Total", "TOTAL", "Somme"...) :');
  for (let r = Math.max(0, lastNonEmpty - 20); r <= lastNonEmpty; r++) {
    const row = rows[r];
    if (!row) continue;
    const hasContent = row.some((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (!hasContent) continue;
    const display = row
      .map((c, i) => {
        const v = c === null || c === undefined ? '' : String(c).trim();
        return v ? `[${i}]${v.slice(0, 30)}` : '';
      })
      .filter((s) => s)
      .join(' | ');
    console.log(`  L${r + 1}: ${display}`);
  }

  // Vérifier s'il y a des formules
  console.log('\nFormules Excel détectées :');
  const formulas: { cell: string; formula: string; value: unknown }[] = [];
  for (const [cellRef, cell] of Object.entries(sheet)) {
    if (cellRef.startsWith('!')) continue;
    const c = cell as XLSX.CellObject;
    if (c.f) {
      formulas.push({ cell: cellRef, formula: c.f, value: c.v });
    }
  }
  if (formulas.length === 0) {
    console.log('  (aucune formule)');
  } else {
    formulas.slice(0, 20).forEach((f) => {
      console.log(`  ${f.cell} = ${f.formula}  →  ${f.value}`);
    });
    if (formulas.length > 20) console.log(`  ... (${formulas.length - 20} autres formules)`);
  }
}
