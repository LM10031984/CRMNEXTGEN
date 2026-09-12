/**
 * Lanceur de requête SQL EN LECTURE SEULE, destiné aux inventaires sur la base
 * de PRODUCTION.
 *
 * Pourquoi il existe : le seul script « prod » du dépôt était `db:smoke:cloud`,
 * qui n'est pas un lanceur de requêtes mais un smoke fixe — et qui fait un
 * INSERT réel (son critère n°4). L'utiliser pour un inventaire aurait écrit en
 * production.
 *
 * Trois verrous, dans cet ordre :
 *  1. le fichier SQL est refusé s'il contient un mot-clé d'écriture ;
 *  2. la connexion passe par DIRECT_URL (:5432), pas par la poolée (:6543) —
 *     pgbouncer en mode transaction ne tient pas les transactions interactives ;
 *  3. la requête tourne dans une transaction `READ ONLY` terminée par un
 *     ROLLBACK : même un ordre d'écriture qui aurait franchi le verrou 1 serait
 *     rejeté par Postgres lui-même.
 *
 * Usage :
 *   pnpm --filter @qualiof/db run db:query:prod -- <chemin.sql>
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

/** Ordres qui écrivent, ou qui modifient la structure. */
const MOTS_INTERDITS =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|reindex|refresh)\b/i;

function masquer(url: string): string {
  return url.replace(/:\/\/[^@]*@/, '://***:***@');
}

async function main(): Promise<void> {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('Usage : db:query:prod -- <chemin.sql>');
    process.exit(1);
  }

  const sql = readFileSync(chemin, 'utf8');

  // VERROU 1 — le contenu. On retire les commentaires avant d'inspecter : un
  // `-- ne pas faire de DELETE ici` ne doit pas bloquer une requête légitime.
  const sansCommentaires = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const interdit = sansCommentaires.match(MOTS_INTERDITS);
  if (interdit) {
    console.error(
      `\n❌ REFUSÉ — « ${interdit[0]} » est un ordre d'écriture.\n` +
        `   Ce lanceur ne sert qu'aux inventaires en lecture seule.\n`,
    );
    process.exit(1);
  }

  // VERROU 2 — la connexion directe. La poolée (:6543) est en mode transaction :
  // elle ne garantit pas qu'un `SET TRANSACTION` tienne jusqu'à la requête.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ Ni DIRECT_URL ni DATABASE_URL.');
    process.exit(1);
  }
  console.log(`🔎 Cible : ${masquer(url)}`);
  console.log('   Mode  : transaction READ ONLY, terminée par ROLLBACK.\n');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // VERROU 3 — Postgres refuse lui-même toute écriture dans cette transaction.
    const lignes = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return (await tx.$queryRawUnsafe(sansCommentaires.trim())) as Record<string, unknown>[];
    });

    console.log(`${lignes.length} ligne(s).\n`);
    if (lignes.length > 0) console.table(lignes);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Échec :', e instanceof Error ? e.message.split('\n')[0] : e);
  process.exit(1);
});
