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

async function login(
  page: import('@playwright/test').Page,
  email = 'admin@startacademy.fr',
  password = 'admin',
) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/app');
}

test('indisponibilité : création depuis une case, validation, édition et suppression depuis la fiche', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/planning?m=2026-10&view=month');
  await page
    .getByRole('button', {
      name: 'Déclarer une indisponibilité pour Alice Martin le 5 octobre 2026',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Début')).toHaveValue('2026-10-05T09:00');
  await dialog.getByLabel('Fin', { exact: true }).fill('2026-10-05T09:00');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('strictement après');
  await dialog.getByLabel('Fin', { exact: true }).fill('2026-10-05T17:00');
  await dialog.getByLabel('Note (facultative)').fill('E2E-planning-lot2');
  await page.screenshot({
    path: 'test-results/planning-indisponibilite-dialog.png',
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const absence = page.getByRole('button', {
    name: 'Modifier l’indisponibilité de Alice Martin',
    exact: true,
  });
  await expect(absence).toHaveCount(1);
  await absence.click();
  await expect(dialog.getByLabel('Début')).toHaveValue('2026-10-05T09:00');
  await dialog.getByLabel('Statut').selectOption('tentative');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(absence).toContainText('À confirmer');
  await page.goto('/app/formateurs/planning-alice');
  const item = page.getByRole('listitem').filter({ hasText: 'E2E-planning-lot2' });
  await expect(item).toContainText('À confirmer');
  await item.getByRole('button', { name: 'Modifier l’indisponibilité' }).click();
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(item).toHaveCount(0);
});

test('FORMATEUR et LECTEUR : édition limitée à la fiche propre, lecture conservée pour tous', async ({
  page,
}) => {
  const argon2 = await import('argon2');
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: 'E2E-Planning' } });
  const password = 'Planning-demo-2026!';
  const hashedPwd = await argon2.hash(password);
  await prisma.person.update({
    where: { id: 'planning-alice', tenantId: tenant.id },
    data: { email: 'planning-alice@example.invalid' },
  });
  for (const role of ['FORMATEUR', 'LECTEUR'] as const) {
    const email =
      role === 'FORMATEUR' ? 'planning-alice@example.invalid' : 'planning-reader@example.invalid';
    await prisma.user.upsert({
      where: { email },
      update: { hashedPwd },
      create: {
        email,
        hashedPwd,
        tenantId: tenant.id,
        firstName: 'Planning',
        lastName: role,
        role,
        isServiceAccount: true,
      },
    });
    await page.context().clearCookies();
    await login(page, email, password);
    await page.goto('/app/planning?m=2026-09&view=month');
    await expect(page.getByTestId('trainer-row-planning-claire')).toBeVisible();
    const own = page.getByTestId('trainer-row-planning-alice');
    await expect(
      own.getByRole('button', {
        name: 'Déclarer une indisponibilité pour Alice Martin',
        exact: true,
      }),
    ).toHaveCount(role === 'FORMATEUR' ? 1 : 0);
    await expect(
      page
        .getByTestId('trainer-row-planning-claire')
        .getByRole('button', { name: /Déclarer une indisponibilité/ }),
    ).toHaveCount(0);
  }
});

test('une indisponibilité créée dans le planning apparaît comme conflit dans le wizard inchangé', async ({
  page,
}) => {
  const { randomUUID } = await import('node:crypto');
  const argon2 = await import('argon2');
  const tenant = await prisma.tenant.create({ data: { name: 'E2E-Planning-Wizard' } });
  try {
    const email = `${randomUUID()}@wizard.invalid`;
    const password = 'Planning-wizard-2026!';
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        hashedPwd: await argon2.hash(password),
        firstName: 'Test',
        lastName: 'Wizard',
        role: 'ADMIN',
        isServiceAccount: true,
      },
    });
    const trainer = await prisma.person.create({
      data: { tenantId: tenant.id, firstName: 'Camille', lastName: 'Planning' },
    });
    await prisma.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        entityType: 'Person.Trainer',
        entityId: trainer.id,
        source: 'test-planning-wizard',
        externalId: randomUUID(),
      },
    });
    await prisma.trainingProduct.create({
      data: {
        tenantId: tenant.id,
        code: 'TEST-WIZARD-PLANNING',
        title: 'Formation test planning',
        durationHours: 16,
        modality: 'PRESENTIEL',
        objectives: [],
        programMd: 'Test',
      },
    });
    await login(page, email, password);
    await page.goto('/app/planning?m=2026-11&view=month');
    await page
      .getByRole('button', {
        name: 'Déclarer une indisponibilité pour Camille Planning le 20 novembre 2026',
        exact: true,
      })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/app/sessions/nouvelle');
    await page.getByRole('button', { name: /Formation test planning/ }).click();
    await page.locator('input[type="date"]').first().fill('2026-11-20');
    const trainerButton = page.getByRole('button', { name: /Camille Planning/ });
    await expect(trainerButton).toContainText('1 conflit');
    await expect(trainerButton).toBeEnabled();
    await page.screenshot({ path: 'test-results/planning-wizard-conflit.png', fullPage: true });
  } finally {
    await prisma.trainerAvailability.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.externalIdentity.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.person.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.trainingProduct.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
