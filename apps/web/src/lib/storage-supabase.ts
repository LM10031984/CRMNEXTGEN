/**
 * Driver Supabase Storage pour QualiOF (Plan B, Mai 2026).
 *
 * Centralisation facturation demandée par Mr Marx : on bouge les pièces
 * apprenants (CNI / RIB / CFP) de MinIO local vers Supabase Storage.
 *
 * Convention bucket : un seul bucket `learner-documents` (configurable via
 * `SUPABASE_STORAGE_BUCKET`). Les "buckets logiques" du code existant
 * (`preinscriptions`, `qualiof-docs`) deviennent des **préfixes de dossier**
 * à l'intérieur du bucket Supabase. Ainsi le code consommateur reste
 * inchangé : `uploadFile(PREENROLLMENT_BUCKET, key, ...)` route vers
 * `learner-documents/preinscriptions/{key}` côté Supabase, et vers
 * `preinscriptions/{key}` côté MinIO — selon `STORAGE_DRIVER`.
 *
 * Auth via `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS storage policies).
 * Ne JAMAIS exposer cette clé côté client. Ce module est server-only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'learner-documents';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      'SUPABASE_URL manquante. Configurer la variable dans .env (projet vgyxuury…supabase.co).',
    );
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY manquante. Récupérer dans Dashboard Supabase → Settings → API.',
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/** Compose le chemin Supabase à partir du "bucket logique" + key. */
function path(logicalBucket: string, key: string): string {
  return `${logicalBucket}/${key}`;
}

let _ensuredBucket = false;

export async function ensureBucketSupabase(_logicalBucket: string): Promise<void> {
  // Côté Supabase, on n'a qu'UN bucket physique (`learner-documents`) qui doit
  // être pré-créé manuellement dans le dashboard (Storage → New bucket → privé).
  // Cette fonction se contente de vérifier qu'il existe, une seule fois par process.
  if (_ensuredBucket) return;
  const c = getClient();
  const { data, error } = await c.storage.getBucket(SUPABASE_BUCKET);
  if (error || !data) {
    throw new Error(
      `Bucket Supabase "${SUPABASE_BUCKET}" introuvable. Créer dans Dashboard → Storage → New bucket (privé). Erreur: ${error?.message ?? 'inconnue'}`,
    );
  }
  _ensuredBucket = true;
}

export async function uploadFileSupabase(
  logicalBucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<{ key: string; bucket: string; size: number }> {
  await ensureBucketSupabase(logicalBucket);
  const fullPath = path(logicalBucket, key);
  const c = getClient();
  const { error } = await c.storage.from(SUPABASE_BUCKET).upload(fullPath, body, {
    contentType: contentType ?? 'application/octet-stream',
    upsert: true, // pattern existant côté MinIO : pas de conflit nominal puisque le key inclut un timestamp
  });
  if (error) throw new Error(`Supabase upload failed (${fullPath}) : ${error.message}`);
  return { key, bucket: logicalBucket, size: body.length };
}

export async function downloadFileSupabase(
  logicalBucket: string,
  key: string,
): Promise<Buffer> {
  const fullPath = path(logicalBucket, key);
  const c = getClient();
  const { data, error } = await c.storage.from(SUPABASE_BUCKET).download(fullPath);
  if (error || !data) {
    throw new Error(`Supabase download failed (${fullPath}) : ${error?.message ?? 'no data'}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function getFileSignedUrlSupabase(
  logicalBucket: string,
  key: string,
  opts?: { expiresIn?: number; downloadFilename?: string },
): Promise<string> {
  const fullPath = path(logicalBucket, key);
  const expiresIn = opts?.expiresIn ?? 300;
  const c = getClient();
  const { data, error } = await c.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(fullPath, expiresIn, {
      download: opts?.downloadFilename ?? false, // si chaîne → force attachment+filename
    });
  if (error || !data) {
    throw new Error(
      `Supabase signed URL failed (${fullPath}) : ${error?.message ?? 'no data'}`,
    );
  }
  return data.signedUrl;
}
