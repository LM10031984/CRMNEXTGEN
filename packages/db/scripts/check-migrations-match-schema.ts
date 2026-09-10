/**
 * Garde anti-dérive : les migrations, rejouées pour de vrai, doivent produire
 * EXACTEMENT le schéma déclaré.
 *
 * POURQUOI CE SCRIPT EXISTE (constat du 10/09/2026)
 *
 * La migration du 08/09 créait un index GIN sur `AgeficePointAccueil.
 * departmentsServed`. Le schéma, lui, ne le déclarait pas. Personne ne l'a vu :
 * l'index était bien en base, l'application marchait, les tests passaient. Le
 * premier `prisma migrate dev` venu aurait généré un `DROP INDEX` — l'index qui
 * sert la recherche « quels points d'accueil couvrent ce département » serait
 * tombé en silence, et on l'aurait découvert sur une page devenue lente.
 *
 * POURQUOI `--from-url` ET PAS `--from-migrations`
 *
 * `--from-migrations` rejoue les migrations dans une base fantôme, mais son
 * état interne ne porte PAS les extensions Postgres : il réclame donc toujours
 * `CREATE EXTENSION pg_trgm/pgcrypto/unaccent/uuid-ossp`, même quand la base
 * fantôme les possède physiquement (vérifié le 10/09 : `pg_extension` les
 * contient, et le diff les redemande quand même). Un garde qui tolère ce bruit
 * est un garde qui pourrit — on ne saurait plus distinguer les 4 lignes
 * attendues d'une 5e qui serait, elle, une vraie dérive.
 *
 * `--from-url` sur une base qui a RÉELLEMENT reçu `migrate deploy` n'a pas ce
 * défaut : il introspecte, extensions comprises, et rend « No difference
 * detected ». C'est donc lui qui sert de juge, et le diff doit être VIDE.
 *
 * USAGE
 *
 *   DRIFT_DATABASE_URL=postgresql://…/qualiof_drift pnpm --filter @qualiof/db run check:schema
 *
 * La base visée est RÉINITIALISÉE. Par sécurité, le script refuse toute base
 * dont le nom n'annonce pas qu'elle est jetable (drift / shadow / test / ci).
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Une base jetable s'annonce comme telle. Sinon on ne la touche pas. */
const NOM_JETABLE = /(drift|shadow|test|_ci)(\b|_|$)/i;

function nomDeBase(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

function prisma(args: string[], env: NodeJS.ProcessEnv): { code: number; out: string } {
  try {
    const out = execFileSync('pnpm', ['exec', 'prisma', ...args], {
      cwd: DB_DIR,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/**
 * Crée la base si elle n'existe pas, en passant par la base de maintenance
 * `postgres` du même serveur. Évite d'exiger `psql` sur le runner CI et la
 * ligne de `CREATE DATABASE` à taper à la main en local.
 */
async function creerSiAbsente(url: string, nom: string): Promise<void> {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [nom]);
    if (rowCount === 0) {
      // Le nom vient d'être validé contre NOM_JETABLE ; on le requote quand même.
      await client.query(`CREATE DATABASE "${nom.replace(/"/g, '""')}"`);
      console.log(`→ base « ${nom} » créée`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = process.env.DRIFT_DATABASE_URL;
  if (!url) {
    console.error(
      'DRIFT_DATABASE_URL manquante. Vise une base JETABLE, jamais la prod :\n' +
        '  DRIFT_DATABASE_URL=postgresql://qualiof:qualiof@localhost:5432/qualiof_drift',
    );
    process.exit(1);
  }

  const nom = nomDeBase(url);
  if (!NOM_JETABLE.test(nom)) {
    console.error(
      `Refus : la base « ${nom || '(illisible)'} » ne s'annonce pas comme jetable, et ce script la\n` +
        "RÉINITIALISE. Nomme-la avec drift, shadow, test ou ci — c'est le seul garde-fou entre\n" +
        'cette commande et une base qui compte.',
    );
    process.exit(1);
  }

  const env = { DATABASE_URL: url, DIRECT_URL: url };

  await creerSiAbsente(url, nom);

  console.log(`→ réinitialisation de « ${nom} »`);
  const reset = prisma(['migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], env);
  if (reset.code !== 0) {
    console.error(reset.out);
    process.exit(1);
  }

  console.log('→ diff entre la base ainsi obtenue et le schéma déclaré');
  const diff = prisma(
    [
      'migrate',
      'diff',
      '--from-url',
      url,
      '--to-schema-datamodel',
      './prisma/schema.prisma',
      '--exit-code',
    ],
    env,
  );

  if (diff.code === 0) {
    console.log('\n✅ Aucune dérive : le schéma est exactement ce que les migrations produisent.');
    return;
  }

  console.error(`\n${diff.out}`);
  console.error(
    '❌ DÉRIVE — le schéma et les migrations ne disent pas la même chose.\n\n' +
      "Le diff ci-dessus est ce qu'il faudrait faire à la base issue des migrations pour\n" +
      "retomber sur `schema.prisma`. Deux cas, et un seul est bénin :\n\n" +
      '  · le schéma déclare quelque chose que les migrations ne créent pas\n' +
      "    → il manque une migration : `pnpm --filter @qualiof/db run db:migrate:local`\n\n" +
      "  · les migrations créent quelque chose que le schéma ignore (le cas du 08/09)\n" +
      "    → déclare-le dans `schema.prisma`. NE crée PAS de migration « corrective » :\n" +
      "      elle supprimerait l'objet en production.\n",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
