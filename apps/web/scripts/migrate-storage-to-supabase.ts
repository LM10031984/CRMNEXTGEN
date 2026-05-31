/**
 * Migration des fichiers existants MinIO → Supabase Storage.
 *
 * À exécuter UNE FOIS, après avoir :
 *  1) Créé le bucket `learner-documents` dans le Dashboard Supabase
 *     (Storage → New bucket → Private, NO public).
 *  2) Renseigné SUPABASE_SERVICE_ROLE_KEY dans .env (projet vgyxuury).
 *  3) Démarré MinIO local (docker compose up postgres minio redis).
 *
 * Lecture des clés depuis la BDD (`PreEnrollment.cniKey/ribKey/cfpKey` +
 * `Document.bucket/key`). Pour chaque clé, le script :
 *  - télécharge depuis MinIO (S3 driver)
 *  - upload vers Supabase (avec le prefix folder `{logicalBucket}/{key}`)
 *  - log SUCCESS / SKIP / ERROR
 *
 * Mode dry-run par défaut. Passer `--apply` pour faire vraiment l'upload.
 *
 * Le script NE TOUCHE PAS à la BDD : les clés stockées restent les mêmes,
 * elles fonctionnent telles quelles avec le nouveau driver Supabase (qui les
 * mappe automatiquement à `learner-documents/{logicalBucket}/{key}`).
 *
 * Usage :
 *   pnpm --filter @qualiof/web exec tsx scripts/migrate-storage-to-supabase.ts          # dry-run
 *   pnpm --filter @qualiof/web exec tsx scripts/migrate-storage-to-supabase.ts --apply  # vraie migration
 */

import 'dotenv/config';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@qualiof/db';

const APPLY = process.argv.includes('--apply');
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'learner-documents';

const PREENROLLMENT_BUCKET = 'preinscriptions';
const DOCS_BUCKET = process.env.S3_BUCKET_DOCS ?? 'qualiof-docs';

function s3() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'qualiof',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'qualiof_dev_minio',
    },
    forcePathStyle: true,
  });
}

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface Item {
  logicalBucket: string;
  key: string;
  source: string; // libellé pour le log (ex: "PreEnrollment.cniKey:abc-123")
}

async function collectItems(): Promise<Item[]> {
  const items: Item[] = [];

  const preinscriptions = await prisma.preEnrollment.findMany({
    select: { id: true, cniKey: true, ribKey: true, cfpKey: true },
  });
  for (const pe of preinscriptions) {
    if (pe.cniKey) items.push({ logicalBucket: PREENROLLMENT_BUCKET, key: pe.cniKey, source: `PreEnrollment.cniKey:${pe.id}` });
    if (pe.ribKey) items.push({ logicalBucket: PREENROLLMENT_BUCKET, key: pe.ribKey, source: `PreEnrollment.ribKey:${pe.id}` });
    if (pe.cfpKey) items.push({ logicalBucket: PREENROLLMENT_BUCKET, key: pe.cfpKey, source: `PreEnrollment.cfpKey:${pe.id}` });
  }

  // Documents Qualiopi générés (conventions, attestations, etc.) — stockage clé/bucket distincts.
  const docs = await prisma.document.findMany({
    select: { id: true, bucket: true, key: true },
    where: { key: { not: null } },
  });
  for (const d of docs) {
    if (d.bucket && d.key) {
      items.push({ logicalBucket: d.bucket, key: d.key, source: `Document:${d.id}` });
    }
  }

  return items;
}

async function fileExistsInSupabase(client: ReturnType<typeof supabase>, fullPath: string): Promise<boolean> {
  // Pas de HEAD natif → on tente un createSignedUrl très court ; si OK, le fichier existe.
  const { error } = await client.storage.from(SUPABASE_BUCKET).createSignedUrl(fullPath, 5);
  return !error;
}

async function migrateOne(s3Client: S3Client, sbClient: ReturnType<typeof supabase>, item: Item): Promise<'OK' | 'SKIP_ALREADY' | 'SKIP_NOT_FOUND' | 'ERROR'> {
  const fullPath = `${item.logicalBucket}/${item.key}`;

  // Vérifie l'existence côté MinIO d'abord (évite des erreurs cryptiques)
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: item.logicalBucket, Key: item.key }));
  } catch {
    return 'SKIP_NOT_FOUND';
  }

  // Skip si déjà uploadé côté Supabase (idempotence)
  if (await fileExistsInSupabase(sbClient, fullPath)) {
    return 'SKIP_ALREADY';
  }

  if (!APPLY) return 'OK'; // dry-run

  // Download depuis MinIO
  const r = await s3Client.send(new GetObjectCommand({ Bucket: item.logicalBucket, Key: item.key }));
  if (!r.Body) return 'ERROR';
  const chunks: Uint8Array[] = [];
  for await (const chunk of r.Body as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  // Upload vers Supabase
  const contentType = r.ContentType ?? 'application/octet-stream';
  const { error } = await sbClient.storage.from(SUPABASE_BUCKET).upload(fullPath, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error(`  ERROR upload ${fullPath} : ${error.message}`);
    return 'ERROR';
  }
  return 'OK';
}

async function main() {
  console.log(`\n=== Migration MinIO → Supabase Storage (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  console.log(`Bucket Supabase : ${SUPABASE_BUCKET}\n`);

  const items = await collectItems();
  console.log(`${items.length} fichiers à migrer.\n`);

  const s3Client = s3();
  const sbClient = supabase();

  // Sanity check : le bucket existe-t-il ?
  const { data: bucketInfo, error: bucketErr } = await sbClient.storage.getBucket(SUPABASE_BUCKET);
  if (bucketErr || !bucketInfo) {
    console.error(`\n❌ Bucket "${SUPABASE_BUCKET}" introuvable côté Supabase. Créez-le manuellement dans le dashboard (privé) avant de relancer.\n`);
    process.exit(1);
  }

  let ok = 0, skipAlready = 0, skipNotFound = 0, errors = 0;
  for (const item of items) {
    const status = await migrateOne(s3Client, sbClient, item);
    if (status === 'OK') ok++;
    else if (status === 'SKIP_ALREADY') skipAlready++;
    else if (status === 'SKIP_NOT_FOUND') skipNotFound++;
    else errors++;
    process.stdout.write(`  [${status.padEnd(16)}] ${item.source} → ${item.logicalBucket}/${item.key}\n`);
  }

  console.log(`\n=== Résumé ===`);
  console.log(`  OK              : ${ok}${APPLY ? '' : ' (dry-run, rien envoyé)'}`);
  console.log(`  SKIP_ALREADY    : ${skipAlready} (déjà dans Supabase)`);
  console.log(`  SKIP_NOT_FOUND  : ${skipNotFound} (clé en BDD, fichier absent de MinIO)`);
  console.log(`  ERROR           : ${errors}`);

  if (!APPLY) {
    console.log(`\n💡 Relancez avec --apply pour faire la vraie migration.\n`);
  } else if (errors === 0) {
    console.log(`\n✅ Migration terminée. Basculez STORAGE_DRIVER="supabase" dans .env et redémarrez Next.\n`);
  } else {
    console.log(`\n⚠️ ${errors} erreur(s) — vérifiez les logs ci-dessus.\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
