/**
 * Phase 13 — Veille Qualiopi (VEILLE-01).
 *
 * Importeur xlsx → Postgres pour le tableau de veille historique Start Academy.
 *
 * Source : `C6.i23-24-25tableau veille.xlsx` (5 feuilles, ~84 lignes, 2 layouts).
 *
 * Stratégie :
 *   1. Idempotent : on peut relancer sans créer de doublons.
 *      Clé naturelle = (tenantId, theme, title, url) — D-11 (autorise duplication
 *      thématique : même URL dans 2 thèmes = 2 lignes).
 *   2. AuditLog `regulatoryWatch.created` (batch=true) sur chaque INSERT.
 *      Sur UPDATE (re-run avec ligne enrichie) : pas de nouveau log `created`.
 *   3. Layouts gérés :
 *      - Sheets INDIC_23/24 : header row 2, col 0 vide, single exploitation (col 7)
 *      - Sheets INDIC_25/26 (les 2) : header row 0 ou 2, dual exploitation
 *        (col 6 = rawSnippet brut, col 8 = exploitation rédigée, col 7 = date)
 *   4. Parser de dates multi-format via `parseFlexibleDate` (réécrit local pour
 *      éviter import croisé `packages/db` → `apps/web` qui fragiliserait le tsx run).
 *
 * Lancement :
 *   pnpm --filter @qualiof/db exec tsx scripts/import-veille-from-xlsx.ts \
 *     "/Users/laurentmarx/Documents/CRM Next gen/C6.i23-24-25tableau veille.xlsx"
 *
 * Sortie attendue :
 *   - 1er run : ~84 inserted, 0 updated
 *   - 2e run : 0 inserted, ~84 updated (idempotent)
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

// Charge .env depuis la racine du monorepo (deux niveaux au-dessus de packages/db)
// — uniquement quand on est exécuté directement, pas en test (Vitest charge déjà
// l'env via vitest.config.ts si besoin).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

import * as XLSX from 'xlsx';
import { prisma } from '@qualiof/db';
import type { RegulatoryWatchTheme } from '@prisma/client';

// ---------- Parser de date local (duplication contrôlée — cf JSDoc en-tête) ----------

const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/**
 * Clone-strict de `apps/web/src/lib/veille/parse-flexible-date.ts` — duplication
 * acceptable car helper pur 30 LOC, et import croisé `packages/db → apps/web` est
 * fragile en tsx ESM run.
 */
function parseFlexibleDate(v: string | null): Date | null {
  if (!v || !v.trim()) return null;
  const s = v.trim();

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10) - 1;
    const yy = parseInt(m[3]!, 10);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, month, day);
  }

  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const mon = MONTH_MAP[m[2]!];
    if (mon === undefined) return null;
    const yy = parseInt(m[3]!, 10);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, mon, day);
  }

  m = s.match(/^([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1]!];
    if (mon === undefined) return null;
    const yy = parseInt(m[2]!, 10);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, mon, 1);
  }

  return null;
}

// ---------- Sheet mapping ----------

/**
 * Mapping feuille → thème Qualiopi.
 *
 * `headerRow` : index 0-based de la ligne d'en-tête (les feuilles INDIC_23/24/25
 * ont 2 lignes vides en haut + header en ligne 2).
 *
 * `hasDualExploitation` :
 *   - true  → col 6 = rawSnippet (description brute), col 7 = date, col 8 = exploitation rédigée
 *   - false → col 6 = exploitation directe (un seul champ texte)
 *
 * Pour les feuilles INDIC_25/26 le layout est dual même si headerRow diffère.
 */
export const SHEET_THEME_MAP: Array<{
  name: string;
  theme: RegulatoryWatchTheme;
  headerRow: number;
  hasDualExploitation: boolean;
}> = [
  { name: '23-Veille Formation pro', theme: 'INDIC_23', headerRow: 2, hasDualExploitation: false },
  { name: '26 - Veille Handicap', theme: 'INDIC_26', headerRow: 0, hasDualExploitation: true },
  { name: '26-Veille DREETS PACA', theme: 'INDIC_26', headerRow: 0, hasDualExploitation: true },
  { name: '24- secteur dactivité', theme: 'INDIC_24', headerRow: 2, hasDualExploitation: false },
  { name: '25- Innovations péda et techno', theme: 'INDIC_25', headerRow: 2, hasDualExploitation: true },
];

// ---------- Types & helpers ----------

export interface VeilleRow {
  title: string;
  url: string | null;
  modeSuivi: string | null;
  typeSource: string | null;
  responsable: string | null;
  frequency: string | null;
  exploitation: string | null;
  rawSnippet: string | null;
  dateLastReviewed: Date | null;
}

function normalizeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/**
 * Normalise un responsable issu du xlsx : "LAURENT" → "Laurent",
 * "Jean Guy" → "Jean guy" (pas idéal mais cohérent avec format Capitalize-first).
 *
 * Note : règle simple — première lettre majuscule, reste minuscule. Les noms
 * composés type "Jean Guy" passent en "Jean guy" — pas grave (champ libre,
 * pas FK User — cf D-10 CONTEXT.md).
 */
function normalizeResponsable(v: string | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

// ---------- Processing ----------

/**
 * Pure function : matrice (issue de XLSX.utils.sheet_to_json header:1) → VeilleRow[].
 *
 * Exporté pour les tests Wave 0 (`scripts/__tests__/import-veille.mapping.test.ts`).
 */
export function processSheetRows(
  rows: (string | null)[][],
  _theme: RegulatoryWatchTheme,
  headerRow: number,
  hasDualExploitation: boolean,
): VeilleRow[] {
  const out: VeilleRow[] = [];

  // Offset : si headerRow === 2, col 0 est vide partout (col 0..N → cols 1..N+1)
  // Si headerRow === 0, col 0 = titre direct.
  const offset = headerRow === 2 ? 1 : 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const title = normalizeString(r[offset + 0]);
    if (!title) continue; // ligne vide

    const url = normalizeString(r[offset + 1]);
    const modeSuivi = normalizeString(r[offset + 2]);
    const typeSource = normalizeString(r[offset + 3]);
    const responsable = normalizeResponsable(normalizeString(r[offset + 4]));
    const frequency = normalizeString(r[offset + 5]);

    let rawSnippet: string | null = null;
    let exploitation: string | null = null;
    let dateLastReviewed: Date | null = null;

    if (hasDualExploitation) {
      rawSnippet = normalizeString(r[offset + 6]);
      dateLastReviewed = parseFlexibleDate(normalizeString(r[offset + 7]));
      exploitation = normalizeString(r[offset + 8]);
    } else {
      exploitation = normalizeString(r[offset + 6]);
    }

    out.push({
      title,
      url,
      modeSuivi,
      typeSource,
      responsable,
      frequency,
      exploitation,
      rawSnippet,
      dateLastReviewed,
    });
  }

  return out;
}

/**
 * Persiste une ligne VeilleRow en BDD avec sémantique idempotente.
 *
 * - Si findFirst sur (tenantId, theme, title, url) trouve une entrée → UPDATE
 *   (champs modifiables uniquement). Pas d'AuditLog `created` sur update (cf D-Phase 13).
 * - Sinon → CREATE + AuditLog `regulatoryWatch.created` avec batch=true.
 *
 * Exporté pour les tests Wave 0 (`scripts/__tests__/import-veille.idempotence.test.ts`).
 *
 * @returns `{ result: 'inserted'|'updated', id: string }` pour reporting.
 */
export async function persistVeilleRow(
  tenantId: string,
  theme: RegulatoryWatchTheme,
  row: VeilleRow,
): Promise<{ result: 'inserted' | 'updated'; id: string }> {
  const existing = await prisma.regulatoryWatch.findFirst({
    where: { tenantId, theme, title: row.title, url: row.url },
    select: { id: true },
  });

  if (existing) {
    await prisma.regulatoryWatch.update({
      where: { id: existing.id },
      data: {
        modeSuivi: row.modeSuivi,
        typeSource: row.typeSource,
        responsable: row.responsable,
        frequency: row.frequency,
        exploitation: row.exploitation,
        rawSnippet: row.rawSnippet,
        dateLastReviewed: row.dateLastReviewed,
      },
    });
    return { result: 'updated', id: existing.id };
  }

  const created = await prisma.regulatoryWatch.create({
    data: {
      tenantId,
      theme,
      title: row.title,
      url: row.url,
      modeSuivi: row.modeSuivi,
      typeSource: row.typeSource,
      responsable: row.responsable,
      frequency: row.frequency,
      exploitation: row.exploitation,
      rawSnippet: row.rawSnippet,
      dateLastReviewed: row.dateLastReviewed,
      status: 'ACTIVE',
      suggestedBy: 'IMPORT',
    },
  });

  // AuditLog `regulatoryWatch.created` (1ère instanciation convention Phase 13).
  // actorUserId = null car script CLI (cohérent avec convention "système" du
  // helper `logRegulatoryWatchEvent` — Plan 03+ utilisera l'helper, ici on
  // écrit en direct pour éviter import croisé apps/web → packages/db).
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: null,
      entity: 'RegulatoryWatch',
      entityId: created.id,
      action: 'regulatoryWatch.created',
      diff: {
        source: 'import-xlsx',
        theme,
        title: row.title,
        batch: true,
      } as never,
    },
  });

  return { result: 'inserted', id: created.id };
}

// ---------- Main script ----------

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
  perTheme: Record<string, { inserted: number; updated: number }>;
}

export async function importVeille(tenantId: string, xlsxPath: string): Promise<ImportResult> {
  // Mémoire `feedback_xlsx_buffer_read.md` : XLSX.readFile() plante (CDN-tarball).
  // Toujours passer par fs.readFileSync + XLSX.read(buf, type:'buffer').
  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

  const result: ImportResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: 0,
    perTheme: {},
  };

  for (const { name, theme, headerRow, hasDualExploitation } of SHEET_THEME_MAP) {
    const sheet = wb.Sheets[name];
    if (!sheet) {
      console.warn(`Sheet absent: "${name}" — skip`);
      continue;
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      defval: null,
      raw: false,
      header: 1,
    }) as (string | null)[][];

    const rows = processSheetRows(matrix, theme, headerRow, hasDualExploitation);
    result.perTheme[theme] ??= { inserted: 0, updated: 0 };

    for (const row of rows) {
      result.total++;
      try {
        const { result: r } = await persistVeilleRow(tenantId, theme, row);
        if (r === 'inserted') {
          result.inserted++;
          result.perTheme[theme]!.inserted++;
        } else {
          result.updated++;
          result.perTheme[theme]!.updated++;
        }
      } catch (e) {
        console.error(`Failed to persist row "${row.title}" (theme=${theme}):`, e);
        result.skipped++;
      }
    }
  }

  return result;
}

async function main() {
  const xlsxArg = process.argv[2];
  if (!xlsxArg) {
    console.error(
      'Usage: tsx scripts/import-veille-from-xlsx.ts <path-to-xlsx> [tenantId]',
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) {
    throw new Error('No tenant in DB — run prisma db seed first.');
  }
  const tenantId = process.argv[3] ?? tenant.id;
  const absPath = path.resolve(xlsxArg);

  console.log(`Importing ${absPath} into tenant ${tenantId}...`);
  const result = await importVeille(tenantId, absPath);
  console.log(
    `Done: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped (total ${result.total})`,
  );
  console.log('Per theme:', result.perTheme);
}

// Exécution directe (pas en import depuis les tests).
const isDirectRun = process.argv[1] === __filename;
if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
