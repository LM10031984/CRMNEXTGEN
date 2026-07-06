import { test, expect } from '@playwright/test';

/**
 * APP-02 — la moitié LOGOUT du flux (projet `logout`, SANS storageState).
 *
 * Session FRAÎCHE : le login UI dans ce spec crée sa PROPRE session Lucia ;
 * `logoutAction` fait `lucia.invalidateSession(sessionId)` sur la session
 * COURANTE uniquement → ce spec ne casse pas le storageState partagé du
 * projet `authenticated`.
 *
 * Preuve forte : après la déconnexion (UserMenu → Dialog « Confirmer la
 * déconnexion »), la re-visite de /app re-redirige vers /login — la session
 * est invalidée EN BASE (AuthSession supprimée), pas seulement le cookie
 * effacé côté client.
 */

test('login frais → Déconnexion (UserMenu + confirm) → /login, puis /app re-redirige (session invalidée)', async ({
  page,
}) => {
  const email = process.env.E2E_LOGIN_EMAIL;
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD manquants (.env racine gitignoré).');
  }

  // 1. Login UI frais (même mécanique que auth.setup.ts).
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/app');

  // 2. UserMenu (trigger aria-label) → item « Déconnexion » → Dialog de confirmation.
  await page.getByRole('button', { name: 'Menu utilisateur' }).click();
  await page.getByRole('menuitem', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmer la déconnexion' })).toBeVisible();
  // Bouton submit du <form action={logoutAction}>.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  // 3. Redirect serveur post-logout.
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/\/login/);

  // 4. Session invalidée EN BASE : /app re-redirige vers /login.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);
});
