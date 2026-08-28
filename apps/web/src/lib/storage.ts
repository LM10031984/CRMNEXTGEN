/**
 * Storage adapter — MinIO/S3 (local Docker) OU Supabase Storage (cloud).
 *
 * Switch par env var STORAGE_PROVIDER :
 *   - "minio"     (défaut) : MinIO local Docker via @aws-sdk/client-s3
 *   - "supabase"           : Supabase Storage via @supabase/supabase-js
 *
 * Interface publique identique pour les 2 providers → zéro impact sur
 * les call sites (uploadFile / downloadFile / ensureBucket).
 *
 * Migration cloud v6 (branche cloud-migration, 2026-06-03).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { sharedEnv } from '@qualiof/shared/env';

const PROVIDER = sharedEnv.STORAGE_PROVIDER;

// ─── Constantes communes ───────────────────────────────────────────
export const PREENROLLMENT_BUCKET = 'preinscriptions';
export const DOCS_BUCKET = process.env.S3_BUCKET_DOCS ?? 'qualiof-docs';

// ─── MinIO (S3-compat, local Docker) ───────────────────────────────
const MINIO_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const MINIO_REGION = process.env.S3_REGION ?? 'us-east-1';
const MINIO_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'qualiof';
const MINIO_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'qualiof_dev_minio';

let _s3Client: S3Client | null = null;

function s3(): S3Client {
  if (_s3Client) return _s3Client;
  _s3Client = new S3Client({
    endpoint: MINIO_ENDPOINT,
    region: MINIO_REGION,
    credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
    forcePathStyle: true,
  });
  return _s3Client;
}

// ─── Supabase Storage (cloud) ──────────────────────────────────────
const SUPABASE_URL = sharedEnv.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = sharedEnv.SUPABASE_SERVICE_ROLE_KEY ?? '';

let _supabaseClient: SupabaseClient | null = null;

/**
 * Polyfill WebSocket global pour Node < 22 (conteneur worker Railway = node:20).
 * @supabase/supabase-js@2.107 embarque realtime-js dont la websocket-factory
 * throw « Node.js 20 detected without native WebSocket support » dès qu'un client
 * est construit sur Node 20 (WebSocket n'est global-stable qu'en Node 22+). On
 * n'utilise QUE Storage (pas Realtime), mais le client l'évalue quand même →
 * on fournit l'implémentation `ws` sur globalThis (idempotent, no-op si déjà
 * présent, ex. Node 22+/Next.js). Bug révélé au smoke runtime Railway (Phase 20-05).
 */
function ensureWebSocketPolyfill(): void {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'undefined') return;
  try {
    // `require` n'existe pas en contexte ESM (worker tsx) → createRequire.
    // Import CJS de `ws` (dépendance directe de @qualiof/web).
    const require2 = createRequire(import.meta.url);
    (globalThis as { WebSocket?: unknown }).WebSocket = require2('ws');
  } catch (e) {
    console.warn(
      '[storage] WebSocket polyfill (ws) indisponible — Supabase realtime-js peut échouer sur Node < 22 :',
      (e as Error).message,
    );
  }
}

function supabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase Storage : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local',
    );
  }
  ensureWebSocketPolyfill();
  _supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabaseClient;
}

// ─── ensureBucket ──────────────────────────────────────────────────
const _ensuredBuckets = new Set<string>();

export async function ensureBucket(bucket: string): Promise<void> {
  if (_ensuredBuckets.has(bucket)) return;

  if (PROVIDER === 'supabase') {
    const sb = supabase();
    const { data: existing } = await sb.storage.getBucket(bucket);
    if (!existing) {
      const { error } = await sb.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024, // 50 MiB
      });
      // Tolère "already exists" en cas de race condition
      if (error && !/already exists/i.test(error.message)) throw error;
    }
  } else {
    const c = s3();
    try {
      await c.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      try {
        await c.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (e: any) {
        if (e?.Code !== 'BucketAlreadyOwnedByYou' && e?.Code !== 'BucketAlreadyExists') {
          throw e;
        }
      }
    }
  }

  _ensuredBuckets.add(bucket);
}

// ─── uploadFile ────────────────────────────────────────────────────
export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<{ key: string; bucket: string; size: number }> {
  await ensureBucket(bucket);

  if (PROVIDER === 'supabase') {
    const { error } = await supabase()
      .storage.from(bucket)
      .upload(key, body, {
        contentType: contentType ?? 'application/octet-stream',
        upsert: true, // idempotent : ré-upload même clé = overwrite
      });
    if (error) throw new Error(`Supabase upload failed : ${error.message}`);
    return { key, bucket, size: body.length };
  }

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, bucket, size: body.length };
}

// ─── downloadFile ──────────────────────────────────────────────────
export async function downloadFile(bucket: string, key: string): Promise<Buffer> {
  if (PROVIDER === 'supabase') {
    const { data, error } = await supabase().storage.from(bucket).download(key);
    if (error) throw new Error(`Supabase download failed : ${error.message}`);
    if (!data) throw new Error('Fichier vide ou introuvable (Supabase)');
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Fichier vide ou introuvable');
  const chunks: Uint8Array[] = [];
  for await (const chunk of r.Body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ─── signedUrl (utile pour /api/documents/[id] qui sert un PDF) ────
/**
 * Génère une URL signée temporaire pour servir un fichier sans exposer
 * les credentials. Sur Supabase = natif (createSignedUrl). Sur MinIO =
 * pas implémenté V1 (les routes /api proxy le download via downloadFile).
 */
export async function createSignedDownloadUrl(
  bucket: string,
  key: string,
  expiresInSec = 60 * 10,
): Promise<string> {
  if (PROVIDER === 'supabase') {
    const { data, error } = await supabase()
      .storage.from(bucket)
      .createSignedUrl(key, expiresInSec);
    if (error) throw new Error(`Supabase signedUrl failed : ${error.message}`);
    return data.signedUrl;
  }
  // En local MinIO, on retourne un placeholder qui force le passage par
  // l'API route (qui appelle downloadFile et stream le buffer).
  // Évite d'exposer l'endpoint MinIO directement au navigateur.
  throw new Error(
    'createSignedDownloadUrl non implémenté pour MinIO en local — utiliser une route API /api/documents/[id]',
  );
}

// ─── createSignedUploadUrl (upload direct navigateur→Supabase) ─────
/**
 * Génère un signed upload URL/token qui permet au NAVIGATEUR d'uploader
 * DIRECTEMENT vers Supabase (via uploadToSignedUrl), sans faire transiter
 * le fichier par le serveur Next → contourne le cap 4,5 Mo body Vercel
 * (STOR-03). Supabase UNIQUEMENT : en MinIO local, l'upload passe par le
 * serveur (uploadFile), pas de direct-to-storage.
 *
 * Le token porte la signature — aucun credential (service_role) n'est
 * exposé au client.
 */
export async function createSignedUploadUrl(
  bucket: string,
  key: string,
  contentType?: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  if (PROVIDER !== 'supabase') {
    // MinIO / S3-compatible : presigned PUT (audit 2026-08-12). Avant, cette
    // branche jetait « Supabase uniquement » → le formulaire public de
    // pré-inscription ne pouvait PAS uploader en mode local/MinIO alors que
    // storage.ts promet la parité de providers. URL absolue → le client
    // (direct-upload-field) l'utilise telle quelle. `token` inutile côté S3.
    await ensureBucket(bucket);
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    });
    const signedUrl = await getSignedUrl(s3(), cmd, { expiresIn: 600 });
    return { path: key, token: '', signedUrl };
  }
  await ensureBucket(bucket);
  const { data, error } = await supabase()
    .storage.from(bucket)
    .createSignedUploadUrl(key, { upsert: true });
  if (error) throw new Error(`Supabase signed upload URL failed : ${error.message}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

// ─── objectExists (vérif 0 lien mort SANS télécharger l'objet) ─────
/**
 * Teste l'existence d'un objet sans transférer son contenu (STOR-02 :
 * vérif de 0 lien mort sur potentiellement des milliers d'objets — ne
 * jamais télécharger 50 Mo juste pour tester la présence, cf. Pitfall 6).
 *   - Supabase : list(prefix, { search: name }) = métadonnées seules.
 *   - MinIO    : HeadObjectCommand (exists → true, 404/NotFound → false).
 */
export async function objectExists(bucket: string, key: string): Promise<boolean> {
  const idx = key.lastIndexOf('/');
  const prefix = idx >= 0 ? key.slice(0, idx) : '';
  const name = idx >= 0 ? key.slice(idx + 1) : key;

  if (PROVIDER === 'supabase') {
    const { data, error } = await supabase()
      .storage.from(bucket)
      .list(prefix, { search: name });
    if (error) throw new Error(`Supabase list failed : ${error.message}`);
    return (data ?? []).some((o) => o.name === name);
  }

  // MinIO : HeadObjectCommand — existe → true, 404/NotFound → false.
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e: any) {
    if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

// ─── listObjects / deleteFile (purge des brouillons abandonnés) ────
/**
 * Un objet du stockage, réduit à ce dont la purge a besoin.
 * `lastModified` peut être absent selon le provider : l'appelant décide quoi
 * faire d'un objet sans date plutôt que de se voir imposer une date inventée.
 */
export interface StoredObject {
  key: string;
  lastModified: Date | null;
  size: number | null;
}

/**
 * Liste RÉCURSIVEMENT les objets sous un préfixe.
 *
 * Supabase ne descend pas tout seul dans les sous-dossiers (`list()` renvoie
 * les entrées d'un seul niveau, un « dossier » étant une entrée sans `id`) :
 * on parcourt donc l'arbre à la main. S3 pagine, d'où la boucle sur le token.
 */
export async function listObjects(bucket: string, prefix = ''): Promise<StoredObject[]> {
  if (PROVIDER === 'supabase') {
    const client = supabase();
    const out: StoredObject[] = [];
    const aVisiter: string[] = [prefix.replace(/\/+$/, '')];

    while (aVisiter.length > 0) {
      const dossier = aVisiter.pop()!;
      const { data, error } = await client.storage
        .from(bucket)
        .list(dossier, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error(`Supabase list failed : ${error.message}`);

      for (const entree of data ?? []) {
        const chemin = dossier ? `${dossier}/${entree.name}` : entree.name;
        // Une entrée sans `id` est un dossier, pas un objet.
        if (entree.id === null || entree.id === undefined) {
          aVisiter.push(chemin);
          continue;
        }
        out.push({
          key: chemin,
          lastModified: entree.updated_at ? new Date(entree.updated_at) : null,
          size: (entree.metadata as { size?: number } | null)?.size ?? null,
        });
      }
    }
    return out;
  }

  const out: StoredObject[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      out.push({
        key: o.Key,
        lastModified: o.LastModified ?? null,
        size: o.Size ?? null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * Supprime UN objet. Destructif et sans corbeille : les appelants doivent
 * fonctionner à sec par défaut et n'écrire qu'après confirmation explicite
 * (cf. scripts/purge-orphan-drafts.ts).
 */
export async function deleteFile(bucket: string, key: string): Promise<void> {
  if (PROVIDER === 'supabase') {
    const { error } = await supabase().storage.from(bucket).remove([key]);
    if (error) throw new Error(`Supabase delete failed : ${error.message}`);
    return;
  }
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export const _internals = { PROVIDER };
