import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@qualiof/db';

/**
 * Re-validation PENDING 18-SMOKE ① — upload 10 Mo direct-to-storage SANS 413
 * sur Vercel déployé (Pitfall 10 : cap 4,5 Mo body Vercel).
 *
 * Preuve structurelle anti-413 : le fichier part en XHR PUT DIRECT vers
 * Supabase Storage (signed upload URL, `direct-upload-field.tsx`) — AUCUN octet
 * du fichier ne transite par le domaine Vercel. On asserte les 3 volets :
 *   1. un PUT `*.supabase.co/storage/v1/object/upload/sign/preinscriptions/…` → 200
 *   2. AUCUNE réponse 413 sur toute la session
 *   3. AUCUNE requête vers le domaine cible (Vercel) avec un body ≥ 4 Mo
 *
 * Le form public est anonyme → storageState neutralisé (le fichier tourne dans
 * le projet `authenticated` mais ce describe force un contexte vierge).
 * L'OCR réel n'est PAS l'objet de ce test (couvert par 20-05 / 21-06).
 */

// Contexte vierge : la page /preinscription/[token] est publique.
test.use({ storageState: { cookies: [], origins: [] } });

const E2E_TOKEN = `e2e-upload-${Date.now()}`;
const TEN_MB = 10 * 1024 * 1024;

/** JPEG factice ~10 Mo : magic bytes JPEG + bruit + EOI (le composant vérifie type/taille, pas le contenu). */
function makeFakeJpeg10Mb(): Buffer {
  const buf = Buffer.alloc(TEN_MB);
  // SOI + APP0 (FF D8 FF E0)
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  for (let i = 4; i < TEN_MB - 2; i += 4096) {
    buf[i] = (i * 7) % 256; // pseudo-bruit, suffisant (pas de compression en jeu)
  }
  // EOI (FF D9)
  buf[TEN_MB - 2] = 0xff;
  buf[TEN_MB - 1] = 0xd9;
  return buf;
}

test.beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  await prisma.preEnrollment.create({
    data: {
      tenantId: tenant.id,
      token: E2E_TOKEN,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      firstName: 'E2E-Upload',
      lastName: 'E2E-Test',
    },
  });
});

test.afterAll(async () => {
  // Nettoyage storage : les objets uploadés vivent sous `{token}/…` dans le
  // bucket preinscriptions (cf. createPreEnrollmentUploadUrl). Service role
  // depuis l'env locale — jamais exposé au client.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRole) {
    const supabase = createClient(supabaseUrl, serviceRole);
    const { data: objects } = await supabase.storage.from('preinscriptions').list(E2E_TOKEN);
    if (objects && objects.length > 0) {
      await supabase.storage
        .from('preinscriptions')
        .remove(objects.map((o) => `${E2E_TOKEN}/${o.name}`));
    }
  }
  await prisma.preEnrollment.deleteMany({ where: { token: E2E_TOKEN } });
  await prisma.$disconnect();
});

test('upload CNI 10 Mo direct-to-storage : PUT supabase.co 200, zéro 413, aucun body ≥4 Mo via Vercel', async ({
  page,
  baseURL,
}) => {
  // Audit 2026-08-12 : les assertions PUT *.supabase.co sont spécifiques au
  // provider cloud. En local/MinIO (STORAGE_PROVIDER=minio), l'upload direct
  // passe par un presigned PUT S3 — testé par le flux public (submit complet).
  test.skip(
    (process.env.STORAGE_PROVIDER ?? 'minio') !== 'supabase',
    'Cible Supabase uniquement (STORAGE_PROVIDER != supabase)',
  );
  test.setTimeout(180_000); // 10 Mo à uploader depuis le poste local

  // Volet 2 & 3 : surveiller TOUTES les réponses (413) et les bodies sortants.
  const statuses: Array<{ url: string; status: number }> = [];
  page.on('response', (resp) => {
    statuses.push({ url: resp.url(), status: resp.status() });
  });
  const bigBodiesToTarget: Array<{ url: string; size: number }> = [];
  const targetOrigin = new URL(baseURL!).origin;
  page.on('request', (req) => {
    const size = req.postDataBuffer()?.length ?? 0;
    if (req.url().startsWith(targetOrigin) && size >= 4 * 1024 * 1024) {
      bigBodiesToTarget.push({ url: req.url(), size });
    }
  });

  await page.goto(`/preinscription/${E2E_TOKEN}`);
  await expect(page.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();

  // Volet 1 : le PUT signé vers Supabase doit répondre 200.
  const supabasePut = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'PUT' &&
      /\.supabase\.co$/.test(new URL(resp.url()).hostname) &&
      resp.url().includes('/storage/v1/object/upload/sign/preinscriptions/'),
    { timeout: 150_000 },
  );

  // Champ CNI (input hidden id=direct-upload-CNI) — fichier 10 Mo en mémoire.
  await page.locator('#direct-upload-CNI').setInputFiles({
    name: 'cni-e2e-10mo.jpg',
    mimeType: 'image/jpeg',
    buffer: makeFakeJpeg10Mb(),
  });

  const putResp = await supabasePut;
  expect(putResp.status()).toBe(200);

  // L'UI confirme l'envoi (status done du DirectUploadField).
  await expect(page.getByText(/cni-e2e-10mo\.jpg.*envoyé/)).toBeVisible({ timeout: 30_000 });

  // Volet 2 : AUCUN 413 sur toute la session.
  const got413 = statuses.filter((s) => s.status === 413);
  expect(got413, `413 reçus : ${JSON.stringify(got413)}`).toHaveLength(0);

  // Volet 3 : aucun body ≥ 4 Mo n'est parti vers le domaine Vercel — preuve
  // structurelle que le fichier ne transite PAS par Next (anti-413 by design).
  expect(
    bigBodiesToTarget,
    `Bodies ≥4 Mo vers ${targetOrigin} : ${JSON.stringify(bigBodiesToTarget)}`,
  ).toHaveLength(0);
});
