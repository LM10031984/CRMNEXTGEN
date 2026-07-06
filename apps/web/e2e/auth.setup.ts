import { test as setup, expect } from '@playwright/test';

/**
 * Auth setup — VRAI login UI contre la cible (staging Vercel), puis persistance
 * du storageState pour le projet `authenticated`.
 *
 * Ce setup EST une preuve APP-02 (moitié login) : si le cookie de session Lucia
 * (secure + sameSite lax) ne fonctionnait pas sur le domaine déployé, la
 * redirection vers /app n'aurait jamais lieu et le setup échouerait.
 *
 * Credentials : E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD (env locale, gitignorée —
 * user dédié créé par scripts/create-e2e-user.ts, jamais le compte de Laurent).
 */
const STORAGE_STATE_PATH = 'e2e/.auth/user.json';

setup('login réel → storageState', async ({ page }) => {
  const email = process.env.E2E_LOGIN_EMAIL;
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD manquants — les poser dans le .env racine (gitignoré).',
    );
  }

  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // loginAction redirige vers /app après pose du cookie de session.
  await page.waitForURL('**/app');
  await expect(page).toHaveURL(/\/app$/);

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
