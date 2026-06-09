// Client Prisma partagé entre apps/web, apps/workers et tout consommateur du repo.
// Pattern singleton pour éviter d'épuiser les connexions Postgres en dev (HMR Next.js).

import { PrismaClient } from '@prisma/client';
import { withTenantValidator } from './tenant-validator';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUnsafe?: PrismaClient;
};

/**
 * Client Prisma "brut" — sans le validator multi-tenant.
 *
 * Réservé aux scripts de migration data, seeds et opérations
 * administratives qui doivent volontairement traverser les tenants
 * (ex: backfill global, audit cross-tenant). Ne PAS utiliser dans
 * les Server Actions / Routes / Workers métier.
 */
export const prismaUnsafe =
  globalForPrisma.prismaUnsafe ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

/**
 * Client Prisma "métier" — protégé par le validator multi-tenant.
 *
 * Sprint 4 : toute opération sur un modèle multi-tenant sans `tenantId`
 * dans son `where`/`data` est loggée en warn (ou refusée en mode strict
 * via `TENANT_VALIDATOR_MODE=strict`). C'est notre filet de sécurité
 * contre les fuites cross-tenant si un dev oublie le scoping.
 */
export const prisma =
  globalForPrisma.prisma ?? (withTenantValidator(prismaUnsafe) as unknown as PrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUnsafe = prismaUnsafe;
}

// Re-export types Prisma pour consommation en aval
export * from '@prisma/client';

// Sprint 1 — Sécurité : helpers chiffrement at-rest (pgcrypto).
// Voir crypto.ts pour les détails.
export {
  encryptSensitive,
  decryptSensitive,
  decryptSensitiveBatch,
  isEncrypted,
} from './crypto';

// Sprint 4 — Robustesse : validator tenant-scoping.
export {
  withTenantValidator,
  MULTI_TENANT_MODELS,
  TENANT_VALIDATOR_EXEMPT,
} from './tenant-validator';
