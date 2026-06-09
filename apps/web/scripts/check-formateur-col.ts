/**
 * Vérification exhaustive : la colonne "Nom du formateur" existe-t-elle
 * dans toutes les feuilles 2024/2025/2026 ?
 */

import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const FILES = [
  '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice.xlsx',
  '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice (1).xlsx',
  '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice (2).xlsx',
];

for (const path of FILES) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📂 ${path.split('/').pop()}`);
  console.log('='.repeat(80));

  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
    console.log(`\n--- "${sheetName}" — range ${sheet['!ref']} (${range.e.c + 1} colonnes, ${range.e.r + 1} lignes) ---`);

    // Header complet
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, range: 0 }) as unknown[][];
    const header = rows[0] ?? [];
    console.log('Header complet :');
    header.forEach((h, i) => {
      const lib = h === null || h === undefined ? '' : String(h).trim();
      console.log(`  [${i.toString().padStart(2)}] ${lib || '<vide>'}`);
    });

    // Recherche "formateur" case-insensitive sur toutes les cellules
    let foundFormateur = false;
    for (const [cellRef, cell] of Object.entries(sheet)) {
      if (cellRef.startsWith('!')) continue;
      const c = cell as XLSX.CellObject;
      const v = c.v === null || c.v === undefined ? '' : String(c.v).toLowerCase();
      if (v.includes('formateur')) {
        console.log(`  🔍 Cellule ${cellRef} contient "formateur" : "${c.v}"`);
        foundFormateur = true;
      }
    }
    if (!foundFormateur) {
      console.log('  ❌ Aucune cellule ne contient "formateur"');
    }

    // Échantillon de 3 lignes de données (pas en bas - milieu de la liste)
    const midRow = Math.min(20, Math.floor((rows.length - 1) / 2));
    console.log(`\n  Échantillon ligne ${midRow + 1} :`);
    const sample = rows[midRow];
    if (sample) {
      sample.forEach((c, i) => {
        const v = c === null || c === undefined ? '' : String(c).slice(0, 40);
        if (v) console.log(`    [${i}] ${v}`);
      });
    }
  }
}
