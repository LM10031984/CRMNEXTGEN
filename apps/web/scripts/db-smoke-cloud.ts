/**
 * Smoke cloud Postgres/Supabase (Phase 19 — 19-01). PREUVE RUNTIME des 4 critères
 * de la phase contre la base pointée par `DATABASE_URL` (poolée :6543) / `DIRECT_URL`.
 *
 * POURQUOI un runner tsx et pas un test Vitest : les critères de succès de la Phase 19
 * sont RUNTIME contre le cloud réel — dans la suite Vitest, Prisma est mocké. Ce script
 * est le CONTRAT/outil exécuté par le plan 19-03 (smoke gaté Laurent) une fois les URLs
 * cloud en place. Ici il est LIVRÉ, pas exécuté (destructif/cloud réel = étape séparée).
 *
 * Les 4 critères prouvés mécaniquement :
 *   #1 Round-trip poolé      → 5 lectures successives révèlent tout « prepared statement
 *                              already exists » du pooler en transaction mode.
 *   #2 Chemin worker         → une transaction interactive Serializable (le pattern EXACT
 *                              de closure/worker.ts:334 bumpAndFinalize) passe sous pooler.
 *   #3 Extensions            → pg_trgm (similarity) + unaccent résolvent au runtime.
 *   #4 INSERT sans collision → toutes les PK sont @default(uuid()) (0 autoincrement dans
 *                              schema.prisma) ; on le PROUVE par un INSERT réel + delete.
 *
 * RGPD : ce script ne loggue JAMAIS de PII (ni nom, ni email, ni contenu de champ métier)
 * — uniquement des IDs (UUID) et des compteurs.
 *
 * Worker/CLI-safe : importe UNIQUEMENT `@qualiof/db` (aucun import React/auth). Le client
 * `prisma` lit `DATABASE_URL` (poolée par défaut) déjà validée au boot (Phase 17).
 */

import { prisma } from '@qualiof/db';
import { pathToFileURL } from 'node:url';

/**
 * Critère #1 — Round-trip poolé. 5 lectures d'affilée sur la connexion poolée :6543.
 * En transaction mode, le pooler recycle les connexions serveur → un prepared statement
 * « s0 » peut survivre d'une requête à l'autre et provoquer
 * `prepared statement "s0" already exists`. 5 hits successifs le révèlent s'il existe.
 */
async function proveRoundTripPooled(): Promise<void> {
  const t = await prisma.tenant.findFirstOrThrow();
  for (let i = 0; i < 5; i++) {
    await prisma.trainingSession.count({ where: { tenantId: t.id } });
  }
  // ID seulement (UUID), jamais le nom du tenant = RGPD.
  console.log('[round-trip] 5 reads OK, tenant=%s', t.id);
}

/**
 * Critère #2 — Chemin worker. Reproduit le pattern EXACT de closure/worker.ts:334
 * `bumpAndFinalize` : `prisma.$transaction(async (tx) => {...}, { isolationLevel:
 * 'Serializable' })`. Prouve qu'une transaction interactive Serializable passe sous
 * le pooler transaction mode :6543 (pitfall #1 recherche). On ne touche PAS de
 * ClosureBatch réel — on ne fait que des count() jetables dans la transaction.
 */
async function proveSerializableInteractiveTx(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.tenant.count();
      await tx.trainingSession.count();
    },
    { isolationLevel: 'Serializable' },
  );
  console.log('[serializable-tx] interactive tx OK under pooler');
}

/**
 * Critère #3 — Extensions. pg_trgm (similarity) + unaccent doivent résoudre au runtime
 * (le search_path inclut le schéma `extensions` de Supabase). similarity('Dupont',
 * 'Dupond') > 0 prouve pg_trgm ; unaccent('Éléonore') === 'Eleonore' prouve unaccent.
 */
async function proveExtensions(): Promise<void> {
  const trg = await prisma.$queryRawUnsafe<{ similarity: number }[]>(
    "SELECT similarity('Dupont','Dupond') AS similarity",
  );
  const ua = await prisma.$queryRawUnsafe<{ unaccent: string }[]>(
    "SELECT unaccent('Éléonore') AS unaccent",
  );
  if (!(Number(trg[0]?.similarity) > 0)) {
    throw new Error('pg_trgm KO: similarity <= 0');
  }
  if (ua[0]?.unaccent !== 'Eleonore') {
    throw new Error('unaccent KO: got ' + ua[0]?.unaccent);
  }
  console.log('[extensions] pg_trgm similarity=%s, unaccent OK', trg[0]?.similarity);
}

/**
 * Critère #4 — INSERT sans collision de PK. Toutes les PK du schéma sont
 * @default(uuid()) (0 `autoincrement()` dans schema.prisma) → la collision de séquence
 * est IMPOSSIBLE : un UUID ne dépend d'aucune séquence Postgres. On le PROUVE néanmoins
 * par un INSERT réel dans AuditLog (table jetable, id UUID) + delete immédiat pour ne
 * pas polluer la base cloud.
 */
async function proveInsertNoPkCollision(): Promise<void> {
  const t = await prisma.tenant.findFirstOrThrow();
  const created = await prisma.auditLog.create({
    data: {
      tenantId: t.id,
      entity: 'DbSmoke',
      entityId: 'db-smoke-cloud',
      action: 'DB_SMOKE_TEST',
      diff: { note: 'transient smoke row — deleted immediately' },
    },
  });
  if (!created.id) {
    throw new Error('INSERT KO: no id');
  }
  // Nettoyage immédiat : ne pas laisser de ligne de test dans la base cloud.
  await prisma.auditLog.delete({ where: { id: created.id } });
  console.log(
    '[insert-test] UUID PK INSERT+delete OK, id=%s (no sequence, no collision)',
    created.id,
  );
}

async function main(): Promise<void> {
  try {
    await proveRoundTripPooled();
    await proveSerializableInteractiveTx();
    await proveExtensions();
    await proveInsertNoPkCollision();
    console.log('[db-smoke] ALL 4 CRITERIA PROVEN');
  } catch (e) {
    console.error('[db-smoke] FAILED:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Garde d'entrée robuste aux espaces (le chemin du repo contient « CRM Next gen » → %20
// dans import.meta.url). pathToFileURL(argv[1]).href produit le même encodage → match.
// NE PAS écrire `import.meta.url === 'file://' + process.argv[1]` (casse sur espaces).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
