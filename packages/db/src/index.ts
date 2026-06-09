// Client Prisma partagé entre apps/web, apps/workers et tout consommateur du repo.
// Pattern singleton pour éviter d'épuiser les connexions Postgres en dev (HMR Next.js).

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
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
