/**
 * Garde-fou de cible de base de données.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * `.env` à la racine porte l'URL Supabase de **production**. Or la quasi-totalité
 * des scripts `db:*` et `import:*` de ce paquet la chargent (`dotenv -e ../../.env`),
 * et `prisma/seed.ts` la charge même en dur. Conséquence : `pnpm db:reset` tapé par
 * réflexe détruisait la base de production, et `pnpm db:seed` y écrivait.
 *
 * Le garde-fou est posé au niveau du CODE, pas du script, parce qu'il existe
 * plusieurs chemins d'appel pour la même opération — `pnpm db:seed`,
 * `pnpm --filter @qualiof/db db:seed`, `prisma db seed`, `tsx prisma/seed.ts` —
 * et qu'un garde-fou par script en laisserait toujours un ouvert.
 *
 * COMMENT LE LEVER
 *
 * Une opération volontaire sur la production s'écrit explicitement :
 *
 *   SEED_ALLOW_PROD=1 pnpm --filter @qualiof/db run db:seed:prod
 *
 * La variable ne doit JAMAIS être posée dans un `.env` : elle vaut pour une
 * commande, tapée en connaissance de cause, pas pour un environnement.
 */

/** Hôtes considérés comme une base de développement locale. */
const HOTES_LOCAUX = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

/**
 * Union discriminée plutôt qu'un `motif: string | null` : elle grave l'invariant
 * « une cible refusée porte toujours un motif », que TypeScript peut alors
 * vérifier au lieu qu'on l'affirme avec un `!`.
 */
export type CibleBase =
  | { autorisee: true; hote: string; base: string; motif: null }
  | { autorisee: false; hote: string; base: string; motif: string };

/** Masque les identifiants d'une URL de connexion avant de l'afficher. */
export function masquer(url: string): string {
  return url.replace(/:\/\/[^@]*@/, '://***:***@');
}

/**
 * Analyse `DATABASE_URL` sans jamais lever : c'est l'appelant qui décide quoi
 * faire du verdict. Rend `autorisee: false` pour toute cible non locale.
 */
export function analyserCible(url: string | undefined): CibleBase {
  if (!url) {
    return { autorisee: false, hote: '(absente)', base: '(absente)', motif: 'DATABASE_URL absente' };
  }

  let hote = '(illisible)';
  let base = '(illisible)';
  try {
    const u = new URL(url);
    hote = u.hostname;
    base = u.pathname.replace(/^\//, '') || '(sans nom)';
  } catch {
    return { autorisee: false, hote, base, motif: 'DATABASE_URL illisible' };
  }

  // Règle explicite demandée : toute URL Supabase est une cible de production.
  if (/supabase/i.test(url)) {
    return { autorisee: false, hote, base, motif: 'cible Supabase (production)' };
  }
  // Défense en profondeur : tout hôte distant, Supabase ou non.
  if (!HOTES_LOCAUX.includes(hote)) {
    return { autorisee: false, hote, base, motif: `hôte distant (${hote})` };
  }

  return { autorisee: true, hote, base, motif: null };
}

/**
 * Refuse une opération d'écriture si la cible n'est pas locale, sauf
 * `SEED_ALLOW_PROD=1`. Termine le processus en code 1 plutôt que de lever :
 * ce garde-fou tourne en tête de scripts CLI, une trace de pile n'aiderait pas.
 */
export function assertCibleAutorisee(operation: string): void {
  const url = process.env.DATABASE_URL;
  const cible = analyserCible(url);

  if (cible.autorisee) {
    console.log(`🛡  ${operation} → base locale « ${cible.base} » sur ${cible.hote}.`);
    return;
  }

  if (process.env.SEED_ALLOW_PROD === '1') {
    console.warn(
      `⚠️  ${operation} → ${cible.motif.toUpperCase()} — autorisé par SEED_ALLOW_PROD=1.\n` +
        `    Base « ${cible.base} » sur ${cible.hote}.`,
    );
    return;
  }

  console.error(
    `\n❌ ${operation} REFUSÉ — ${cible.motif}.\n\n` +
      `   Cible  : ${url ? masquer(url) : '(DATABASE_URL absente)'}\n` +
      `   Base   : ${cible.base} sur ${cible.hote}\n\n` +
      `   Ce dépôt porte l'URL de PRODUCTION dans le .env racine. Les scripts en\n` +
      `   « :local » chargent .env.local en priorité et visent votre base de dev :\n\n` +
      `     pnpm --filter @qualiof/db run db:seed:local\n` +
      `     pnpm --filter @qualiof/db run db:deploy:local\n` +
      `     pnpm --filter @qualiof/db run db:migrate:local\n\n` +
      `   Si l'opération vise VRAIMENT la production, dites-le pour cette commande :\n\n` +
      `     SEED_ALLOW_PROD=1 <votre commande>\n\n` +
      `   Ne posez jamais SEED_ALLOW_PROD dans un fichier .env : elle vaut pour une\n` +
      `   commande tapée en connaissance de cause, pas pour un environnement.\n`,
  );
  process.exit(1);
}

// Exécution directe : `tsx scripts/assert-db-target.ts "<opération>"`, utilisé en
// tête des scripts npm qui appellent le CLI Prisma (lui, on ne peut pas l'instrumenter).
if (process.argv[1] && process.argv[1].endsWith('assert-db-target.ts')) {
  assertCibleAutorisee(process.argv[2] ?? 'Opération base de données');
}
