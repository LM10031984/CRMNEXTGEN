// Client Prisma partagé entre apps/web, apps/workers et tout consommateur du repo.
// Pattern singleton pour éviter d'épuiser les connexions Postgres en dev (HMR Next.js).

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// [AUDIT-SANDBOX] PRISMA_USE_PG_ADAPTER=1 → moteur WASM + driver adapter pg
// (environnement d'audit cloud sans accès aux binaires natifs Prisma).
// Par défaut (flag absent) : client natif inchangé — comportement identique
// en dev Mac et en prod cloud. Ce bloc est neutre hors sandbox.
function createClient(): PrismaClient {
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
