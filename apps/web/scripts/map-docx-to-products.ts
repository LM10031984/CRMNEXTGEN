/**
 * Phase 1 — Mapping fuzzy entre les DOCX programmes Drive et les TrainingProduct BDD.
 *
 * Pour chaque TrainingProduct, trouve le DOCX dont le titre normalisé a la
 * plus petite distance Levenshtein (ratio). Sort un CSV à valider par Laurent
 * avant l'import effectif (Phase 2).
 *
 * Lecture seule. NE TOUCHE PAS À LA BDD.
 *
 * Usage : cd apps/web && npx dotenv -e ../../.env -- tsx scripts/map-docx-to-products.ts
 */

import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@qualiof/db';

const DRIVE_ROOT =
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Formations et programmes';

interface DocxFile {
  path: string;
  fileName: string;
  folder: string; // sous-dossier direct (ex: "057 Intégrer l'IA pour productivité")
  // Titre normalisé pour matching (sans préfixes C1.i1 PROGRAMME, V2, etc.)
  titleNormalized: string;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.(docx?|pdf)$/i, '')
    .replace(/^c1\.i1\s*programme\s*[-—]?\s*\d*\.?\s*/i, '')
    .replace(/^c2\.i06_convention_formation_professionnelle_?/i, '')
    .replace(/^programme\s+/i, '')
    .replace(/\s+v\d+$/i, '')
    .replace(/\s*[-–—]\s*\d+\s*(j|h|h00|jours?|heures?)?$/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function listDocx(root: string, maxDepth = 3, depth = 0): DocxFile[] {
  if (depth > maxDepth) return [];
  const out: DocxFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = join(root, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...listDocx(full, maxDepth, depth + 1));
    } else if (stat.isFile() && /\.docx$/i.test(name)) {
      // Garder seulement les programmes (C1.i1) — pas les conventions (C2.i06) ni autres
      if (/c2\.i06_convention/i.test(name)) continue;
      out.push({
        path: full,
        fileName: name,
        folder: root.split('/').pop() ?? '',
        titleNormalized: normalize(name),
      });
    }
  }
  return out;
}

// Distance Levenshtein simple
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

// Score 0..1 (1 = match parfait)
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

async function main() {
  console.log('📥 Scan des DOCX dans Drive...');
  const docx = listDocx(DRIVE_ROOT);
  console.log(`   ${docx.length} DOCX programmes trouvés (hors conventions)\n`);

  console.log('📥 Chargement des TrainingProduct BDD...');
  const products = await prisma.trainingProduct.findMany({
    select: {
      id: true,
      code: true,
      title: true,
      durationHours: true,
      priceHT: true,
      objectives: true,
      programMd: true,
    },
    orderBy: { title: 'asc' },
  });
  console.log(`   ${products.length} TrainingProduct\n`);

  const csvLines: string[] = [];
  csvLines.push(
    'productCode;productTitle;durationHours;priceHT;hasProgramMd;score;suggestedDocx;suggestedFolder;top2Docx;top2Score;top3Docx;top3Score',
  );

  let nGoodMatch = 0;
  let nWeakMatch = 0;
  let nNoMatch = 0;

  for (const p of products) {
    const titleNorm = normalize(p.title);
    const scored = docx
      .map((d) => ({ ...d, score: similarity(titleNorm, d.titleNormalized) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const [t1, t2, t3] = scored;
    const top1Score = t1?.score ?? 0;

    if (top1Score >= 0.7) nGoodMatch++;
    else if (top1Score >= 0.4) nWeakMatch++;
    else nNoMatch++;

    function csvEscape(v: unknown): string {
      const s = v === null || v === undefined ? '' : String(v);
      if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }

    csvLines.push(
      [
        p.code,
        p.title,
        p.durationHours,
        Number(p.priceHT ?? 0).toFixed(2),
        p.programMd && p.programMd.length > 0 ? 'OUI' : 'NON',
        top1Score.toFixed(3),
        t1?.fileName ?? '',
        t1?.folder ?? '',
        t2?.fileName ?? '',
        (t2?.score ?? 0).toFixed(3),
        t3?.fileName ?? '',
        (t3?.score ?? 0).toFixed(3),
      ]
        .map(csvEscape)
        .join(';'),
    );
  }

  console.log('\n📊 SYNTHÈSE DU MAPPING');
  console.log(`   Bon match (score ≥ 0.70)    : ${nGoodMatch} produits ✅`);
  console.log(`   Match faible (0.40–0.70)    : ${nWeakMatch} produits ⚠️`);
  console.log(`   Pas de match (< 0.40)       : ${nNoMatch} produits ❌`);
  console.log(`   Total                       : ${products.length}`);

  // Top 5 bons matchs (pour confiance visuelle)
  console.log('\n🎯 Top 5 bons matchs (échantillon) :');
  const sorted = products.map((p) => {
    const titleNorm = normalize(p.title);
    const best = docx
      .map((d) => ({ ...d, score: similarity(titleNorm, d.titleNormalized) }))
      .sort((a, b) => b.score - a.score)[0];
    return { p, best };
  });
  for (const { p, best } of sorted
    .filter((x) => (x.best?.score ?? 0) >= 0.7)
    .sort((a, b) => (b.best?.score ?? 0) - (a.best?.score ?? 0))
    .slice(0, 5)) {
    console.log(`   ${(best?.score ?? 0).toFixed(2)} · ${p.title.slice(0, 50).padEnd(52)} → ${best?.fileName?.slice(0, 60)}`);
  }

  // Échantillon pas-de-match
  if (nNoMatch > 0) {
    console.log('\n⚠️  5 produits sans match clair (score < 0.40) :');
    for (const { p, best } of sorted
      .filter((x) => (x.best?.score ?? 0) < 0.4)
      .slice(0, 5)) {
      console.log(`   ${(best?.score ?? 0).toFixed(2)} · ${p.title.slice(0, 50)} (top candidat : ${best?.fileName?.slice(0, 50)})`);
    }
  }

  const outPath = '/tmp/mapping-docx-products.csv';
  writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log(`\n💾 Mapping CSV : ${outPath}`);
  console.log(`   Ouvre dans Excel/Numbers, vérifie/corrige les match faibles.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Erreur :', e);
  prisma.$disconnect().finally(() => process.exit(1));
});
