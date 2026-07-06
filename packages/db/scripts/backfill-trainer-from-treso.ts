/**
 * Backfill formateurs sur sessions importées (SES-xxxx sans SessionTrainer).
 *
 * Pourquoi : l'import SmartOF n'a pas récupéré les formateurs par session
 * (cf. mémoire `reference_smartof_api` — limite API). Résultat : 95% des
 * lignes du Bilan Qualiopi 2026 affichent "—" comme formateur. Or l'Excel
 * Tréso AGEFICE contient cette info (colonne "Nom du formateur").
 *
 * Stratégie :
 *   1. Lit Tréso Agefice (2).xlsx, toutes années (2024/2025/2026)
 *   2. Pour chaque ligne avec formateur renseigné :
 *      - Match la session par date (±5j) + nom formation
 *      - Si session existe ET n'a pas de SessionTrainer :
 *          → cherche Person par nom (case-insensitive)
 *          → si trouvée : crée SessionTrainer { isPrimary: true, role: 'LEAD' }
 *          → sinon : log "formateur introuvable"
 *      - Si session a déjà des SessionTrainer mais aucun isPrimary :
 *          → promeut le premier en isPrimary=true (résout l'ancien bug)
 *   3. Idempotent : skip si SessionTrainer du même Person existe déjà
 *
 * Lancement :
 *   pnpm --filter @qualiof/db backfill:trainer-treso             # dry-run
 *   pnpm --filter @qualiof/db backfill:trainer-treso -- --apply  # applique
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FILE = path.join(ROOT, 'Tréso Agefice (2).xlsx');
const APPLY = process.argv.includes('--apply');

const prisma = new PrismaClient();

interface TresoRow {
  year: number;
  rowNum: number;
  startDate: Date | null;
  endDate: Date | null;
  formation: string | null;
  formateur: string | null;
}

function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n)) return null;
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function parseFRDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
  return isNaN(d.getTime()) ? null : d;
}

function parseFormationRange(
  rawValue: unknown,
  fallbackYear?: number,
): { start: Date | null; end: Date | null } {
  if (rawValue == null || rawValue === '') return { start: null, end: null };
  if (typeof rawValue === 'number') {
    const d = excelSerialToDate(rawValue);
    return { start: d, end: d };
  }
  const str = String(rawValue).trim();
  const rangeFull = str.match(/(\d{1,2})(?:\/(\d{1,2}))?\s*au\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (rangeFull) {
    const dStart = parseInt(rangeFull[1]!, 10);
    const mStart = parseInt(rangeFull[2] ?? rangeFull[4]!, 10);
    const dEnd = parseInt(rangeFull[3]!, 10);
    const mEnd = parseInt(rangeFull[4]!, 10);
    let year = parseInt(rangeFull[5]!, 10);
    if (year < 100) year += 2000;
    return {
      start: new Date(Date.UTC(year, mStart - 1, dStart)),
      end: new Date(Date.UTC(year, mEnd - 1, dEnd)),
    };
  }
  if (fallbackYear) {
    const rangeNoYear = str.match(/(\d{1,2})(?:\/(\d{1,2}))?\s*au\s*(\d{1,2})\/(\d{1,2})\b/i);
    if (rangeNoYear) {
      const dStart = parseInt(rangeNoYear[1]!, 10);
      const mStart = parseInt(rangeNoYear[2] ?? rangeNoYear[4]!, 10);
      const dEnd = parseInt(rangeNoYear[3]!, 10);
      const mEnd = parseInt(rangeNoYear[4]!, 10);
      return {
        start: new Date(Date.UTC(fallbackYear, mStart - 1, dStart)),
        end: new Date(Date.UTC(fallbackYear, mEnd - 1, dEnd)),
      };
    }
    const conjMatch = str.match(/(\d{1,2})\s*(?:et|,)\s*(\d{1,2})\/(\d{1,2})\b/i);
    if (conjMatch) {
      const dStart = parseInt(conjMatch[1]!, 10);
      const dEnd = parseInt(conjMatch[2]!, 10);
      const month = parseInt(conjMatch[3]!, 10);
      return {
        start: new Date(Date.UTC(fallbackYear, month - 1, dStart)),
        end: new Date(Date.UTC(fallbackYear, month - 1, dEnd)),
      };
    }
  }
  const single = parseFRDate(str);
  if (single) return { start: single, end: single };
  return { start: null, end: null };
}

function readSheet(wb: XLSX.WorkBook, sheetName: string, year: number): TresoRow[] {
  const sh = wb.Sheets[sheetName];
  if (!sh) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: null });
  const headers = (aoa[0] ?? []).map((h) =>
    typeof h === 'string' ? h.replace(/\n+/g, ' ').trim() : h,
  );
  const idx = (label: string) => headers.findIndex((h) => h === label);

  const cDateFormation = idx('Date de la formation');
  const cFormation = idx('Nom de la formation');
  const cFormateur = idx('Nom du formateur');

  const rows: TresoRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((v) => v == null || v === '')) continue;
    const { start, end } = parseFormationRange(r[cDateFormation], year);
    if (!start) continue;
    rows.push({
      year,
      rowNum: i + 1,
      startDate: start,
      endDate: end,
      formation: cFormation !== -1 ? (r[cFormation] as string | null)?.toString().trim() ?? null : null,
      formateur:
        cFormateur !== -1 ? (r[cFormateur] as string | null)?.toString().trim() ?? null : null,
    });
  }
  return rows;
}

function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match flou Person par nom complet. Le Tréso donne "Prénom NOM" ou "NOM Prénom".
 * On normalise + on compare en cherchant que tous les tokens du nom Tréso soient
 * dans le firstName+lastName du Person (ordre indifférent).
 */
async function findPersonByName(
  rawName: string,
  tenantId: string,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const norm = normalizeName(rawName);
  if (!norm) return null;
  const tokens = norm.split(' ').filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;

  // Cherche large : toute Person dont firstName OU lastName contient un des tokens.
  const candidates = await prisma.person.findMany({
    where: {
      tenantId,
      archived: false,
      OR: tokens.flatMap((t) => [
        { firstName: { contains: t, mode: 'insensitive' as const } },
        { lastName: { contains: t, mode: 'insensitive' as const } },
      ]),
    },
    select: { id: true, firstName: true, lastName: true },
    take: 50,
  });

  // Filtre strict : tous les tokens du nom Tréso doivent être présents dans
  // la concat firstName+lastName du Person.
  for (const c of candidates) {
    const cNorm = normalizeName(`${c.firstName} ${c.lastName}`);
    if (tokens.every((t) => cNorm.includes(t))) {
      return c;
    }
  }
  return null;
}

interface MatchResult {
  treso: TresoRow;
  sessionId: string | null;
  sessionCode: string | null;
  trainerCreated: boolean;
  primaryPromoted: boolean;
  reason:
    | 'no-formateur'
    | 'no-session'
    | 'multiple-sessions'
    | 'person-not-found'
    | 'already-has-trainer'
    | 'created'
    | 'promoted-primary';
}

async function main() {
  console.log(`\n👨‍🏫 Backfill formateurs sur sessions depuis Tréso AGEFICE`);
  console.log(`    Source : ${FILE}`);
  console.log(`    Mode   : ${APPLY ? '🔥 APPLY' : '👁️  DRY-RUN'}\n`);

  if (!fs.existsSync(FILE)) {
    console.error(`❌ Fichier introuvable : ${FILE}`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({ where: { name: 'Start Academy' } });
  if (!tenant) {
    console.error('❌ Tenant Start Academy introuvable');
    process.exit(1);
  }

  const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: false });
  const allRows: TresoRow[] = [];
  for (const sheetName of wb.SheetNames) {
    const yearMatch = sheetName.match(/(\d{4})/);
    if (!yearMatch) continue;
    allRows.push(...readSheet(wb, sheetName, parseInt(yearMatch[1]!, 10)));
  }
  console.log(`📊 Lignes parsées : ${allRows.length}`);

  // Dédoublonnage : on group by (sessionStartDate, formationName, formateur) pour
  // ne pas tenter de matcher plusieurs fois la même session.
  const seen = new Set<string>();
  const dedupedRows: TresoRow[] = [];
  for (const row of allRows) {
    if (!row.formateur || !row.startDate) continue;
    const key = `${row.startDate.toISOString().slice(0, 10)}|${row.formation ?? ''}|${row.formateur}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRows.push(row);
  }
  console.log(`📊 Lignes uniques avec formateur : ${dedupedRows.length}\n`);

  const results: MatchResult[] = [];
  const personCache = new Map<string, { id: string; firstName: string; lastName: string } | null>();

  for (const row of dedupedRows) {
    if (!row.formateur) {
      results.push({
        treso: row,
        sessionId: null,
        sessionCode: null,
        trainerCreated: false,
        primaryPromoted: false,
        reason: 'no-formateur',
      });
      continue;
    }

    // 1. Match session par dates ±5j (en ignorant l'heure)
    const min = new Date(row.startDate!);
    min.setUTCDate(min.getUTCDate() - 5);
    const max = new Date(row.startDate!);
    max.setUTCDate(max.getUTCDate() + 5);

    const sessions = await prisma.trainingSession.findMany({
      where: {
        tenantId: tenant.id,
        startDate: { gte: min, lte: max },
      },
      select: {
        id: true,
        code: true,
        name: true,
        product: { select: { title: true } },
        trainers: { select: { id: true, personId: true, isPrimary: true } },
      },
    });

    if (sessions.length === 0) {
      results.push({
        treso: row,
        sessionId: null,
        sessionCode: null,
        trainerCreated: false,
        primaryPromoted: false,
        reason: 'no-session',
      });
      continue;
    }

    // Si plusieurs sessions sur la plage, on tente de filtrer par nom de formation
    let matchedSession = sessions[0]!;
    if (sessions.length > 1) {
      const formationNorm = normalizeName(row.formation ?? '');
      const byName = sessions.find((s) => {
        const sNorm = normalizeName((s.product?.title ?? s.name ?? '') as string);
        return formationNorm && sNorm.includes(formationNorm.split(' ')[0]!);
      });
      if (byName) matchedSession = byName;
    }

    // 2. Person par nom formateur (avec cache)
    let person = personCache.get(row.formateur);
    if (person === undefined) {
      person = await findPersonByName(row.formateur, tenant.id);
      personCache.set(row.formateur, person);
    }

    if (!person) {
      results.push({
        treso: row,
        sessionId: matchedSession.id,
        sessionCode: matchedSession.code,
        trainerCreated: false,
        primaryPromoted: false,
        reason: 'person-not-found',
      });
      continue;
    }

    // 3. Cas 1 : session sans aucun SessionTrainer → on crée
    if (matchedSession.trainers.length === 0) {
      if (APPLY) {
        await prisma.sessionTrainer.create({
          data: {
            sessionId: matchedSession.id,
            personId: person.id,
            role: 'LEAD',
            isPrimary: true,
          },
        });
      }
      results.push({
        treso: row,
        sessionId: matchedSession.id,
        sessionCode: matchedSession.code,
        trainerCreated: true,
        primaryPromoted: false,
        reason: 'created',
      });
      continue;
    }

    // 4. Cas 2 : déjà des trainers, vérifier si Person existe dedans
    const existingForPerson = matchedSession.trainers.find((t) => t.personId === person!.id);
    if (existingForPerson) {
      // Si pas isPrimary et qu'aucun n'est primary → on le promeut
      const anyPrimary = matchedSession.trainers.some((t) => t.isPrimary);
      if (!existingForPerson.isPrimary && !anyPrimary) {
        if (APPLY) {
          await prisma.sessionTrainer.update({
            where: { id: existingForPerson.id },
            data: { isPrimary: true, role: 'LEAD' },
          });
        }
        results.push({
          treso: row,
          sessionId: matchedSession.id,
          sessionCode: matchedSession.code,
          trainerCreated: false,
          primaryPromoted: true,
          reason: 'promoted-primary',
        });
      } else {
        results.push({
          treso: row,
          sessionId: matchedSession.id,
          sessionCode: matchedSession.code,
          trainerCreated: false,
          primaryPromoted: false,
          reason: 'already-has-trainer',
        });
      }
      continue;
    }

    // 5. Cas 3 : Person pas dans les trainers de la session → on ajoute en co (sauf si aucun isPrimary)
    const anyPrimary = matchedSession.trainers.some((t) => t.isPrimary);
    if (APPLY) {
      await prisma.sessionTrainer.create({
        data: {
          sessionId: matchedSession.id,
          personId: person.id,
          role: anyPrimary ? 'CO' : 'LEAD',
          isPrimary: !anyPrimary,
        },
      });
    }
    results.push({
      treso: row,
      sessionId: matchedSession.id,
      sessionCode: matchedSession.code,
      trainerCreated: true,
      primaryPromoted: false,
      reason: 'created',
    });
  }

  // Bonus : promotion isPrimary sur les sessions où aucun SessionTrainer.isPrimary
  // (cas créées par sessions-create.ts avant le fix 2026-06-04, sans rapport Tréso).
  const sessionsNoPrimary = await prisma.trainingSession.findMany({
    where: {
      tenantId: tenant.id,
      trainers: {
        some: {},
        none: { isPrimary: true },
      },
    },
    select: { id: true, code: true, trainers: { select: { id: true }, take: 1 } },
  });
  let bonusPromoted = 0;
  for (const s of sessionsNoPrimary) {
    if (s.trainers.length === 0) continue;
    if (APPLY) {
      await prisma.sessionTrainer.update({
        where: { id: s.trainers[0]!.id },
        data: { isPrimary: true, role: 'LEAD' },
      });
    }
    bonusPromoted++;
  }

  // ─── Rapport ──────────────────────────────────────────────────────────
  const created = results.filter((r) => r.reason === 'created').length;
  const promoted = results.filter((r) => r.reason === 'promoted-primary').length;
  const personNotFound = results.filter((r) => r.reason === 'person-not-found');
  const noSession = results.filter((r) => r.reason === 'no-session').length;
  const already = results.filter((r) => r.reason === 'already-has-trainer').length;

  console.log(`📈 Résultat :`);
  console.log(`  ✅ SessionTrainer créés      : ${created}`);
  console.log(`  ⭐ isPrimary promus (Tréso) : ${promoted}`);
  console.log(`  ⭐ isPrimary promus (bonus): ${bonusPromoted}`);
  console.log(`  ↪️  Déjà OK                  : ${already}`);
  console.log(`  ❌ Session non trouvée      : ${noSession}`);
  console.log(`  ❌ Formateur introuvable    : ${personNotFound.length}\n`);

  if (personNotFound.length > 0) {
    console.log(`📋 Formateurs introuvables (à créer manuellement) :`);
    const uniqueNames = new Set(personNotFound.map((r) => r.treso.formateur));
    for (const name of uniqueNames) {
      console.log(`    - ${name}`);
    }
    console.log();
  }

  // ─── CSV de revue (ajout 09.2 formateurs — REPORTING SEUL) ──────────────
  // GARDE-FOU : la logique de matching/sélection ci-dessus n'est PAS modifiée
  // (interdiction d'élargir le matching). Ce bloc est purement lecture : il
  // construit un CSV de revue par session DEPUIS `results` (= décisions réelles
  // que --apply exécutera) pour relecture humaine AVANT tout apply. Le CSV
  // reflète donc exactement ce que l'apply fera.
  const CSV_PATH = '/tmp/backfill-trainer-review-09.2.csv';
  const fmtD = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Métadonnées des sessions citées dans les résultats (re-query lecture).
  const sidList = [...new Set(results.map((r) => r.sessionId).filter((x): x is string => !!x))];
  const sMeta = new Map<
    string,
    { code: string; name: string | null; title: string | null; start: Date; end: Date | null }
  >();
  if (sidList.length) {
    const ss = await prisma.trainingSession.findMany({
      where: { id: { in: sidList } },
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        endDate: true,
        product: { select: { title: true } },
      },
    });
    for (const s of ss)
      sMeta.set(s.id, {
        code: s.code,
        name: s.name,
        title: s.product?.title ?? null,
        start: s.startDate,
        end: s.endDate,
      });
  }

  // Confiance indicative : nb de sessions dans la fenêtre ±5j (re-query lecture).
  // HAUTE = 1 seule session (date non ambiguë). A_VERIFIER = plusieurs (point
  // fragile = cause des 132 lignes perdues ; à relire en priorité).
  async function windowCount(row: TresoRow): Promise<number> {
    if (!row.startDate) return 0;
    const min = new Date(row.startDate);
    min.setUTCDate(min.getUTCDate() - 5);
    const max = new Date(row.startDate);
    max.setUTCDate(max.getUTCDate() + 5);
    return prisma.trainingSession.count({
      where: { tenantId: tenant.id, startDate: { gte: min, lte: max } },
    });
  }

  const header = [
    'action',
    'confiance',
    'session_code',
    'date_debut',
    'date_fin',
    'intitule',
    'formateur_treso',
    'person_proposee_base',
    'source_treso',
  ];
  const lines: string[] = [header.join(',')];

  for (const r of results) {
    const meta = r.sessionId ? sMeta.get(r.sessionId) : undefined;
    const person = r.treso.formateur ? personCache.get(r.treso.formateur) : null;
    const personName = person ? `${person.firstName} ${person.lastName}` : '';
    const src = `Tréso ${r.treso.year} L${r.treso.rowNum}`;
    let action: string;
    if (r.reason === 'created') action = 'CREER_TRAINER';
    else if (r.reason === 'promoted-primary') action = 'PROMOUVOIR_PRIMARY';
    else if (r.reason === 'already-has-trainer') action = 'DEJA_OK';
    else if (r.reason === 'person-not-found') action = 'FORMATEUR_INTROUVABLE_BASE';
    else if (r.reason === 'no-session') action = 'TRESO_SANS_SESSION';
    else action = r.reason;

    let conf = '';
    if (action === 'CREER_TRAINER' || action === 'PROMOUVOIR_PRIMARY' || action === 'DEJA_OK') {
      const n = await windowCount(r.treso);
      conf = n <= 1 ? 'HAUTE' : 'A_VERIFIER';
    }
    lines.push(
      [
        action,
        conf,
        esc(meta?.code ?? r.sessionCode ?? ''),
        fmtD(meta?.start ?? r.treso.startDate),
        fmtD(meta?.end ?? r.treso.endDate),
        esc(meta?.title ?? meta?.name ?? r.treso.formation ?? ''),
        esc(r.treso.formateur ?? ''),
        esc(personName),
        esc(src),
      ].join(','),
    );
  }

  // Sessions sans formateur primary NON couvertes par un match Tréso.
  const coveredIds = new Set(
    results.map((r) => r.sessionId).filter((x): x is string => !!x),
  );
  const orphanSessions = await prisma.trainingSession.findMany({
    where: { tenantId: tenant.id, trainers: { none: { isPrimary: true } } },
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      endDate: true,
      product: { select: { title: true } },
      trainers: { select: { id: true }, take: 1 },
    },
    orderBy: { startDate: 'asc' },
  });
  let aSaisir = 0;
  let bonusLines = 0;
  for (const s of orphanSessions) {
    if (coveredIds.has(s.id)) continue;
    const row = [
      '',
      '',
      esc(s.code),
      fmtD(s.startDate),
      fmtD(s.endDate),
      esc(s.product?.title ?? s.name ?? ''),
      '',
      '',
      '',
    ];
    if (s.trainers.length > 0) {
      // Promotion isPrimary "bonus" (déterministe, hors Tréso) que l'apply fera.
      row[0] = 'PROMOUVOIR_PRIMARY_BONUS';
      row[1] = 'HAUTE';
      row[8] = '(promotion isPrimary hors Tréso)';
      bonusLines++;
    } else {
      row[0] = 'A_SAISIR_MAIN';
      aSaisir++;
    }
    lines.push(row.join(','));
  }

  fs.writeFileSync(CSV_PATH, lines.join('\n'));
  console.log(
    `📄 CSV de revue : ${CSV_PATH}  (${lines.length - 1} lignes — ${aSaisir} à saisir à la main, ${bonusLines} promotions bonus)`,
  );

  if (!APPLY) {
    console.log(`👁️  Mode dry-run — relance avec --apply pour écrire en base.\n`);
  } else {
    console.log(`🔥 Modifications appliquées en base.\n`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
