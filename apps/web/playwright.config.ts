import { assertTestTarget } from '../../packages/db/scripts/assert-test-target';
assertTestTarget({ databaseUrl: process.env.DATABASE_URL, baseUrl: process.env.STAGING_BASE_URL ?? 'http://127.0.0.1:3011' });
import { defineConfig } from '@playwright/test';

/**
 * Correction du 17/09/2026 : l'ancienne instruction « Cible DISTANTE » visait
 * un staging devenu production. Serveur local dédié désormais, sans réutiliser
 * une instance en cours et sans charger les fichiers .env de déploiement.
 * La cible ET sa population sont validées avant les fixtures et l'authentification.
 */
const baseURL = process.env.STAGING_BASE_URL ?? 'http://127.0.0.1:3011';
if (baseURL !== 'http://127.0.0.1:3011') throw new Error('REFUS E2E : utiliser le serveur dédié http://127.0.0.1:3011.');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3011',
    url: baseURL,
    reuseExistingServer: false,
    env: {
      QUALIOF_E2E: '1', DATABASE_URL: process.env.DATABASE_URL!, DIRECT_URL: process.env.DATABASE_URL!,
      STORAGE_PROVIDER: 'minio', S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_ACCESS_KEY: 'qualiof', S3_SECRET_KEY: 'qualiof_dev_minio',
      SMTP_HOST: '', GOOGLE_OAUTH_REFRESH_TOKEN: '',
    },
  },
  timeout: 60_000,
  retries: 1,
  // `open: 'never'` : le serveur HTML auto-servi sur échec BLOQUE les runs
  // automatisés (constat 21-06) — le rapport reste écrit dans playwright-report/.
  reporter: [['list'], ['html', { open: 'never' }]],
  // Cible distante partagée + rate-limit WAF sur /preinscription (30 req/60 s,
  // D-13) : on sérialise pour rester déterministe sous la fenêtre.
  workers: 1,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // Sandbox d'audit : Chromium préinstallé hors du cache Playwright standard.
    ...(process.env.PW_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH } }
      : {}),

  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'anonymous', testMatch: /smoke-routes\.spec\.ts/, grep: /@anon/ },
    // logout : SANS storageState — login frais dans le spec, sa déconnexion
    // n'invalide que sa propre session Lucia (lucia.invalidateSession(sessionId)).
    { name: 'logout', testMatch: /auth-logout\.spec\.ts/ },
    {
      name: 'authenticated',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
      testMatch: /(smoke-routes|upload-preenrollment|closure-flow)\.spec\.ts/,
      grepInvert: /@anon/,
    },
  ],
});
