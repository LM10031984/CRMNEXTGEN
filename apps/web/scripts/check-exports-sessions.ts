import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const FILES = [
  '/Users/laurentmarx/Documents/CRM Next gen/Export Toutes les sessions de formation - 28_04_2026 (2).xlsx',
  '/Users/laurentmarx/Documents/CRM Next gen/Export des sessions SmartOF - 28_04_2026.xlsx',
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
    console.log(`\n--- "${sheetName}" (${range.e.c + 1} cols × ${range.e.r + 1} lignes) ---`);

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    const header = rows[0] ?? [];
    console.log('Header :');
    header.forEach((h, i) => {
      const lib = h === null || h === undefined ? '' : String(h).trim();
      if (lib) console.log(`  [${i.toString().padStart(2)}] ${lib}`);
    });

    // 3 échantillons de données
    console.log(`\n3 échantillons (lignes 2, 10, 20) :`);
    for (const idx of [1, 9, 19]) {
      const r = rows[idx];
      if (!r) continue;
      console.log(`  L${idx + 1}:`, r.map((c, i) => {
        const v = c === null || c === undefined ? '' : String(c).slice(0, 35);
        return v ? `[${i}]${v}` : '';
      }).filter((s) => s).join(' | '));
    }
  }
}
