/**
 * Storage adapter QualiOF — façade unique exposant `uploadFile`,
 * `downloadFile`, `getFileSignedUrl`, `ensureBucket`.
 *
 * Driver sélectionné via `STORAGE_DRIVER` :
 *  - `s3` (default) : MinIO en dev, S3 AWS / Cloudflare R2 / Wasabi en prod.
 *  - `supabase`     : Supabase Storage via SDK natif (Plan B Mai 2026 — Mr Marx
 *                     centralisation facturation). Implémenté dans
 *                     `storage-supabase.ts`. Le "bucket logique" passé en
 *                     argument devient un préfixe folder dans le bucket
 *                     physique `SUPABASE_STORAGE_BUCKET` (default `learner-documents`).
 *
 * L'API publique est identique pour les deux drivers → aucun changement
 * dans les consommateurs (preinscription-public.ts, closure-pack.ts, etc.).
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ensureBucketSupabase,
  uploadFileSupabase,
  downloadFileSupabase,
  getFileSignedUrlSupabase,
} from './storage-supabase';

type StorageDriver = 's3' | 'supabase';
const DRIVER: StorageDriver = (process.env.STORAGE_DRIVER as StorageDriver) ?? 's3';

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const REGION = process.env.S3_REGION ?? 'us-east-1';
const ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'qualiof';
const SECRET_KEY = process.env.S3_SECRET_KEY ?? 'qualiof_dev_minio';

export const PREENROLLMENT_BUCKET = 'preinscriptions';
export const DOCS_BUCKET = process.env.S3_BUCKET_DOCS ?? 'qualiof-docs';

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  });
  return _client;
}

const _ensuredBuckets = new Set<string>();

export async function ensureBucket(bucket: string): Promise<void> {
  if (DRIVER === 'supabase') return ensureBucketSupabase(bucket);
  if (_ensuredBuckets.has(bucket)) return;
  const c = client();
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
  _ensuredBuckets.add(bucket);
}

export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<{ key: string; bucket: string; size: number }> {
  if (DRIVER === 'supabase') {
    return uploadFileSupabase(bucket, key, body, contentType);
  }
  await ensureBucket(bucket);
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, bucket, size: body.length };
}

export async function downloadFile(bucket: string, key: string): Promise<Buffer> {
  if (DRIVER === 'supabase') {
    return downloadFileSupabase(bucket, key);
  }
  const r = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Fichier vide ou introuvable');
  const chunks: Uint8Array[] = [];
  // sdk renvoie un stream Node ou un Web stream selon environnement
  for await (const chunk of r.Body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// URL pré-signée pour téléchargement direct par le navigateur (TTL court).
export async function getFileSignedUrl(
  bucket: string,
  key: string,
  opts?: { expiresIn?: number; downloadFilename?: string },
): Promise<string> {
  if (DRIVER === 'supabase') {
    return getFileSignedUrlSupabase(bucket, key, opts);
  }
  const expiresIn = opts?.expiresIn ?? 300; // 5 min
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: opts?.downloadFilename
      ? `attachment; filename="${opts.downloadFilename.replace(/"/g, '')}"`
      : undefined,
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}
