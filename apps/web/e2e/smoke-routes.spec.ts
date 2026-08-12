import { test, expect } from '@playwright/test';
import { prisma } from '@qualiof/db';

/**
 * Smoke routes des 4 piliers (TEST-02, D-12) — contre le staging déployé.
 *
 * Deux volets :
 *  - Tests tagués `@anon` (projet `anonymous`, SANS storageState) : les routes
 *    protégées redirigent vers /login ; /login rend le formulaire + bandeau
 *    STAGING (preuve APP-01 runtime) ; le form public /preinscription/[token]
 *    est accessible avec un token valide et refuse proprement un token bidon.
 *  - Tests non tagués (projet `authenticated`, storageState du setup) : les
 *    mêmes routes rendent 200 avec du contenu réel (pas un 200 vide).
 *
 * ⚠ Route publique = /preinscription/[token] — JAMAIS /p/[token] (Pitfall 1).
 * ⚠ Rate-limit WAF D-13 : /preinscription = 30 req/60 s par IP (blocage 403) —
 *   le volet anonyme ne visite /preinscription que 2 fois (token valide + bidon).
 */

/** Les ~9 routes protégées des 4 piliers (D-12) — /app/sessions/[id] résolue au run. */
const PROTECTED_ROUTES: Array<{ route: string; pilier: string }> = [
  { route: '/app', pilier: 'transverse (dashboard)' },
  { route: '/app/sessions', pilier: '#1 pack Qualiopi' },
  { route: '/app/apprenants', pilier: '#3 CRM 360°' },
  { route: '/app/dossiers-opco', pilier: '#2 trésorerie' },
  { route: '/app/budget-agefice', pilier: '#2 trésorerie' },
  { route: '/app/factures', pilier: '#2 trésorerie' },
  { route: '/app/inscriptions', pilier: '#4 pré-inscriptions' },
];

const E2E_TOKEN = `e2e-smoke-${Date.now()}`;
const BOGUS_TOKEN = 'token-bidon-xyz';

let firstSessionId: string;

test.beforeAll(async () => {
  // 1ʳᵉ session réelle pour la route dynamique /app/sessions/[id] — jamais d'id en dur.
  const session = await prisma.trainingSession.findFirst({ select: { id: true } });
  if (!session) throw new Error('Aucune TrainingSession en base — smoke /app/sessions/[id] impossible.');
  firstSessionId = session.id;

  // PreEnrollment minimale de test (multi-tenant : tenantId du 1er Tenant),
  // champs identifiants préfixés E2E-, supprimée en afterAll.
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  await prisma.preEnrollment.create({
    data: {
      tenantId: tenant.id,
      token: E2E_TOKEN,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      firstName: 'E2E-Smoke',
      lastName: 'E2E-Test',
    },
  });
});

test.afterAll(async () => {
  await prisma.preEnrollment.deleteMany({ where: { token: E2E_TOKEN } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Volet anonyme (@anon) — projet `anonymous`, contexte vierge sans cookie
// ---------------------------------------------------------------------------

test('@anon /login rend le formulaire + bandeau STAGING (APP-01)', async ({ page }) => {
  const resp = await page.goto('/login');
  expect(resp?.status()).toBe(200);
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  // Preuve APP-01 runtime : la garde staging est active sur le déploiement.
  // Conditionnel : le bandeau n'existe QUE si la cible est un déploiement
  // staging (E2E_TARGET_ENV=staging). En local/dev, pas de bandeau — le test
  // du formulaire reste couvert ci-dessus.
  if ((process.env.E2E_TARGET_ENV ?? 'staging') === 'staging') {
    await expect(page.getByText('STAGING')).toBeVisible();
  }
});

for (const { route, pilier } of PROTECTED_ROUTES) {
  test(`@anon ${route} redirige vers /login (${pilier})`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  });
}

test('@anon /app/sessions/[id] (1ʳᵉ session) redirige vers /login (#1)', async ({ page }) => {
  await page.goto(`/app/sessions/${firstSessionId}`);
  await expect(page).toHaveURL(/\/login/);
});

test('@anon /preinscription/[token valide] est PUBLIC : 200 + formulaire (#4)', async ({ page }) => {
  const resp = await page.goto(`/preinscription/${E2E_TOKEN}`);
  expect(resp?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();
  await expect(page.getByText('Pré-inscription en ligne')).toBeVisible();
});

test('@anon /preinscription/token-bidon → refus propre (404, pas de formulaire, pas de 500) (#4)', async ({
  page,
}) => {
  const resp = await page.goto(`/preinscription/${BOGUS_TOKEN}`);
  expect(resp?.status()).toBe(404);
  await expect(page.getByText(/Bienvenue/)).toHaveCount(0);
  await expect(page.getByText('Pré-inscription en ligne')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Volet authentifié — projet `authenticated` (storageState du setup)
// ---------------------------------------------------------------------------

for (const { route, pilier } of PROTECTED_ROUTES) {
  test(`${route} rend 200 authentifié avec contenu (${pilier})`, async ({ page }) => {
    const resp = await page.goto(route);
    expect(resp?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
    // Anti-200-vide : au moins un heading/table de contenu visible.
    await expect(page.locator('main h1, main h2, main table').first()).toBeVisible();
  });
}

test('/app/sessions/[id] (1ʳᵉ session) rend 200 authentifié avec contenu (#1)', async ({ page }) => {
  const resp = await page.goto(`/app/sessions/${firstSessionId}`);
  expect(resp?.status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('main h1, main h2, main table').first()).toBeVisible();
});
