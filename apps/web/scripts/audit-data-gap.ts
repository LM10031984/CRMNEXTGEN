// audit-data-gap.ts — Audit d'écart local↔cloud, LECTURE SEULE STRICTE (Phase 22, D-01).
//
// Compare le Postgres local Docker (figé au dump du 2026-07-03) à la base cloud
// Supabase (vivante depuis la Phase 19) et prouve qu'AUCUNE donnée locale n'est
// postérieure au dump. Les déltas cloud (count cloud > count local) sont ATTENDUS
// (E2E 21-05/21-06, backfill storage 21-02, régénérations post-dump) : ils sont
// listés à titre informatif et ne font PAS échouer le verdict.
//
// Usage :
//   LOCAL_DATABASE_URL=postgresql://qualiof:qualiof_dev@localhost:5432/qualiof \
//   CLOUD_DATABASE_URL=<DIRECT_URL du .env racine> \
//   pnpm tsx apps/web/scripts/audit-data-gap.ts
//
// ⚠ Le `.env` racine pointe le CLOUD depuis la Phase 19 : l'URL LOCALE doit être
//   passée EXPLICITEMENT via LOCAL_DATABASE_URL — jamais lue du .env (Pitfall 9).
//
// Garanties lecture seule :
//   - uniquement des SELECT via $queryRawUnsafe (information_schema, count, max) ;
//   - aucune écriture d'aucune sorte, sur aucune des deux bases ;
//   - comptages exacts count(*) — jamais reltuples (Pitfall 9).
//
// Verdict machine-checkable :
//   - exit 0  : PASS — aucune table locale avec max(createdAt/updatedAt) > DUMP_DATE ;
//   - exit 1  : FAIL — au moins une donnée locale postérieure au dump ;
//   - exit 2  : erreur de configuration (URL manquante ou garde anti-inversion).

import { PrismaClient } from '@qualiof/db';

// ---------------------------------------------------------------------------
// Gardes de démarrage
// ---------------------------------------------------------------------------

const LOCAL_URL = process.env.LOCAL_DATABASE_URL;
const CLOUD_URL = process.env.CLOUD_DATABASE_URL;

if (!LOCAL_URL) {
  console.error(
    'ERREUR : LOCAL_DATABASE_URL absent. Passer explicitement l’URL du Postgres local Docker ' +
      '(postgresql://qualiof:qualiof_dev@localhost:5432/qualiof). Le .env pointe le CLOUD — refus de démarrer.',
  );
  process.exit(2);
}
if (LOCAL_URL.toLowerCase().includes('supabase')) {
  console.error(
    'ERREUR (garde anti-inversion) : LOCAL_DATABASE_URL contient « supabase » — ' +
      'ce n’est PAS la base locale Docker. Refus de démarrer.',
  );
  process.exit(2);
}
if (!CLOUD_URL) {
  console.error('ERREUR : CLOUD_DATABASE_URL absent (utiliser la valeur DIRECT_URL du .env racine).');
  process.exit(2);
}

// Date du dump de référence : rien de LOCAL ne doit être postérieur à cette date.
const DUMP_DATE = new Date('2026-07-03T23:59:59Z');

// Table hors verdict timestamps : écart de comptage ATTENDU (local = 29 migrations
// archivées, cloud = baseline 0_init) — notée « informatif » dans le rapport.
const INFORMATIVE_TABLES = new Set(['_prisma_migrations']);

const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const cloud = new PrismaClient({ datasources: { db: { url: CLOUD_URL } } });

// ---------------------------------------------------------------------------
// Helpers lecture seule
// ---------------------------------------------------------------------------

const SAFE_IDENT = /^[A-Za-z0-9_]+$/;

async function listTables(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

async function listTimestampColumns(client: PrismaClient): Promise<Map<string, Set<string>>> {
  const rows = await client.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name IN ('createdAt', 'updatedAt')`,
  );
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.table_name)) map.set(r.table_name, new Set());
    map.get(r.table_name)!.add(r.column_name);
  }
  return map;
}

async function countRows(client: PrismaClient, table: string): Promise<number> {
  // Comptage EXACT (jamais reltuples).
  const rows = await client.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "${table}"`,
  );
  return rows[0]?.n ?? 0;
}

async function maxTimestamp(client: PrismaClient, table: string, column: string): Promise<Date | null> {
  const rows = await client.$queryRawUnsafe<{ m: Date | null }[]>(
    `SELECT max("${column}") AS m FROM "${table}"`,
  );
  return rows[0]?.m ?? null;
}

const fmt = (d: Date | null): string => (d ? d.toISOString() : '—');
const fmtCount = (n: number | null): string => (n === null ? '—' : String(n));

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [localTables, cloudTables] = await Promise.all([listTables(local), listTables(cloud)]);
  const tsColumns = await listTimestampColumns(local);

  const localSet = new Set(localTables);
  const cloudSet = new Set(cloudTables);
  const allTables = [...new Set([...localTables, ...cloudTables])].sort();

  let anyFail = false;
  const lines: string[] = [];

  lines.push(
    '| Table | count_local | count_cloud | delta (cloud−local) | max_local_createdAt | max_local_updatedAt | verdict_table |',
  );
  lines.push('| --- | ---: | ---: | ---: | --- | --- | --- |');

  for (const table of allTables) {
    if (!SAFE_IDENT.test(table)) {
      console.error(`⚠ Table ignorée (identifiant non sûr) : ${JSON.stringify(table)}`);
      continue;
    }

    const inLocal = localSet.has(table);
    const inCloud = cloudSet.has(table);

    const countLocal = inLocal ? await countRows(local, table) : null;
    const countCloud = inCloud ? await countRows(cloud, table) : null;
    const delta = countLocal !== null && countCloud !== null ? countCloud - countLocal : null;

    let maxCreated: Date | null = null;
    let maxUpdated: Date | null = null;
    if (inLocal) {
      const cols = tsColumns.get(table) ?? new Set<string>();
      if (cols.has('createdAt')) maxCreated = await maxTimestamp(local, table, 'createdAt');
      if (cols.has('updatedAt')) maxUpdated = await maxTimestamp(local, table, 'updatedAt');
    }

    let verdict: string;
    if (INFORMATIVE_TABLES.has(table)) {
      verdict = 'informatif (hors verdict — écart migrations attendu : local=archives, cloud=baseline 0_init)';
    } else if (!inLocal) {
      verdict = 'informatif (table cloud seulement)';
    } else if (
      (maxCreated !== null && maxCreated > DUMP_DATE) ||
      (maxUpdated !== null && maxUpdated > DUMP_DATE)
    ) {
      verdict = 'FAIL — donnée locale postérieure au dump';
      anyFail = true;
    } else if (maxCreated === null && maxUpdated === null) {
      verdict = 'PASS (aucune colonne createdAt/updatedAt ou table vide)';
    } else {
      verdict = 'PASS';
    }

    lines.push(
      `| ${table} | ${fmtCount(countLocal)} | ${fmtCount(countCloud)} | ${delta === null ? '—' : delta} | ${fmt(maxCreated)} | ${fmt(maxUpdated)} | ${verdict} |`,
    );
  }

  console.log(`# Audit d'écart local↔cloud (D-01)`);
  console.log('');
  console.log(`- Date d'exécution : ${new Date().toISOString()}`);
  console.log(`- DUMP_DATE de référence : ${DUMP_DATE.toISOString()} (dump du 2026-07-03)`);
  console.log(`- Tables locales : ${localTables.length} — tables cloud : ${cloudTables.length}`);
  console.log('');
  console.log(lines.join('\n'));
  console.log('');

  if (anyFail) {
    console.log(
      '## VERDICT : FAIL — au moins une table locale contient des données postérieures au dump du 2026-07-03.',
    );
    console.log(
      'Le cloud ne peut PAS être déclaré unique source de vérité en l’état : décision utilisateur requise (report manuel ou abandon des lignes fautives).',
    );
  } else {
    console.log('## VERDICT : PASS — aucune donnée locale postérieure au dump du 2026-07-03.');
    console.log(
      'Les déltas cloud > local listés ci-dessus sont attendus (E2E, backfill storage, régénérations post-dump).',
    );
  }

  await local.$disconnect();
  await cloud.$disconnect();
  process.exit(anyFail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Erreur audit-data-gap :', err);
  await local.$disconnect().catch(() => {});
  await cloud.$disconnect().catch(() => {});
  process.exit(2);
});
