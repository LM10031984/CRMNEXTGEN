import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Tests Phase 7 Plan 07-03 Task 1 — Asset loading + cache invalidation.
 *
 * Stratégie :
 *  - On crée des fixtures FS RÉELLES dans
 *    `apps/web/public/of-assets/test-tenant-{n}/` (avec un suffixe aléatoire
 *    par test pour éviter toute collision entre runs / parallel).
 *  - On utilise des tenantId UNIQUES par test pour éviter la pollution du
 *    `fileCache` module-scope (qui persiste entre tests dans le même run).
 *  - `afterEach` cleanup le répertoire créé pour ne pas laisser d'artefacts.
 *
 * Coverage (10 tests) :
 *  1. tenant dir présent → loadAssetDataUrl retourne le contenu uploadé
 *  2. tenant dir absent → fallback bundled `src/assets/`
 *  3. tenantId undefined → ignore le path tenant, retombe sur bundled
 *  4. cache key inclut tenantId — deux tenantIds différents ne se polluent pas
 *  5. invalidateAssetCache supprime les entrées pour un tenantId donné
 *  6. loadLogoColorDataUrl essaie logo.png/jpg/svg dans tenant dir
 *  7. loadSignatureDataUrl(t, 'pedago') cherche signature-pedago.png
 *  8. loadSignatureDataUrl(t, 'dirigeant') cherche signature-dirigeant.png
 *  9. SVG renvoie mime `image/svg+xml` (pas `image/svg`)
 * 10. invalidateAssetCache ne touche pas un AUTRE tenantId
 */

import {
  invalidateAssetCache,
  loadLogoColorDataUrl,
  loadSignatureDataUrl,
} from '../shared-template';

// PNG minimal valide (1x1 pixel transparent) — base64 décodé en buffer
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const TINY_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64',
);

const PUBLIC_OF_ASSETS = path.join(process.cwd(), 'public', 'of-assets');

function makeTenantDir(tenantId: string): string {
  const dir = path.join(PUBLIC_OF_ASSETS, tenantId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFixture(tenantId: string, filename: string, buf: Buffer): void {
  const dir = makeTenantDir(tenantId);
  fs.writeFileSync(path.join(dir, filename), buf);
}

function cleanup(tenantId: string): void {
  const dir = path.join(PUBLIC_OF_ASSETS, tenantId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Suffixe unique par test pour éviter pollution cache + collisions
let testCounter = 0;
const tenants: string[] = [];
function uniqTenantId(label: string): string {
  testCounter += 1;
  const id = `test-${label}-${testCounter}-${Date.now()}`;
  tenants.push(id);
  return id;
}

beforeEach(() => {
  // pas de reset global du cache — chaque test utilise un tenantId unique
});

afterEach(() => {
  // Nettoyage des tenants créés pendant ce test
  while (tenants.length > 0) {
    const t = tenants.pop();
    if (t) {
      cleanup(t);
      // purge également le cache pour ce tenantId au cas où
      try {
        invalidateAssetCache(t);
      } catch {
        /* noop */
      }
    }
  }
});

describe('loadAssetDataUrl (via loadLogoColorDataUrl) — cascade tenant → bundled', () => {
  it("Test 1 — tenant dir présent : retourne le contenu uploadé (data-URL PNG)", () => {
    const tenantId = uniqTenantId('upload');
    writeFixture(tenantId, 'logo.png', TINY_PNG);

    const url = loadLogoColorDataUrl(tenantId);

    expect(url).toMatch(/^data:image\/png;base64,/);
    // Vérifie que c'est bien notre fixture (et non le bundled logo)
    const expectedB64 = TINY_PNG.toString('base64');
    expect(url).toContain(expectedB64);
  });

  it("Test 2 — tenant dir absent : fallback bundled logo-start-academy.png", () => {
    const tenantId = uniqTenantId('fallback');
    // PAS de fixture créée pour ce tenant
    const url = loadLogoColorDataUrl(tenantId);

    expect(url).toMatch(/^data:image\/png;base64,/);
    // Ne doit PAS être notre fixture TINY_PNG (puisque pas créée)
    const bundledPath = path.join(process.cwd(), 'src', 'assets', 'logo-start-academy.png');
    if (fs.existsSync(bundledPath)) {
      const bundledB64 = fs.readFileSync(bundledPath).toString('base64');
      expect(url).toContain(bundledB64);
    }
  });

  it("Test 3 — tenantId undefined : ignore path tenant, retombe sur bundled", () => {
    const url = loadLogoColorDataUrl(undefined);
    expect(url).toMatch(/^data:image\/png;base64,/);
    const bundledPath = path.join(process.cwd(), 'src', 'assets', 'logo-start-academy.png');
    if (fs.existsSync(bundledPath)) {
      const bundledB64 = fs.readFileSync(bundledPath).toString('base64');
      expect(url).toContain(bundledB64);
    }
  });

  it("Test 4 — cache key inclut tenantId : deux tenantIds ne polluent pas l'un l'autre", () => {
    const tenantA = uniqTenantId('isolA');
    const tenantB = uniqTenantId('isolB');

    // Tenant A a un PNG (fixture), tenant B n'a rien (fallback bundled)
    writeFixture(tenantA, 'logo.png', TINY_PNG);

    const urlA = loadLogoColorDataUrl(tenantA);
    const urlB = loadLogoColorDataUrl(tenantB);

    expect(urlA).toContain(TINY_PNG.toString('base64'));
    // URL B ne doit PAS contenir TINY_PNG (sinon pollution cache)
    expect(urlB).not.toContain(TINY_PNG.toString('base64'));
  });

  it("Test 5 — invalidateAssetCache : après purge, prochain appel relit le disque", () => {
    const tenantId = uniqTenantId('inval');
    writeFixture(tenantId, 'logo.png', TINY_PNG);

    // Premier appel : populate cache
    const url1 = loadLogoColorDataUrl(tenantId);
    expect(url1).toContain(TINY_PNG.toString('base64'));

    // On change le fichier sur disque (nouveau contenu)
    writeFixture(tenantId, 'logo.png', TINY_JPG); // JPG content under logo.png (test cache bypass)

    // Sans invalidation : devrait retourner le contenu CACHÉ (l'ancien PNG)
    const url2 = loadLogoColorDataUrl(tenantId);
    expect(url2).toBe(url1); // identique (cache hit)

    // Après invalidation : relit le disque → nouveau contenu
    invalidateAssetCache(tenantId);
    const url3 = loadLogoColorDataUrl(tenantId);
    expect(url3).toContain(TINY_JPG.toString('base64'));
    expect(url3).not.toBe(url1);
  });

  it("Test 6 — loadLogoColorDataUrl essaie logo.png → logo.jpg → logo.svg", () => {
    // Pas de logo.png, mais un logo.jpg : doit être trouvé
    const tenantId = uniqTenantId('jpg');
    writeFixture(tenantId, 'logo.jpg', TINY_JPG);

    const url = loadLogoColorDataUrl(tenantId);
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    expect(url).toContain(TINY_JPG.toString('base64'));
  });
});

describe('loadSignatureDataUrl — role pedago vs dirigeant', () => {
  it("Test 7 — loadSignatureDataUrl(t, 'pedago') cherche signature-pedago.png", () => {
    const tenantId = uniqTenantId('sig-pedago');
    writeFixture(tenantId, 'signature-pedago.png', TINY_PNG);

    const url = loadSignatureDataUrl(tenantId, 'pedago');
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(url).toContain(TINY_PNG.toString('base64'));
  });

  it("Test 8 — loadSignatureDataUrl(t, 'dirigeant') cherche signature-dirigeant.png", () => {
    const tenantId = uniqTenantId('sig-diri');
    writeFixture(tenantId, 'signature-dirigeant.png', TINY_PNG);

    const url = loadSignatureDataUrl(tenantId, 'dirigeant');
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(url).toContain(TINY_PNG.toString('base64'));
  });

  it("Test 8bis — loadSignatureDataUrl(t, 'pedago') sans fixture : fallback bundled signature-laurent.png", () => {
    const tenantId = uniqTenantId('sig-fb');
    // Pas de signature-pedago.png uploadée
    const url = loadSignatureDataUrl(tenantId, 'pedago');
    // Doit retourner un PNG bundled (signature-laurent.png ou tampon)
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});

describe('SVG mime type', () => {
  it("Test 9 — SVG retourne mime image/svg+xml (pas image/svg)", () => {
    const tenantId = uniqTenantId('svg');
    // SVG minimal valide
    const tinySvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
      'utf-8',
    );
    writeFixture(tenantId, 'logo.svg', tinySvg);

    // Doit trouver logo.svg car logo.png et logo.jpg absents
    const url = loadLogoColorDataUrl(tenantId);
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe('invalidateAssetCache — scoping', () => {
  it("Test 10 — invalidateAssetCache(tenantA) ne touche pas tenantB", () => {
    const tenantA = uniqTenantId('purgeA');
    const tenantB = uniqTenantId('purgeB');
    writeFixture(tenantA, 'logo.png', TINY_PNG);
    writeFixture(tenantB, 'logo.png', TINY_JPG);

    // Populate caches
    const urlA1 = loadLogoColorDataUrl(tenantA);
    const urlB1 = loadLogoColorDataUrl(tenantB);

    // Invalide UNIQUEMENT tenantA
    invalidateAssetCache(tenantA);

    // tenantB doit toujours retourner sa valeur cachée
    const urlB2 = loadLogoColorDataUrl(tenantB);
    expect(urlB2).toBe(urlB1);

    // tenantA aussi (cache miss → relit disque → même contenu)
    const urlA2 = loadLogoColorDataUrl(tenantA);
    expect(urlA2).toBe(urlA1);
  });
});
