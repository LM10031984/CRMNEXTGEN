import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 18 Plan 18-01 — Tests hermétiques de l'adaptateur storage.
 *
 * Interface-first : ce fichier écrit d'ABORD les contrats des 2 primitives
 * Supabase manquantes que STOR-02 (migration) et STOR-03 (upload direct)
 * consommeront —
 *   - createSignedUploadUrl(bucket, key) → { path, token, signedUrl }
 *       upload direct navigateur→Supabase (contourne le cap 4,5 Mo Vercel),
 *       Supabase UNIQUEMENT (throw explicite sur MinIO = upload serveur).
 *   - objectExists(bucket, key) → boolean
 *       vérification 0 lien mort SANS télécharger l'objet (list metadata).
 *
 * On couvre aussi les 2 primitives DÉJÀ en place, contrats stables :
 *   - ensureBucket → createBucket({ public:false, fileSizeLimit:52428800 })
 *   - createSignedDownloadUrl → createSignedUrl(key, 600) (TTL 600s D-09)
 *
 * HERMÉTIQUE (NB pattern projet, RESEARCH « Validation Architecture ») :
 *  - `@supabase/supabase-js` mocké : createClient → faux client dont
 *    `.storage.from()` expose les mocks nécessaires (vi.hoisted, car les
 *    factories vi.mock sont hoistées AU-DESSUS des const).
 *  - `@qualiof/shared/env` mocké via un getter sur `mockEnv` hoisté →
 *    pilote STORAGE_PROVIDER sans charger `.env` (le harness ne charge pas
 *    `.env` en test, storage.ts exécute createEnv() au load sinon).
 *  - PROVIDER est capturé au LOAD du module → tester le provider minio
 *    (Test 2) exige vi.resetModules() + mockEnv.STORAGE_PROVIDER='minio'
 *    + ré-import du module.
 *
 * PROTOCOLE DE MUTATION (non commité, feedback_test_de_puissance_mutation) :
 *   Dans storage.ts createSignedUploadUrl, casser `{ upsert: true }` → `{ upsert: false }`.
 *   → Test 1 (toHaveBeenCalledWith(..., { upsert: true })) DOIT virer ROUGE.
 *   → restaurer → 6/6 VERT.
 */

// ─── Mocks Supabase storage (hoistés) ──────────────────────────────
const {
  createSignedUploadUrlMock,
  listMock,
  createSignedUrlMock,
  getBucketMock,
  createBucketMock,
  downloadMock,
  fromMock,
} = vi.hoisted(() => {
  const createSignedUploadUrlMock = vi.fn();
  const listMock = vi.fn();
  const createSignedUrlMock = vi.fn();
  const getBucketMock = vi.fn();
  const createBucketMock = vi.fn();
  const downloadMock = vi.fn();
  const fromMock = vi.fn(() => ({
    createSignedUploadUrl: createSignedUploadUrlMock,
    list: listMock,
    createSignedUrl: createSignedUrlMock,
    download: downloadMock,
  }));
  return {
    createSignedUploadUrlMock,
    listMock,
    createSignedUrlMock,
    getBucketMock,
    createBucketMock,
    downloadMock,
    fromMock,
  };
});

// mockEnv piloté par les tests (getter → lecture dynamique à chaque `sharedEnv.X`).
const mockEnv = vi.hoisted(() => ({
  STORAGE_PROVIDER: 'supabase' as 'supabase' | 'minio',
  SUPABASE_URL: 'https://sb.example.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: fromMock,
      getBucket: getBucketMock,
      createBucket: createBucketMock,
    },
  })),
}));

vi.mock('@qualiof/shared/env', () => ({
  sharedEnv: {
    get STORAGE_PROVIDER() {
      return mockEnv.STORAGE_PROVIDER;
    },
    get SUPABASE_URL() {
      return mockEnv.SUPABASE_URL;
    },
    get SUPABASE_SERVICE_ROLE_KEY() {
      return mockEnv.SUPABASE_SERVICE_ROLE_KEY;
    },
  },
}));

import * as storage from '../storage';

beforeEach(() => {
  createSignedUploadUrlMock.mockReset();
  listMock.mockReset();
  createSignedUrlMock.mockReset();
  getBucketMock.mockReset();
  createBucketMock.mockReset();
  downloadMock.mockReset();
  fromMock.mockClear();
  mockEnv.STORAGE_PROVIDER = 'supabase';
});

describe('createSignedUploadUrl', () => {
  it('Test 1 (supabase) : appelle createSignedUploadUrl(key, { upsert: true }) et retourne { path, token, signedUrl }', async () => {
    getBucketMock.mockResolvedValueOnce({ data: { name: 'preinscriptions' } });
    createSignedUploadUrlMock.mockResolvedValueOnce({
      data: {
        path: 'p/x.pdf',
        token: 'tok-123',
        signedUrl: 'https://sb/signed/p/x.pdf?token=tok-123',
      },
      error: null,
    });

    const result = await storage.createSignedUploadUrl('preinscriptions', 'p/x.pdf');

    expect(result.path).toBe('p/x.pdf');
    expect(result.token).toBe('tok-123');
    expect(result.signedUrl).toContain('signed');
    // Mutation-safe : { upsert: true } → { upsert: false } fait virer ce test ROUGE.
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith('p/x.pdf', { upsert: true });
  });

  it('Test 2 (minio) : presigned PUT S3 — URL absolue signée, token vide (audit 2026-08-12)', async () => {
    // Avant : throw « Supabase uniquement » → le formulaire public ne pouvait
    // pas uploader en mode local/MinIO. Désormais : presigned PUT S3-compatible.
    vi.resetModules();
    mockEnv.STORAGE_PROVIDER = 'minio';
    const fresh = await import('../storage');
    const res = await fresh.createSignedUploadUrl('preinscriptions', 'k');
    expect(res.path).toBe('k');
    expect(res.token).toBe(''); // token = mécanique Supabase, sans objet en S3
    expect(res.signedUrl).toMatch(/^https?:\/\//); // absolue → utilisée telle quelle par le client
    expect(res.signedUrl).toContain('X-Amz-Signature=');
    expect(res.signedUrl).toContain('/preinscriptions/k');
  });
});

describe('objectExists', () => {
  it('Test 3 (true) : list(prefix, { search: name }) trouve l\'objet → true, SANS download', async () => {
    listMock.mockResolvedValueOnce({ data: [{ name: 'cni.pdf' }], error: null });

    const exists = await storage.objectExists('qualiof-docs', 'apprenants/t1/uuid/cni.pdf');

    expect(exists).toBe(true);
    expect(listMock).toHaveBeenCalledWith('apprenants/t1/uuid', { search: 'cni.pdf' });
    // Preuve qu'objectExists ne télécharge JAMAIS l'objet (Pitfall 6).
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('Test 4 (false) : list renvoie [] → false', async () => {
    listMock.mockResolvedValueOnce({ data: [], error: null });

    const exists = await storage.objectExists('qualiof-docs', 'apprenants/t1/uuid/cni.pdf');

    expect(exists).toBe(false);
    expect(downloadMock).not.toHaveBeenCalled();
  });
});

describe('ensureBucket (Supabase)', () => {
  it('Test 5 : bucket absent → createBucket(bucket, { public: false, fileSizeLimit: 52428800 })', async () => {
    getBucketMock.mockResolvedValueOnce({ data: null });
    createBucketMock.mockResolvedValueOnce({ error: null });

    // Nom de bucket unique pour contourner le cache _ensuredBuckets du module.
    await storage.ensureBucket('bucket-ensure-test-1');

    expect(createBucketMock).toHaveBeenCalledWith(expect.any(String), {
      public: false,
      fileSizeLimit: 52428800,
    });
  });
});

describe('createSignedDownloadUrl (Supabase)', () => {
  it('Test 6 : appelle createSignedUrl(key, 600) par défaut et retourne data.signedUrl', async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: { signedUrl: 'https://sb/dl?tok' },
      error: null,
    });

    const url = await storage.createSignedDownloadUrl('qualiof-docs', 'k');

    expect(url).toBe('https://sb/dl?tok');
    expect(createSignedUrlMock).toHaveBeenCalledWith('k', 600);
  });
});
