/** Correction ciblée PTA83 uniquement. Simulation par défaut ; --apply pour appliquer.
 * --env /external/.env : secrets lus en mémoire, jamais affichés.
 * Aucun accès aux profils, organisations ou personnes.
 */
import { readFile, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const oldCoverage = ['08'];
const desiredCoverage = ['08', '51'];
const apply = process.argv.includes('--apply');
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const envPath = envIndex >= 0 ? args[envIndex + 1] : null;
  if (!envPath) throw new Error('ENV_PATH_REQUIRED');
  const snapshot = JSON.parse(
    await readFile(resolve(root, 'verification/agefice-annuaire-officiel-2026-09-18.json'), 'utf8'),
  );
  const departments = [
    ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter(
      (d) => d !== '20',
    ),
    '2A',
    '2B',
    '971',
    '972',
    '973',
    '974',
    '976',
  ].sort();
  if (
    !Array.isArray(snapshot.successes) ||
    !same([...snapshot.successes].sort(), departments) ||
    !Array.isArray(snapshot.failures) ||
    snapshot.failures.length !== 0
  )
    throw new Error('SNAPSHOT_INCOMPLETE');
  if (snapshot.endpoint !== 'https://communication-agefice.fr/ajax/json.php')
    throw new Error('SNAPSHOT_SOURCE_INVALID');
  const official = snapshot.centres.filter((c: { numberPta: string }) => c.numberPta === '83');
  if (
    official.length !== 1 ||
    !same(official[0].departmentsServed, desiredCoverage) ||
    official[0].name !== 'CCI MARNE ARDENNES' ||
    !official[0].email
  )
    throw new Error('OFFICIAL_PRECONDITION_FAILED');
  const env = parse(await readFile(envPath));
  const url = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  if (['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname))
    throw new Error('LOCAL_TARGET_REFUSED');
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
    statement_timeout: 15000,
  });
  let committed = false;
  try {
    await client.connect();
    await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const current = await client.query(
      `SELECT "name", "email", "departmentsServed" FROM "AgeficePointAccueil" WHERE "numberPta" = $1${apply ? ' FOR UPDATE' : ''}`,
      ['83'],
    );
    if (current.rowCount !== 1) throw new Error('PTA_NOT_UNIQUE');
    const row = current.rows[0];
    if (row.name !== official[0].name || row.email !== official[0].email)
      throw new Error('IDENTITY_CHANGED');
    const before = row.departmentsServed;
    const alreadyCorrect = same(before, desiredCoverage);
    if (!alreadyCorrect && !same(before, oldCoverage)) throw new Error('COVERAGE_CHANGED');
    let affected = 0;
    if (apply && !alreadyCorrect) {
      const updated = await client.query(
        `UPDATE "AgeficePointAccueil" SET "departmentsServed" = $1::text[]
        WHERE "numberPta" = $2 AND "name" = $3 AND "email" = $4 AND "departmentsServed" = $5::text[]
        RETURNING "departmentsServed"`,
        [desiredCoverage, '83', official[0].name, official[0].email, oldCoverage],
      );
      if (updated.rowCount !== 1 || !same(updated.rows[0].departmentsServed, desiredCoverage))
        throw new Error('UPDATE_PRECONDITION_FAILED');
      affected = updated.rowCount;
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    committed = apply;
    // Separate read after COMMIT, not just UPDATE RETURNING.
    const verified = await client.query(
      'SELECT "departmentsServed" FROM "AgeficePointAccueil" WHERE "numberPta" = $1',
      ['83'],
    );
    const expected = apply ? desiredCoverage : before;
    if (verified.rowCount !== 1 || !same(verified.rows[0].departmentsServed, expected))
      throw new Error('READBACK_FAILED');
    const result = {
      mode: apply ? 'apply' : 'dry-run',
      pta: '83',
      affectedRows: affected,
      proposedRows: alreadyCorrect ? 0 : 1,
      before,
      after: verified.rows[0].departmentsServed,
      alreadyCorrect,
      readbackVerified: true,
      profilesModified: 0,
    };
    console.log(JSON.stringify(result));
    await appendFile(
      resolve(root, 'verification/agefice-coverage-correction-2026-09-18.md'),
      `## ${apply ? 'Correction appliquée' : 'Simulation'} — ${new Date().toISOString()}\n\n` +
        `Source : snapshot officiel complet (101 départements, aucun échec), PTA 83 CCI MARNE ARDENNES. Nom et email strictement identiques en base et dans le snapshot.\n\n` +
        `- Lignes modifiées : **${affected}**. Proposition : ${result.proposedRows}.\n` +
        `- Couverture avant : ${before.join(', ')}.\n- Couverture relue après ${apply ? 'COMMIT' : 'ROLLBACK'} : **${result.after.join(', ')}**.\n` +
        `- Déjà corrigé : ${alreadyCorrect ? 'oui' : 'non'}. Relecture vérifiée : oui.\n` +
        `- Seule colonne visée : AgeficePointAccueil.departmentsServed. Aucun profil, organisation ou donnée personne consulté ni modifié.\n\n`,
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (committed)
      console.error(
        'La transaction a été validée ; vérifier la relecture ou le rapport avant toute reprise.',
      );
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : '';
  console.error(/^[A-Z_]+$/.test(msg) ? msg : 'CORRECTION_FAILED_DETAILS_REDACTED');
  process.exitCode = 1;
});
