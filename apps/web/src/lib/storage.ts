/**
 * Storage adapter MinIO/S3 pour QualiOF.
 * Tous les buckets sont créés à la volée si absents.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const REGION = process.env.S3_REGION ?? 'us-east-1';
const ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'qualiof';
const SECRET_KEY = process.env.S3_SECRET_KEY ?? 'qualiof_dev_minio';

export const PREENROLLMENT_BUCKET = 'preinscriptions';

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
  const r = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Fichier vide ou introuvable');
  // @ts-expect-error - sdk renvoie un stream Node ou un Web stream selon environnement
  const chunks: Uint8Array[] = [];
  // @ts-expect-error
  for await (const chunk of r.Body) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks);
}
