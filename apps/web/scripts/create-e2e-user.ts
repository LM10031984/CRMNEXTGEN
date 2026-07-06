/**
 * Crée (upsert idempotent) le user e2e dédié aux tests Playwright — Phase 21 plan 21-05.
 *
 * Règles :
 *  - Compte DÉDIÉ `e2e@start-academy.fr` (rôle ADMIN) — on n'utilise JAMAIS les
 *    credentials de Laurent ni le compte admin de prod dans les tests.
 *  - Le mot de passe vient de `E2E_LOGIN_PASSWORD` (env locale, gitignorée) —
 *    jamais commité, jamais loggé (0 PII en sortie).
 *  - Worker/CLI-safe : imports UNIQUEMENT `@qualiof/db` + `argon2` + node:url —
 *    AUCUN import React / next / lib auth (règle worker).
 *
 * Exécution (contre la base pointée par le .env racine) :
 *   pnpm --filter @qualiof/web exec dotenv -e ../../.env -- tsx scripts/create-e2e-user.ts
 */
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import { prisma } from '@qualiof/db';

export const E2E_USER_EMAIL = 'e2e@start-academy.fr';

export async function upsertE2eUser(): Promise<void> {
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_LOGIN_PASSWORD manquant — ajouter E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD au .env racine (gitignoré).',
    );
  }

  const tenant = await prisma.tenant.findFirstOrThrow();
  const hashedPwd = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    create: {
      tenantId: tenant.id,
      email: E2E_USER_EMAIL,
      hashedPwd,
      firstName: 'E2E',
      lastName: 'Test',
      role: 'ADMIN',
    },
    update: {
      hashedPwd,
      role: 'ADMIN',
      disabledAt: null,
    },
  });

  // 0 PII : on ne logge ni email ni mot de passe, juste l'id technique.
  console.log(`[create-e2e-user] upsert OK (user id=${user.id}, role=ADMIN)`);
}

// Garde d'entrée robuste aux espaces/%20 dans le chemin (leçon Phase 18).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  upsertE2eUser()
    .catch((err) => {
      console.error('[create-e2e-user] FAILED:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
