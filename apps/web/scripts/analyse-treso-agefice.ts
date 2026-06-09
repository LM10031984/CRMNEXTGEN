/**
 * Étape 1 : extraire les lignes utiles des 3 fichiers Tréso Agefice
 * et comparer les fichiers entre eux pour identifier la version de référence.
 *
 * Usage : pnpm --filter @qualiof/web exec tsx scripts/analyse-treso-agefice.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

interface TresoRow {
  year: number;
  dateDepot: string | null;
  dateFormation: string | null;
  nbStagiaires: number | null;
  nomStagiaire: string;
  opcoOrg: string | null;
  montantTotal: number | null;
  factureEnvoyee: string | null;
  validationOrg: string | null;
  remboursementOPCO: string | null;
  paiementClient: string | null;
  sourceFile: string;
}

const FILES = [
  '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice.xlsx',
  '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice (1).xlsx',
  '/Users/laurentmarx/Documents/CRM Next gen/Tréso Agefice (2).xlsx',
];

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.trim() || null;
  return String(v);
}

function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function extractRows(filePath: string): TresoRow[] {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const out: TresoRow[] = [];
  const fileName = filePath.split('/').pop() ?? filePath;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const yearMatch = sheetName.match(/(\d{4})/);
    const year = yearMatch && yearMatch[1] ? parseInt(yearMatch[1], 10) : 0;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    if (rows.length < 2) continue;

    const header = (rows[0] ?? []).map((c) =>
      c === null || c === undefined ? '' : String(c).trim().toLowerCase().replace(/\s+/g, ' '),
    );

    const col = (...patterns: string[]): number => {
      for (let i = 0; i < header.length; i++) {
        const h = header[i] ?? '';
        for (const p of patterns) {
          if (h.includes(p)) return i;
        }
      }
      return -1;
    };

    const iDateDepot = col('date de dépôt', 'date de dépot', 'date de depot');
    const iDateFormation = col('date de la formation');
    const iNbStag = col('nbe de stagiaires', 'nb de stagiaires', 'nb stagiaires');
    const iNomStag = col('nom des stagiaires', 'nom stagiaire');
    const iOpco = col('organisme de prise en charge', 'opco');
    const iMontant = col('montant total de la formation', 'montant total');
    const iFacture = col('facture envoyée', 'facture envoyee');
    const iValid = col('validation organisme');
    const iRembour = col('remboursement opco');
    const iPaie = col('paiement client');

    // Mots-clés des lignes de totaux Excel à ignorer (CA HT, MONTANT TOTAL, etc.)
    const TOTAL_KEYWORDS = ['ca ht', 'montant total', 'montant a', 'total ', 'somme'];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const nomStag = iNomStag >= 0 ? parseStr(row[iNomStag]) : null;
      const montant = iMontant >= 0 ? parseMoney(row[iMontant]) : null;

      // Ignore lignes sans nom de stagiaire (lignes vides OU lignes de totaux qui ont juste un montant)
      if (!nomStag) continue;

      // Sécurité : ignore si la 1ère colonne contient un mot-clé de total
      const col0 = row[0] ? String(row[0]).toLowerCase().trim() : '';
      if (TOTAL_KEYWORDS.some((kw) => col0.startsWith(kw))) continue;

      out.push({
        year,
        dateDepot: iDateDepot >= 0 ? parseDate(row[iDateDepot]) : null,
        dateFormation: iDateFormation >= 0 ? parseDate(row[iDateFormation]) : null,
        nbStagiaires: iNbStag >= 0 ? parseMoney(row[iNbStag]) : null,
        nomStagiaire: nomStag ?? '<sans nom>',
        opcoOrg: iOpco >= 0 ? parseStr(row[iOpco]) : null,
        montantTotal: montant,
        factureEnvoyee: iFacture >= 0 ? parseStr(row[iFacture]) : null,
        validationOrg: iValid >= 0 ? parseStr(row[iValid]) : null,
        remboursementOPCO: iRembour >= 0 ? parseStr(row[iRembour]) : null,
        paiementClient: iPaie >= 0 ? parseStr(row[iPaie]) : null,
        sourceFile: fileName,
      });
    }
  }

  return out;
}

function summarize(label: string, rows: TresoRow[]) {
  const byYear = new Map<number, TresoRow[]>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r);
  }

  console.log(`\n📊 ${label} — ${rows.length} lignes utiles`);
  for (const [year, list] of Array.from(byYear.entries()).sort()) {
    const totalCA = list.reduce((s, r) => s + (r.montantTotal ?? 0), 0);
    const nbValid = list.filter((r) => r.validationOrg?.toUpperCase() === 'OUI').length;
    const nbPaye = list.filter((r) => r.paiementClient?.toUpperCase() === 'OUI').length;
    console.log(
      `   ${year} : ${list.length} dossiers · CA ${totalCA.toLocaleString('fr-FR')} € · ${nbValid} validés OPCO · ${nbPaye} payés client`,
    );
  }
}

function sig(r: TresoRow): string {
  return `${r.year}|${r.nomStagiaire.toLowerCase().trim()}|${r.montantTotal ?? 0}`;
}

// === Main ===
const allData: { file: string; rows: TresoRow[] }[] = [];
for (const path of FILES) {
  const rows = extractRows(path);
  allData.push({ file: path.split('/').pop() ?? path, rows });
  summarize(path.split('/').pop() ?? path, rows);
}

console.log('\n\n🔍 COMPARAISON DES 3 FICHIERS\n' + '='.repeat(60));

const sigsByFile = allData.map((d) => new Set(d.rows.map(sig)));
const [s0, s1, s2] = sigsByFile;

if (s0 && s1 && s2) {
  const only0 = [...s0].filter((s) => !s1.has(s) && !s2.has(s));
  const only1 = [...s1].filter((s) => !s0.has(s) && !s2.has(s));
  const only2 = [...s2].filter((s) => !s0.has(s) && !s1.has(s));
  const common = [...s0].filter((s) => s1.has(s) && s2.has(s));

  console.log(`Lignes communes aux 3 fichiers : ${common.length}`);
  console.log(`Uniques à "Tréso Agefice.xlsx" : ${only0.length}`);
  console.log(`Uniques à "Tréso Agefice (1).xlsx" : ${only1.length}`);
  console.log(`Uniques à "Tréso Agefice (2).xlsx" : ${only2.length}`);

  if (only0.length || only1.length || only2.length) {
    console.log('\n⚠️ Les 3 fichiers ne sont PAS identiques.');
    if (only0.length) {
      console.log(`\n   Uniques à "Tréso Agefice.xlsx" (max 10):`);
      only0.slice(0, 10).forEach((s) => console.log(`      • ${s}`));
    }
    if (only1.length) {
      console.log(`\n   Uniques à "Tréso Agefice (1).xlsx" (max 10):`);
      only1.slice(0, 10).forEach((s) => console.log(`      • ${s}`));
    }
    if (only2.length) {
      console.log(`\n   Uniques à "Tréso Agefice (2).xlsx" (max 10):`);
      only2.slice(0, 10).forEach((s) => console.log(`      • ${s}`));
    }
  } else {
    console.log('\n✅ Les 3 fichiers contiennent EXACTEMENT les mêmes lignes utiles.');
  }
}

// Union dédupliquée pour usage downstream
const seen = new Set<string>();
const unique: TresoRow[] = [];
for (const d of allData) {
  for (const r of d.rows) {
    const k = sig(r);
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(r);
    }
  }
}

console.log(`\n\n📝 TOTAL UNION DÉDUPLIQUÉE : ${unique.length} lignes`);
const totalCA = unique.reduce((s, r) => s + (r.montantTotal ?? 0), 0);
console.log(`   CA total cumulé (2024-2026) : ${totalCA.toLocaleString('fr-FR')} €`);

const outPath = '/tmp/treso-agefice-extracted.json';
writeFileSync(outPath, JSON.stringify(unique, null, 2));
console.log(`\n💾 Données extraites écrites dans : ${outPath}`);
