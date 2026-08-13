import { test, expect, type Page, type Download } from '@playwright/test';
import { prisma } from '@qualiof/db';
import { teardownE2EData } from './teardown-e2e-data';

/**
 * TEST-01 — E2E closure COMPLET contre le staging Vercel (Phase 21, plan 21-06).
 *
 * Flow exact « création session → participants → pack → docs générés » :
 *   1. Préflight doc-engine Railway (/health public du proxy Caddy) — Pitfall 9.
 *   2. Wizard /app/sessions/nouvelle : session E2E- (produit E2E-, 1 jour,
 *      formateur existant), 2 participants E2E- ajoutés via le picker UI.
 *   3. CTA « Pack fin de formation » → VRAIE génération IA OpenRouter (D-11,
 *      coût ~centimes, JAMAIS de mock du pipeline) consommée par le worker
 *      Railway (queue Postgres SKIP LOCKED — aucun cron Vercel).
 *   4. Poll UI de la page batch (reload 30 s, max ~13 min) jusqu'à « Terminé »,
 *      assert 0 stub (UI + Prisma).
 *   5. Download d'un doc du pack → magic bytes %PDF- (rendu worker Railway).
 *   6. Preuve APP-03 dédiée : convocation générée PAR VERCEL (server action
 *      dispatchGenerateDoc → renderHtmlToPdf → proxy Caddy public + Bearer)
 *      → %PDF-. Annotation : CE PDF porte le filigrane STAGING (rendu Vercel),
 *      les docs du pack (rendus worker Railway) n'en portent PAS — comportement
 *      attendu (Open Q1 tranchée : flag staging sur Vercel uniquement).
 *   7. afterAll : teardownE2EData() — purge exclusive E2E- (base + storage).
 *
 * Choix fixtures (documenté, cf. plan 21-06 Task 2) :
 *   - Le PRODUIT est créé via Prisma en beforeAll (préfixé E2E-) : TEST-01
 *     porte sur « création session → participants », pas la création produit.
 *   - Les PERSONNES E2E-Alice/E2E-Bob sont créées via Prisma en beforeAll
 *     (avec Organization E2E- + LegalLink — le picker exige ≥1 casquette),
 *     puis AJOUTÉES À LA SESSION via l'UI du wizard (étape 3, picker) : le
 *     picker ne permet pas la création inline de LegalLink.
 *   - Produit DISTANCIEL : la Location n'est pas exigée par la completeness
 *     (règle métier), ce qui garde le wizard déterministe.
 */

// Pas de retry : un retry relancerait un pack IA OpenRouter complet (coût réel,
// D-11) — un échec doit être diagnostiqué, pas rejoué en aveugle.
test.describe.configure({ retries: 0 });

const TS = Date.now();
const PRODUCT_TITLE = `E2E-Produit-${TS}`;
const ALICE = { firstName: 'E2E-Alice', lastName: 'E2E-QA' };
const BOB = { firstName: 'E2E-Bob', lastName: 'E2E-QA' };

const PACK_KINDS_PER_PARTICIPANT = 8; // CLOSURE_DOC_KINDS (lib/closure/types.ts)
const EXPECTED_JOBS = 2 * PACK_KINDS_PER_PARTICIPANT; // 16

let productId: string;
let sessionId: string | null = null;

/** Lit les 5 premiers octets d'un download Playwright. */
async function readHead(download: Download, bytes = 5): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).length >= bytes) break;
  }
  return Buffer.concat(chunks).subarray(0, bytes).toString('latin1');
}

/**
 * Clique un lien `target=_blank` qui devient un download (headless Chromium ne
 * rend pas les PDF). Selon la version/attribution Chromium, l'event `download`
 * peut être émis sur la page OPENER ou sur la POPUP — on écoute les deux.
 */
async function clickAndCaptureDownload(
  page: Page,
  click: () => Promise<void>,
  timeoutMs = 60_000,
): Promise<Download> {
  const ctx = page.context();
  const captured = new Promise<Download>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Aucun download capté en ${timeoutMs} ms`)),
      timeoutMs,
    );
    const onDownload = (d: Download) => {
      clearTimeout(timer);
      ctx.off('page', onPage);
      resolve(d);
    };
    const onPage = (popup: Page) => {
      popup.once('download', onDownload);
    };
    page.once('download', onDownload);
    ctx.on('page', onPage);
  });
  await click();
  return captured;
}

test.beforeAll(async () => {
  // Tenant du user e2e (ADMIN) — les fixtures doivent être visibles par lui.
  const e2eUser = await prisma.user.findFirstOrThrow({
    where: { email: process.env.E2E_LOGIN_EMAIL ?? 'e2e@start-academy.fr' },
    select: { tenantId: true },
  });
  const tenantId = e2eUser.tenantId;

  // Produit E2E- (créé via Prisma — voir choix fixtures en tête de fichier).
  // programMd non vide + aiDraftedAt null = requis par getSessionCompleteness.
  const product = await prisma.trainingProduct.create({
    data: {
      tenantId,
      code: `E2E-PROD-${TS}`,
      title: PRODUCT_TITLE,
      durationHours: 8, // 1 jour (dates courtes)
      modality: 'DISTANCIEL', // Location non requise (completeness)
      objectives: ['Identifier les fondamentaux E2E', 'Appliquer un scénario de test'],
      programMd:
        `# ${PRODUCT_TITLE}\n\n## Jour 1\n\n- Matin : fondamentaux du test de bout en bout\n- Après-midi : mise en pratique guidée\n`,
      priceHT: 120,
      pedagogicalMethods: 'Démonstrations et exercices pratiques',
      evaluationMethods: 'QCM final',
    },
  });
  productId = product.id;

  // Organization sponsor + 2 personnes E2E- avec 1 LegalLink chacune
  // (le PersonOrOrgPicker exige ≥1 casquette, 1 seule = auto-sélection).
  const org = await prisma.organization.create({
    data: {
      tenantId,
      legalName: `E2E-Org-${TS}`,
      legalForm: 'SARL',
    },
  });
  for (const p of [ALICE, BOB]) {
    await prisma.person.create({
      data: {
        tenantId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: `e2e-${p.firstName.toLowerCase().replace('e2e-', '')}-${TS}@example.com`,
        legalLinks: {
          create: { organizationId: org.id, role: 'SALARIE', isPrimary: true },
        },
      },
    });
  }
});

test.afterAll(async () => {
  // Purge EXCLUSIVE des données E2E- (base + storage) — idempotent, réutilisé
  // tel quel en standalone (e2e/teardown-e2e-data.ts) après un crash.
  await teardownE2EData();
  await prisma.$disconnect();
});

test('TEST-01 : session E2E- via UI → pack closure IA réel → 0 stub → %PDF (pack + synchrone APP-03)', async ({
  page,
  request,
}) => {
  test.setTimeout(15 * 60_000); // marge cold start Gotenberg + file worker (~3 min témoin SES-0093)

  // Audit 2026-08-12 : « 0 stub » exige un provider IA réel (OpenRouter ou
  // Ollama joignable). Sur un poste sans IA, le pack passe par les stubs
  // déterministes — comportement voulu, mais hors du périmètre de CE test.
  test.skip(
    process.env.E2E_SKIP_REAL_AI === '1',
    'IA réelle indisponible (E2E_SKIP_REAL_AI=1) — pack testé via stubs par ailleurs',
  );

  // ── 1. Préflight doc-engine Railway (Pitfall 9) ──────────────────────────
  const healthUrl = process.env.E2E_DOCENGINE_HEALTH_URL;
  if (!healthUrl) {
    console.warn(
      '[closure-flow] E2E_DOCENGINE_HEALTH_URL absent — préflight doc-engine sauté (voir e2e/README.md)',
    );
  } else {
    let healthy = false;
    try {
      const r = await request.get(healthUrl, { timeout: 15_000 });
      healthy = r.status() === 200;
    } catch {
      healthy = false;
    }
    // Échec préflight = dépendance runtime down, PAS un rouge code.
    test.skip(!healthy, `Préflight KO : worker/doc-engine Railway down (${healthUrl})`);
  }

  // ── 2. Wizard : création session + participants via l'UI ────────────────
  await page.goto('/app/sessions/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle session' })).toBeVisible({
    timeout: 30_000,
  });

  // Étape 1 — produit (recherche puis carte → auto-avance étape 2)
  await page.getByPlaceholder(/Cherche un produit/).fill(PRODUCT_TITLE);
  await page.getByRole('button', { name: new RegExp(PRODUCT_TITLE) }).click();

  // Étape 2 — dates auto (1 jour), formateur existant via le picker
  await expect(page.getByText('2. Dates, lieu et formateurs')).toBeVisible({ timeout: 15_000 });
  // Attendre le calcul de l'agenda (badges dispo formateurs dépendent des dates)
  await expect(page.getByText(/J1 ·/)).toBeVisible({ timeout: 30_000 });
  // Premier formateur disponible (bouton non-disabled dans la section formateurs)
  const trainerBtn = page
    .locator('button:has(svg.lucide-graduation-cap):not([disabled])')
    .first();
  await expect(trainerBtn).toBeVisible({ timeout: 30_000 });
  await trainerBtn.click();
  await page.getByRole('button', { name: /^Suivant/ }).click();

  // Étape 3 — 2 participants via le picker (personnes E2E- pré-créées)
  await expect(page.getByText('3. Inscrits — apprenants & casquettes')).toBeVisible();
  for (const p of [ALICE, BOB]) {
    await page.getByRole('button', { name: /Ajouter un apprenant/ }).click();
    const search = page.getByPlaceholder(/Cherche par nom/);
    await search.fill(p.firstName);
    // 1 seule casquette → la sélection est automatique au clic sur le résultat
    await page
      .getByRole('button', { name: new RegExp(`${p.firstName}\\s+${p.lastName}`, 'i') })
      .first()
      .click();
    await expect(page.getByText(p.firstName).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /^Suivant/ }).click();

  // Étape 4 — récap + création
  await expect(page.getByText('4. Récapitulatif')).toBeVisible();
  await page.getByRole('button', { name: /Créer la session/ }).click();
  await page.waitForURL(/\/app\/sessions\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  sessionId = new URL(page.url()).pathname.split('/').pop()!;
  console.log(`[closure-flow] session créée via UI : ${sessionId}`);

  // ── 3. Déclencher le pack closure (génération IA OpenRouter RÉELLE) ─────
  await page.getByRole('button', { name: /Pack fin de formation/ }).first().click();
  // Modale de confirmation : aucun blocker attendu (completeness OK)
  await expect(page.getByText(/2.*apprenant\(s\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Session incomplète — génération impossible')).toHaveCount(0);
  const packStartedAt = Date.now();
  await page.getByRole('button', { name: /Lancer la génération/ }).click();
  await page.waitForURL(/\/closure\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const batchId = new URL(page.url()).pathname.split('/').pop()!;
  console.log(`[closure-flow] batch lancé : ${batchId} (${EXPECTED_JOBS} jobs attendus)`);

  // ── 4. Poll UI jusqu'à complétion (max ~13 min) ─────────────────────────
  // La page batch se poll elle-même toutes les 2 s (ClosureBatchProgress) tant
  // que le batch est PENDING/RUNNING → on ATTEND le badge terminal (waitFor,
  // PAS un count() instantané post-reload : le composant client met ~1-2 s à
  // hydrater après reload — cause du TIMEOUT du 1er run). Le reload n'est
  // qu'un filet de secours si le polling client meurt.
  const statusBadge = page.getByText(/^(Terminé|Partiel|Échec)$/).first();
  const deadline = Date.now() + 13 * 60_000;
  let finalStatus = 'TIMEOUT';
  for (;;) {
    try {
      await statusBadge.waitFor({ state: 'visible', timeout: 45_000 });
      finalStatus = (await statusBadge.textContent())?.trim() ?? 'ILLISIBLE';
      break;
    } catch {
      if (Date.now() > deadline) break;
      await page.reload();
    }
  }
  const packDurationSec = Math.round((Date.now() - packStartedAt) / 1000);
  console.log(`[closure-flow] batch "${finalStatus}" en ${packDurationSec}s`);
  expect(finalStatus, `Batch non complété (${finalStatus}) après ${packDurationSec}s`).toBe(
    'Terminé',
  );

  // 0 stub — UI : aucun « doc(s) à régénérer (IA) » ni badge « À régénérer »
  await expect(page.getByText(/à régénérer \(IA\)/)).toHaveCount(0);
  await expect(page.getByText('À régénérer')).toHaveCount(0);

  // 0 stub — Prisma (source de vérité) : 16/16 DONE, usedStub=false, errorMessage null
  const jobs = await prisma.closureJob.findMany({
    where: { batchId },
    select: { status: true, usedStub: true, errorMessage: true, kind: true },
  });
  expect(jobs).toHaveLength(EXPECTED_JOBS);
  const bad = jobs.filter(
    (j) => j.status !== 'DONE' || j.usedStub || j.errorMessage !== null,
  );
  expect(
    bad,
    `Jobs non conformes (stub/erreur) : ${JSON.stringify(bad.map((j) => j.kind))}`,
  ).toHaveLength(0);

  // ── 5. Download d'un doc du pack → %PDF- (rendu worker Railway) ─────────
  // NB : ces PDF ne portent PAS le filigrane STAGING (flag Vercel uniquement).
  const packDownload = await clickAndCaptureDownload(page, () =>
    page.getByRole('link', { name: 'Voir' }).first().click(),
  );
  const packHead = await readHead(packDownload);
  expect(packHead, 'Doc du pack : magic bytes PDF attendus').toMatch(/^%PDF-/);
  console.log(`[closure-flow] doc du pack : head="${packHead}" OK`);

  // ── 6. APP-03 : PDF SYNCHRONE rendu par Vercel (convocation) ────────────
  test.info().annotations.push({
    type: 'app-03',
    description:
      'La convocation est rendue PAR VERCEL (renderHtmlToPdf → proxy Caddy public + Bearer) : ' +
      'elle DOIT porter le filigrane STAGING. Les docs du pack (worker Railway) n\'en portent pas — attendu.',
  });
  await page.goto(`/app/sessions/${sessionId}?tab=avant`);
  const aliceConvocation = page.locator('li', {
    hasText: new RegExp(`Convocation — ${ALICE.firstName}`),
  });
  await expect(aliceConvocation).toBeVisible({ timeout: 30_000 });

  // prepareSession (fire-and-forget à la création) a pu déjà la générer ;
  // sinon on déclenche la server action synchrone depuis l'UI.
  const genBtn = aliceConvocation.getByRole('button', {
    name: new RegExp(`^Générer Convocation — ${ALICE.firstName}`),
  });
  if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
    console.log('[closure-flow] convocation : génération synchrone déclenchée depuis l\'UI');
  }
  // Le lien « Ouvrir » apparaît après router.refresh() (poll reload de secours).
  const openLink = aliceConvocation.getByRole('link', { name: /Ouvrir/ });
  const convDeadline = Date.now() + 120_000;
  while (!(await openLink.isVisible().catch(() => false))) {
    if (Date.now() > convDeadline) break;
    await page.waitForTimeout(5_000);
    await page.reload();
  }
  await expect(openLink, 'Convocation non générée (APP-03)').toBeVisible();

  const syncDownload = await clickAndCaptureDownload(page, () => openLink.click());
  const syncHead = await readHead(syncDownload);
  expect(syncHead, 'PDF synchrone Vercel : magic bytes PDF attendus (APP-03)').toMatch(/^%PDF-/);
  console.log(`[closure-flow] PDF synchrone (convocation) : head="${syncHead}" OK — APP-03 prouvé`);
});
