import { test, expect } from '@playwright/test';
import { prisma } from '@qualiof/db';
import { assertTestDatabaseContent } from '../../../packages/db/scripts/assert-test-target';
import { seedPlanningFixture } from './lib/planning-fixture';

test.beforeAll(async () => {
  await assertTestDatabaseContent(prisma, process.env.DATABASE_URL);
  await seedPlanningFixture();
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test('planning : vrai login, régime sur la bonne ligne, semaine et URL partageable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.locator('#email').fill('admin@startacademy.fr');
  await page.locator('#password').fill('admin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/app');
  const response = await page.goto('/app/planning?m=2026-09&view=month');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Planning des formateurs' })).toBeVisible();
  const alice = page.getByTestId('trainer-row-planning-alice');
  const individuel = alice.locator('[data-session-id="planning-individuel"]');
  await expect(individuel).toHaveCount(1);
  await expect(individuel).toHaveClass(/bg-primary-50/);
  await expect(alice.locator('[data-session-id="planning-entreprise"]')).toHaveClass(/bg-info/);
  await expect(individuel).not.toHaveClass(/ring-danger/);
  await expect(
    page
      .getByTestId('trainer-row-planning-claire')
      .locator('[data-session-id="planning-conflit"].ring-danger'),
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Planning', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/planning-mois.png', fullPage: true });
  await page.getByRole('button', { name: 'Semaine', exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByText('Après-midi', { exact: true })).toHaveCount(7);
  await page.getByRole('button', { name: 'Entreprise / OPCO', exact: true }).click();
  await expect(page).toHaveURL(/regime=ENTREPRISE/);
  await expect(alice.locator('[data-regime="INDIVIDUEL"]')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Entreprise / OPCO', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).not.toHaveURL(/regime=/);
  await expect(alice.locator('[data-regime="INDIVIDUEL"]')).toHaveCount(3);
  await page.goto('/app/formateurs');
  await page.getByRole('link', { name: 'Voir le planning', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/planning$/);
  await page.goto('/app/formateurs/planning-alice');
  await page.getByRole('link', { name: 'Voir le planning', exact: true }).click();
  await expect(page).toHaveURL(/trainer=planning-alice/);
  await expect(page.getByTestId('trainer-row-planning-benoit')).toHaveCount(0);
  expect(errors).toEqual([]);
});
