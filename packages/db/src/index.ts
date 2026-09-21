// Client Prisma partagé entre apps/web, apps/workers et tout consommateur du repo.
// Pattern singleton pour éviter d'épuiser les connexions Postgres en dev (HMR Next.js).

import { PrismaClient } from '@prisma/client';

import { analyserCible, masquer } from '../scripts/assert-db-target';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Le dernier rempart : pendant les tests, on n'ouvre pas de connexion distante.
 *
 * POURQUOI ICI, ET PAS DANS UNE CONFIG
 *
 * Le `.env` racine porte l'URL Supabase de PRODUCTION. Les suites sont déjà
 * assainies — `scripts/unit-test-env.ts` ferme le port dans chaque worker
 * Vitest — mais cette protection vit dans une config, et une config se
 * contourne sans le vouloir : `vitest.integration.config.ts` remet
 * `setupFiles: []`, un script appelle `vitest` autrement, quelqu'un ajoute un
 * chemin d'appel. Un garde par config en laisse toujours un ouvert. C'est le
 * raisonnement déjà écrit en tête de `assert-db-target.ts`, appliqué cette fois
 * à la connexion elle-même — le seul endroit par lequel tout le monde passe.
 *
 * AUCUNE PORTE DE SORTIE. `assertCibleAutorisee` accepte `SEED_ALLOW_PROD=1`
 * parce qu'écrire en production est parfois l'opération voulue. Ici, jamais :
 * un test qui vise la production est un test à réécrire, pas à autoriser.
 *
 * Une URL absente ne déclenche rien : il n'y a pas d'hôte distant à refuser, et
 * Prisma échouera de lui-même. Le garde répond à une seule question — « ce
 * numéro est-il local ? » — et se tait sur tout le reste.
 */
export function refuserBaseDistanteEnTest(url: string | undefined, origine: string): void {
  const enTest = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';
  if (!enTest || !url) return;

  // `new URL()` rend « [::1] » avec ses crochets là où la liste d'hôtes locaux
  // de `analyserCible` porte « ::1 » : sans ce décrochetage, la boucle locale
  // IPv6 passerait pour distante et un test légitime serait refusé.
  let hote: string | null = null;
  try {
    hote = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    hote = null;
  }
  if (hote !== null && ['localhost', '127.0.0.1', '::1'].includes(hote)) return;

  const cible = analyserCible(url);
  if (cible.autorisee) return;

  throw new Error(
    `REFUS : base distante interdite pendant les tests — ${cible.motif}.\n` +
      `  Origine : ${origine}\n` +
      `  Cible   : ${masquer(url)}\n` +
      `  Un test vise une base locale dédiée. Voir TEST_DATABASE_URL, et\n` +
      `  createPrismaClientForUrl(process.env.TEST_DATABASE_URL) plutôt que le\n` +
      `  client partagé, qui suit DATABASE_URL.`,
  );
}

// [AUDIT-SANDBOX] PRISMA_USE_PG_ADAPTER=1 → moteur WASM + driver adapter pg
// (environnement d'audit cloud sans accès aux binaires natifs Prisma).
// Par défaut (flag absent) : client natif inchangé — comportement identique
// en dev Mac et en prod cloud. Ce bloc est neutre hors sandbox.
function createClient(): PrismaClient {
  refuserBaseDistanteEnTest(process.env.DATABASE_URL, 'client partagé @qualiof/db (DATABASE_URL)');
  const log: ('warn' | 'error')[] = ['warn', 'error'];
  if (process.env.PRISMA_USE_PG_ADAPTER === '1') {
    // Ancrage de résolution : PRISMA_ADAPTER_RESOLVE_FROM (chemin du package db
    // sur disque) car après bundling Next, import.meta.url pointe dans .next/.
    // process.getBuiltinModule : échappe à la réécriture webpack de
    // `createRequire` (argument non statique non supporté).
    const anchor = process.env.PRISMA_ADAPTER_RESOLVE_FROM || process.cwd() + '/index.js';
    const nodeModule = (
      process as unknown as {
        getBuiltinModule: (m: string) => typeof import('node:module');
      }
    ).getBuiltinModule('node:module');
    const req = nodeModule.createRequire(anchor);
    // Spécificateurs calculés : webpack (next build) ne doit PAS suivre ces
    // requires — résolution au runtime Node uniquement (sandbox d'audit).
    const wasmSpec = ['@prisma', 'client', 'wasm'].join('/');
    const adapterSpec = ['@prisma', 'adapter-pg'].join('/');
    const pgSpec = ['p', 'g'].join('');
    const { PrismaClient: WasmPrismaClient } = req(wasmSpec);
    const { PrismaPg } = req(adapterSpec);
    const pg = req(pgSpec);
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    const adapter = new PrismaPg(pool);
    return new WasmPrismaClient({ adapter, log }) as unknown as PrismaClient;
  }
  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? createClient();

/**
 * Client Prisma pour une URL explicite (tests d'intégration, scripts
 * local↔cloud). Respecte PRISMA_USE_PG_ADAPTER=1 (sandbox d'audit).
 */
export function createPrismaClientForUrl(url: string): PrismaClient {
  refuserBaseDistanteEnTest(url, 'createPrismaClientForUrl');
  if (process.env.PRISMA_USE_PG_ADAPTER === '1') {
    const anchor = process.env.PRISMA_ADAPTER_RESOLVE_FROM || process.cwd() + '/index.js';
    const nodeModule = (
      process as unknown as {
        getBuiltinModule: (m: string) => typeof import('node:module');
      }
    ).getBuiltinModule('node:module');
    const req = nodeModule.createRequire(anchor);
    const { PrismaClient: WasmPrismaClient } = req(['@prisma', 'client', 'wasm'].join('/'));
    const { PrismaPg } = req(['@prisma', 'adapter-pg'].join('/'));
    const pg = req(['p', 'g'].join(''));
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    return new WasmPrismaClient({ adapter: new PrismaPg(pool) }) as unknown as PrismaClient;
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export types Prisma pour consommation en aval
export * from '@prisma/client';
