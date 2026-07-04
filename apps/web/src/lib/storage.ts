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
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

function supabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase Storage : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local',
    );
  }
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

export const _internals = { PROVIDER };
