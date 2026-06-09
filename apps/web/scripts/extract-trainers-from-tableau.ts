/**
 * Étape 1 : extraire toutes les lignes (nom agent, date formation, formateur)
 * du Tableau_recapitulatif_informations agent.xlsx (10 feuilles).
 *
 * Étape 2 : matcher avec les sessions BDD pour identifier le formateur principal.
 *
 * Lecture seule. Produit un rapport CSV.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { prisma } from '@qualiof/db';

const TABLEAU_PATH =
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/Mon Drive/Test Qualiopi/Tableau_recapitulatif_informations agent (2).xlsx';

interface TableauRow {
  feuille: string;
  nomAgent: string;
  dateFormation: string | null;
  formateur: string;
  tarif: string | null;
  nbHeures: string | null;
  theme: string | null;
}

function parseStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(m\.|mme|mr|monsieur|madame|mlle)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('📥 Lecture du Tableau récap...');
  const buf = readFileSync(TABLEAU_PATH);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

  const rows: TableauRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    if (all.length < 2) continue;

    const header = (all[0] ?? []).map((c) =>
      c === null || c === undefined ? '' : String(c).trim().toLowerCase(),
    );

    const col = (...patterns: string[]): number => {
      for (let i = 0; i < header.length; i++) {
        const h = header[i] ?? '';
        for (const p of patterns) {
          if (h === p || h.includes(p)) return i;
        }
      }
      return -1;
    };

    const iNom = col('nom');
    const iDate = col('date formation', 'date de la formation');
    const iFormateur = col('formateur');
    const iTarif = col('tarif');
    const iNbH = col("nbe d'heures", 'nb heures');
    const iTheme = col('thème', 'theme');

    if (iNom < 0 || iFormateur < 0) {
      console.log(`  ⏭️  "${sheetName}" : pas de col nom ou formateur, skip`);
      continue;
    }

    let nFeuille = 0;
    for (let r = 1; r < all.length; r++) {
      const row = all[r];
      if (!row) continue;
      const nom = parseStr(row[iNom]);
      const formateur = parseStr(row[iFormateur]);
      if (!nom || !formateur) continue;
      rows.push({
        feuille: sheetName,
        nomAgent: nom,
        dateFormation: iDate >= 0 ? parseStr(row[iDate]) : null,
        formateur,
        tarif: iTarif >= 0 ? parseStr(row[iTarif]) : null,
        nbHeures: iNbH >= 0 ? parseStr(row[iNbH]) : null,
        theme: iTheme >= 0 ? parseStr(row[iTheme]) : null,
      });
      nFeuille++;
    }
    console.log(`  ✓ "${sheetName}" : ${nFeuille} lignes utiles`);
  }

  console.log(`\n📊 Total : ${rows.length} lignes extraites des 10 feuilles`);

  // Stats formateurs uniques
  const formateurStats = new Map<string, number>();
  for (const r of rows) {
    formateurStats.set(r.formateur, (formateurStats.get(r.formateur) ?? 0) + 1);
  }
  console.log(`\n👨‍🏫 Formateurs uniques dans le tableau (${formateurStats.size}) :`);
  for (const [name, n] of [...formateurStats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${n.toString().padStart(3)}× ${name}`);
  }

  // Persons formateurs déjà en BDD
  console.log(`\n🔍 Recherche en BDD des Person dont nom matche les formateurs tableau...`);
  const persons = await prisma.person.findMany({
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  console.log(`   ${persons.length} Person en BDD (tous rôles confondus)`);

  // Matching formateur tableau → Person BDD
  console.log(`\n🔗 Matching formateurs tableau → Person BDD :`);
  const formateurResolution = new Map<string, { personId: string | null; matchedName: string | null }>();
  for (const formateurName of formateurStats.keys()) {
    const normTab = normalizeName(formateurName);
    // Match exact
    let found = persons.find((p) => {
      const full = normalizeName(`${p.firstName ?? ''} ${p.lastName ?? ''}`);
      return full === normTab;
    });
    // Sinon : match par initiales "LM" → "Laurent Marx"
    if (!found && normTab.length <= 3) {
      // Tester en initiales
      found = persons.find((p) => {
        const initials = `${(p.firstName ?? '').charAt(0)}${(p.lastName ?? '').charAt(0)}`.toLowerCase();
        return initials === normTab;
      });
    }
    // Sinon : match partiel (lastName seul)
    if (!found) {
      found = persons.find((p) => {
        const ln = normalizeName(p.lastName ?? '');
        return ln && normTab.includes(ln);
      });
    }
    formateurResolution.set(formateurName, {
      personId: found?.id ?? null,
      matchedName: found ? `${found.firstName} ${found.lastName}` : null,
    });
    const status = found ? `✅ ${found.firstName} ${found.lastName}` : '❌ AUCUN MATCH BDD';
    console.log(`   "${formateurName}" → ${status}`);
  }

  // Export CSV
  const csvLines: string[] = [];
  csvLines.push('feuille;nomAgent;dateFormation;formateur_tableau;personId_BDD;personName_BDD;tarif;nbHeures;theme');
  for (const r of rows) {
    const res = formateurResolution.get(r.formateur);
    csvLines.push(
      [
        r.feuille,
        r.nomAgent,
        r.dateFormation ?? '',
        r.formateur,
        res?.personId ?? '',
        res?.matchedName ?? '',
        r.tarif ?? '',
        r.nbHeures ?? '',
        r.theme ?? '',
      ]
        .map((v) => {
          const s = String(v);
          return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(';'),
    );
  }
  const outPath = '/tmp/tableau-trainers-extracted.csv';
  writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log(`\n💾 Export CSV : ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Erreur :', e);
  prisma.$disconnect().finally(() => process.exit(1));
});
