/**
 * Gate global E3 (Phase 09.2) — READ-ONLY, aucune mutation BDD.
 *
 * Compare le CA AGEFICE côté Tréso (Excel canonique, 3 onglets agrégés) au CA
 * AGEFICE côté base (SessionParticipant.priceHT, opcoCode='AGEFICE'). Périmètre
 * figé RECONCILE-RULES §5.1 : PAS de scoping par exercice (onglets rangés par
 * année de FORMATION, pas de dépôt), lignes sans montant et lignes de total exclues.
 *
 * Verdict : GATE_GLOBAL_OK si |tréso - base| / tréso < 2 %, sinon GATE_GLOBAL_FAIL.
 * exit code 0/1. Le verdict réel est évalué en Plan 07, APRÈS la passe Tréso ;
 * ici on valide que le script tourne et calcule un ratio.
 *
 * Invocation : pnpm --filter @qualiof/web exec tsx scripts/gate-treso-ca.ts
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '@qualiof/db';

// Fichier canonique (§5.1) : PARENT de /files. __dirname = .../files/apps/web/scripts
// → ../../../.. = .../CRM Next gen.
const XLSX_PATH = path.resolve(__dirname, '../../../..', 'Tréso Agefice (2).xlsx');

// Onglets AGEFICE canoniques (§5.1). Matchés sans casse / espaces superflus.
const AGEFICE_SHEETS = ['AGEFICE 2024', 'AGEFICE 2025', 'AGEFICE 2026'];

// Lignes de total Excel à exclure (cf. analyse-treso-agefice.ts).
const TOTAL_KEYWORDS = ['ca ht', 'montant total', 'montant a', 'total ', 'somme'];

function isTotalRow(label: string): boolean {
  const l = label.toLowerCase().trim();
  return TOTAL_KEYWORDS.some((kw) => l.startsWith(kw));
}

async function main(): Promise<void> {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`Fichier Tréso introuvable : ${XLSX_PATH}`);
    process.exit(1);
  }
  // JAMAIS XLSX.readFile (CDN-tarball plante) — lecture buffer (memoire feedback_xlsx_buffer_read).
  const buf = fs.readFileSync(XLSX_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });

  // ── Côté Tréso : somme « Montant Total de la formation » sur les 3 onglets AGEFICE.
  let tresoTotal = 0;
  let tresoLines = 0;
  for (const wantSheet of AGEFICE_SHEETS) {
    const realName = wb.SheetNames.find(
      (n) => n.toLowerCase().replace(/\s+/g, ' ').trim() === wantSheet.toLowerCase(),
    );
    if (!realName) {
      console.warn(`⚠️  Onglet absent : ${wantSheet}`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[realName]!, {
      defval: null,
    });
    for (const r of rows) {
      const montant =
        typeof r['Montant Total de la formation'] === 'number'
          ? (r['Montant Total de la formation'] as number)
          : null;
      if (montant == null) continue; // ligne sans montant (planifiée/vide) → exclue
      const label = String(r['Nom des stagiaires'] ?? '');
      // Les lignes de total/sous-total portent leur libellé (« CA HT 2025 »,
      // « MONTANT A ENCAISSER », « MONTANT TOTAL A PERCEVOIR ») dans la colonne
      // « Date de dépôt » (variantes d'en-tête selon l'onglet), PAS dans la colonne
      // stagiaires. Un vrai dossier y porte une DATE (number) → depotLabel reste ''
      // pour eux : l'exclusion ne peut pas faire tomber un dossier réel.
      const depotRaw =
        r['Date de dépôt \nde la demande'] ??
        r['Date de dépôt de la demande'] ??
        r['Date de dépot'] ??
        r['Date de dépôt'] ??
        r['Date de dépot de la demande'];
      const depotLabel = typeof depotRaw === 'string' ? depotRaw : '';
      if (isTotalRow(label) || isTotalRow(depotLabel)) continue; // ligne de total Excel → exclue
      // « Groupe X » multi-stagiaires = 1 montant total (compté une fois ici).
      tresoTotal += montant;
      tresoLines++;
    }
  }

  // ── Côté base : SP AGEFICE (priceHT en EUROS, pas cents).
  const baseRows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COALESCE(sum(sp."priceHT"), 0)::float AS total
    FROM "SessionParticipant" sp
    JOIN "Organization" o ON o.id = sp."sponsorOrgId"
    WHERE o."opcoCode" = 'AGEFICE'
  `;
  const baseTotal = baseRows[0]?.total ?? 0;

  const ecart = Math.abs(tresoTotal - baseTotal);
  const ratio = tresoTotal > 0 ? ecart / tresoTotal : 1;
  const ok = ratio < 0.02;

  console.log('──── Gate global CA AGEFICE (E3) ────');
  console.log(`Tréso (3 onglets, ${tresoLines} lignes) : ${tresoTotal.toFixed(2)} €`);
  console.log(`Base (SP opcoCode=AGEFICE)            : ${baseTotal.toFixed(2)} €`);
  console.log(`Écart absolu                          : ${ecart.toFixed(2)} €`);
  console.log(`Ratio                                 : ${(ratio * 100).toFixed(2)} %`);
  console.log(ok ? '✅ GATE_GLOBAL_OK (< 2 %)' : '❌ GATE_GLOBAL_FAIL (≥ 2 %)');

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
