import { defineConfig } from '@playwright/test';

/**
 * Config Playwright — filet minimal contre le staging déployé (Phase 21, D-10).
 *
 * - Cible DISTANTE : baseURL = STAGING_BASE_URL (défaut localhost:3010, l'instance
 *   dev perso). Exécution À LA DEMANDE, PAS dans le gate PR :
 *   `STAGING_BASE_URL=https://qualiof.vercel.app pnpm --filter @qualiof/web exec \
 *      dotenv -e ../../.env -- playwright test`
 * - PAS de webServer : la cible est un déploiement distant (D-10).
 * - testDir `e2e/` est HORS du glob vitest (`src/**`, `scripts/**`) → aucune
 *   collision de runners.
 * - Auth par storageState : le projet `setup` fait un VRAI login UI (preuve
 *   APP-02 cookie session) et persiste `e2e/.auth/user.json` (gitignoré).
 * - Le projet `logout` n'a PAS de storageState : il fait un login FRAIS dans le
 *   spec — `logoutAction` n'invalide que SA session Lucia, donc il ne casse pas
 *   la session partagée du projet `authenticated`.
 * - Si Vercel Deployment Protection est active : poser
 *   VERCEL_AUTOMATION_BYPASS_SECRET (header x-vercel-protection-bypass).
 */
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  // `open: 'never'` : le serveur HTML auto-servi sur échec BLOQUE les runs
  // automatisés (constat 21-06) — le rapport reste écrit dans playwright-report/.
  reporter: [['list'], ['html', { open: 'never' }]],
  // Cible distante partagée + rate-limit WAF sur /preinscription (30 req/60 s,
  // D-13) : on sérialise pour rester déterministe sous la fenêtre.
  workers: 1,
  use: {
    baseURL: process.env.STAGING_BASE_URL ?? 'http://localhost:3010',
    trace: 'retain-on-failure',
    ...(bypassSecret
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } }
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
