import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 22 Plan 22-02 Task 1 — contrat env-first de `loadOAuthConfig()` (D-07).
 *
 * Portage cloud des credentials Google Calendar : sur Vercel les 3 valeurs
 * viennent de l'env (GOOGLE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN,
 * validées t3-env) ; en dev local elles sont ABSENTES → fallback historique
 * sur le dossier secrets local (oauth-client.json + google-token.json).
 *
 * Contrat prouvé ici, SANS charger `.env` réel ni lire de vrais fichiers :
 *  1. env complet (3 vars)      → valeurs env, fs.readFileSync JAMAIS appelé.
 *  2. env vide (3 × undefined)  → fallback fichiers (oauth-client.json puis
 *     google-token.json), valeurs fichier retournées.
 *  3. env PARTIEL (1 var sur 3) → all-or-nothing : fallback fichiers COMPLET,
 *     aucun mélange env/fichier.
 *  4. fallback avec format `web` ({"web":{...}}) → cascade installed ?? web
 *     ?? racine préservée.
 *
 * Stratégie de mock (HERMÉTIQUE, pattern vi.hoisted projet — cf.
 * scripts/__tests__/cron-workers.test.ts) :
 *  - `@qualiof/shared/env` → getter sur `mockEnv` hoisté, contrôlable par test
 *    (le vrai createEnv n'est JAMAIS chargé, pas de .env requis).
 *  - `node:fs` → readFileSync spyable, répond selon le nom de fichier demandé.
 *  - `googleapis` → stub minimal (import top-level du module sous test).
 *  - `vi.resetModules()` + import dynamique par test pour re-lire le mock env.
 */

const { mockEnv, readFileSyncMock, fileFixtures } = vi.hoisted(() => {
  const fileFixtures = {
    oauthClient: JSON.stringify({
      installed: { client_id: 'id-file', client_secret: 'secret-file' },
    }),
    googleToken: JSON.stringify({ refresh_token: 'rt-file' }),
  };
  const mockEnv: Record<string, string | undefined> = {};
  const readFileSyncMock = vi.fn((filePath: string) => {
    if (String(filePath).endsWith('oauth-client.json')) return fileFixtures.oauthClient;
    if (String(filePath).endsWith('google-token.json')) return fileFixtures.googleToken;
    throw new Error(`unexpected readFileSync: ${filePath}`);
  });
  return { mockEnv, readFileSyncMock, fileFixtures };
});

vi.mock('@qualiof/shared/env', () => ({
  get sharedEnv() {
    return mockEnv;
  },
}));

vi.mock('node:fs', () => ({
  default: { readFileSync: readFileSyncMock },
  readFileSync: readFileSyncMock,
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    calendar: () => ({}),
  },
}));

async function importFresh() {
  vi.resetModules();
  return await import('../google-client');
}

beforeEach(() => {
  readFileSyncMock.mockClear();
  // fixtures par défaut (format `installed`) — Test 4 les surcharge
  fileFixtures.oauthClient = JSON.stringify({
    installed: { client_id: 'id-file', client_secret: 'secret-file' },
  });
  delete mockEnv.GOOGLE_OAUTH_CLIENT_ID;
  delete mockEnv.GOOGLE_OAUTH_CLIENT_SECRET;
  delete mockEnv.GOOGLE_OAUTH_REFRESH_TOKEN;
});

describe('loadOAuthConfig — env-first (D-07)', () => {
  it('Test 1 — 3 vars env posées → valeurs env, readFileSync JAMAIS appelé', async () => {
    mockEnv.GOOGLE_OAUTH_CLIENT_ID = 'id-env';
    mockEnv.GOOGLE_OAUTH_CLIENT_SECRET = 'secret-env';
    mockEnv.GOOGLE_OAUTH_REFRESH_TOKEN = 'rt-env';

    const { loadOAuthConfig } = await importFresh();
    const cfg = loadOAuthConfig();

    expect(cfg).toEqual({
      client_id: 'id-env',
      client_secret: 'secret-env',
      refresh_token: 'rt-env',
    });
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('Test 2 — 3 vars env undefined → fallback fichiers oauth-client.json + google-token.json', async () => {
    const { loadOAuthConfig } = await importFresh();
    const cfg = loadOAuthConfig();

    expect(cfg).toEqual({
      client_id: 'id-file',
      client_secret: 'secret-file',
      refresh_token: 'rt-file',
    });
    const readPaths = readFileSyncMock.mock.calls.map((c) => String(c[0]));
    expect(readPaths.some((p) => p.endsWith('oauth-client.json'))).toBe(true);
    expect(readPaths.some((p) => p.endsWith('google-token.json'))).toBe(true);
  });

  it('Test 3 — env PARTIEL (seul REFRESH_TOKEN) → all-or-nothing : fallback fichiers complet', async () => {
    mockEnv.GOOGLE_OAUTH_REFRESH_TOKEN = 'rt-env';

    const { loadOAuthConfig } = await importFresh();
    const cfg = loadOAuthConfig();

    // Aucun mélange env/fichier : les 3 valeurs viennent des fichiers.
    expect(cfg).toEqual({
      client_id: 'id-file',
      client_secret: 'secret-file',
      refresh_token: 'rt-file',
    });
    expect(readFileSyncMock).toHaveBeenCalled();
  });

  it('Test 4 — fallback fichier format `web` → cascade installed ?? web ?? racine préservée', async () => {
    fileFixtures.oauthClient = JSON.stringify({
      web: { client_id: 'id-web', client_secret: 'secret-web' },
    });

    const { loadOAuthConfig } = await importFresh();
    const cfg = loadOAuthConfig();

    expect(cfg).toEqual({
      client_id: 'id-web',
      client_secret: 'secret-web',
      refresh_token: 'rt-file',
    });
  });
});
