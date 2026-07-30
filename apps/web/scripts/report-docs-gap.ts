// report-docs-gap.ts — Report LOCAL → CLOUD des DOCUMENTS et artefacts de génération
// (Phase 22, plan 22-03 — RÉVISION décision Laurent 2026-07-07 : « copier ce que
// j'ai sur ma base dans la nouvelle », les documents 16/06→04/07 inclus).
//
// Complète report-data-gap.ts (données métier) avec les 4 tables de génération :
// ClosureBatch, ClosureJob, Document, PedagogicalAsset — périmètre = toute ligne
// locale ABSENTE du cloud (id-diff ; le local est figé depuis le 04/07, donc
// l'écart = exactement la période 16/06→04/07, pack témoin SES-0093 inclus).
// AIGenerationJob (traçabilité prompts) reste hors périmètre — archivé au 22-10.
//
// ORDRE SÛR (jamais de ligne cloud pointant vers un objet storage manquant) :
//   Phase A — inventaire id-diff + garde-fou volumes ;
//   Phase B — backfill STORAGE d'abord : objets MinIO → Supabase (upsert) pour
//             les clés pdfUrl des lignes à reporter, pattern 21-02 ;
//   Phase C — insert des lignes DB (ClosureBatch → Document → PedagogicalAsset
//             → ClosureJob). Une ligne dont l'objet storage est introuvable des
//             DEUX stores est EXCLUE et listée (0 lien mort garanti).
//
// Usage :
//   LOCAL_DATABASE_URL=postgresql://qualiof:qualiof_dev@localhost:5432/qualiof \
//   CLOUD_DATABASE_URL=<DIRECT_URL> \
//   pnpm exec dotenv -e ../../.env -- tsx scripts/report-docs-gap.ts          # DRY
//   WRITE=1 ... pnpm exec dotenv -e ../../.env -- tsx scripts/report-docs-gap.ts
//   (dotenv fournit SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / S3_* ; dotenv-cli
//    n'écrase pas les variables déjà posées → LOCAL/CLOUD_DATABASE_URL priment.)
//
// Garanties : DRY par défaut ; upserts INSERT-ONLY par id (update vide — aucune
// ligne cloud existante modifiée), SAUF conflit d'unique PedagogicalAsset
// [sessionId, participantId, kind] : si la version LOCALE est strictement plus
// récente (generatedAt), la ligne cloud (version périmée du 16/06) est REMPLACÉE
// par UPDATE in-place (contenu + id local — les ClosureJob reportés restent
// cohérents) ; si la version cloud est plus récente ou égale → SKIP (cloud gagne).
// Sonde pré-WRITE du 07/07 : 252 conflits, 252/252 local plus récent, 0 cloud.
// AUCUNE suppression ; AUCUNE écriture locale ; SÉQUENTIEL strict.

import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, Prisma } from '@qualiof/db';
import { isInvalidSupabaseKey } from './migrate-storage';
import { DOCS_BUCKET } from '@/lib/storage';

// ─── Gardes de démarrage ────────────────────────────────────────────
const LOCAL_URL = process.env.LOCAL_DATABASE_URL;
const CLOUD_URL = process.env.CLOUD_DATABASE_URL;
const WRITE = process.env.WRITE === '1';

if (!LOCAL_URL || LOCAL_URL.toLowerCase().includes('supabase')) {
  console.error('ERREUR : LOCAL_DATABASE_URL absent ou pointe Supabase (garde anti-inversion).');
  process.exit(2);
}
if (!CLOUD_URL || !CLOUD_URL.toLowerCase().includes('supabase')) {
  console.error('ERREUR : CLOUD_DATABASE_URL absent ou ne pointe pas Supabase.');
  process.exit(2);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERREUR : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY requis (lancer via dotenv -e ../../.env).');
  process.exit(2);
}

// Garde-fou volumes (bornes connues ×1,2) : au-delà → STOP au DRY, remonter les chiffres.
const VOLUME_BOUNDS: Record<string, number> = {
  ClosureBatch: Math.ceil(171 * 1.2),
  ClosureJob: Math.ceil(3397 * 1.2),
  Document: Math.ceil(1005 * 1.2),
  PedagogicalAsset: Math.ceil(1635 * 1.2),
};
const STORAGE_BOUND = Math.ceil(2600 * 1.2);

const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const cloud = new PrismaClient({ datasources: { db: { url: CLOUD_URL } } });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'qualiof',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'qualiof_dev_minio',
  },
  forcePathStyle: true,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Helpers storage (pattern 21-02, lecture seule sauf upload WRITE) ──
const prefixCache = new Map<string, Set<string>>();
async function supabaseHas(bucket: string, key: string): Promise<boolean> {
  const idx = key.lastIndexOf('/');
  const prefix = idx >= 0 ? key.slice(0, idx) : '';
  const name = idx >= 0 ? key.slice(idx + 1) : key;
  const cacheKey = `${bucket}::${prefix}`;
  if (!prefixCache.has(cacheKey)) {
    const names = new Set<string>();
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`Supabase list ${bucket}/${prefix} : ${error.message}`);
      for (const o of data ?? []) names.add(o.name);
      if (!data || data.length < 1000) break;
      offset += data.length;
    }
    prefixCache.set(cacheKey, names);
  }
  return prefixCache.get(cacheKey)!.has(name);
}

async function minioGetBuffer(bucket: string, key: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Objet vide ou introuvable (MinIO)');
  const chunks: Uint8Array[] = [];
  for await (const chunk of r.Body as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function minioHas(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function contentTypeFor(key: string): string {
  if (key.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (/\.(jpe?g)$/i.test(key)) return 'image/jpeg';
  if (/\.png$/i.test(key)) return 'image/png';
  return 'application/octet-stream';
}

// ─── Inventaire id-diff ─────────────────────────────────────────────
async function missingIds(model: string): Promise<string[]> {
  const l: { id: string }[] = await (local as unknown as Record<string, any>)[model].findMany({ select: { id: true } });
  const c: { id: string }[] = await (cloud as unknown as Record<string, any>)[model].findMany({ select: { id: true } });
  const cloudSet = new Set(c.map((r) => r.id));
  return l.map((r) => r.id).filter((id) => !cloudSet.has(id));
}

async function main(): Promise<void> {
  console.log(`Mode : ${WRITE ? 'WRITE (écriture réelle CLOUD + Supabase Storage)' : 'DRY-RUN (aucune écriture)'}`);
  console.log('');

  // ── Phase A : inventaire + garde-fou volumes ──────────────────────
  const missing = {
    closureBatch: await missingIds('closureBatch'),
    document: await missingIds('document'),
    pedagogicalAsset: await missingIds('pedagogicalAsset'),
    closureJob: await missingIds('closureJob'),
  };
  const counts: Record<string, number> = {
    ClosureBatch: missing.closureBatch.length,
    Document: missing.document.length,
    PedagogicalAsset: missing.pedagogicalAsset.length,
    ClosureJob: missing.closureJob.length,
  };
  console.log('## Phase A — inventaire (lignes locales absentes du cloud)');
  for (const [t, n] of Object.entries(counts)) console.log(`   ${t} : ${n} (borne ${VOLUME_BOUNDS[t]})`);

  const overflow = Object.entries(counts).filter(([t, n]) => n > VOLUME_BOUNDS[t]);
  if (overflow.length > 0) {
    console.error(`\n⛔ GARDE-FOU VOLUMES : ${overflow.map(([t, n]) => `${t}=${n}`).join(', ')} dépasse les bornes — STOP sans écrire.`);
    await local.$disconnect();
    await cloud.$disconnect();
    process.exit(3);
  }

  // Lignes complètes (scalaires) côté local.
  const batches: Record<string, unknown>[] = await local.closureBatch.findMany({ where: { id: { in: missing.closureBatch } } });
  const documents: Record<string, unknown>[] = await local.document.findMany({ where: { id: { in: missing.document } } });
  const assets: Record<string, unknown>[] = await local.pedagogicalAsset.findMany({ where: { id: { in: missing.pedagogicalAsset } } });
  const jobs: Record<string, unknown>[] = await local.closureJob.findMany({ where: { id: { in: missing.closureJob } } });

  // Sanity FK : DocumentTemplate est vide côté cloud → tout templateId non-null casserait.
  const withTemplate = documents.filter((d) => d.templateId !== null);
  if (withTemplate.length > 0) {
    console.error(`\n⛔ ${withTemplate.length} Document avec templateId non-null (DocumentTemplate vide côté cloud) — STOP, à investiguer.`);
    await local.$disconnect();
    await cloud.$disconnect();
    process.exit(3);
  }

  // ── Phase B : backfill storage D'ABORD ────────────────────────────
  // Clés référencées par les lignes à reporter (bucket qualiof-docs).
  type KeyRef = { key: string; from: string };
  const keyRefs: KeyRef[] = [];
  for (const d of documents) keyRefs.push({ key: String(d.pdfUrl), from: `Document ${d.id}` });
  for (const a of assets) if (a.pdfUrl) keyRefs.push({ key: String(a.pdfUrl), from: `PedagogicalAsset ${a.id}` });

  console.log(`\n## Phase B — storage (bucket ${DOCS_BUCKET}) : ${keyRefs.length} clés référencées (borne ${STORAGE_BOUND})`);
  if (keyRefs.length > STORAGE_BOUND) {
    console.error('⛔ GARDE-FOU STORAGE : volume de clés au-delà de la borne — STOP sans écrire.');
    await local.$disconnect();
    await cloud.$disconnect();
    process.exit(3);
  }

  const invalidKeys: KeyRef[] = [];
  const alreadyPresent: KeyRef[] = [];
  const toCopy: KeyRef[] = [];
  const orphanKeys: KeyRef[] = []; // absents des DEUX stores

  for (const ref of keyRefs) {
    if (isInvalidSupabaseKey(ref.key)) {
      invalidKeys.push(ref);
    } else if (await supabaseHas(DOCS_BUCKET, ref.key)) {
      alreadyPresent.push(ref);
    } else if (await minioHas(DOCS_BUCKET, ref.key)) {
      toCopy.push(ref);
    } else {
      orphanKeys.push(ref);
    }
  }
  console.log(`   Déjà présentes Supabase : ${alreadyPresent.length}`);
  console.log(`   À copier MinIO→Supabase : ${toCopy.length}`);
  console.log(`   Invalides (non copiables) : ${invalidKeys.length}`);
  console.log(`   Orphelines (absentes des 2 stores) : ${orphanKeys.length}`);
  for (const k of invalidKeys) console.log(`     INVALIDE ${k.from} → ${k.key}`);
  for (const k of orphanKeys) console.log(`     ORPHELINE ${k.from} → ${k.key}`);

  let copied = 0;
  if (WRITE) {
    for (const ref of toCopy) {
      const buf = await minioGetBuffer(DOCS_BUCKET, ref.key);
      const { error } = await supabase.storage
        .from(DOCS_BUCKET)
        .upload(ref.key, buf, { upsert: true, contentType: contentTypeFor(ref.key) });
      if (error) throw new Error(`Upload Supabase ${ref.key} : ${error.message}`);
      copied += 1;
      if (copied % 100 === 0) console.log(`   … copiés ${copied}/${toCopy.length}`);
      await sleep(50);
    }
    console.log(`   → ${copied} objet(s) copié(s) MinIO→Supabase (upsert idempotent).`);
  }

  // Lignes exclues (clé invalide ou orpheline → 0 lien mort garanti côté cloud).
  const excludedKeys = new Set([...invalidKeys, ...orphanKeys].map((k) => k.key));
  const docsToInsert = documents.filter((d) => !excludedKeys.has(String(d.pdfUrl)));
  const assetsToInsert = assets.filter((a) => !a.pdfUrl || !excludedKeys.has(String(a.pdfUrl)));
  const excludedDocIds = new Set(documents.filter((d) => excludedKeys.has(String(d.pdfUrl))).map((d) => String(d.id)));
  const excludedAssetIds = new Set(
    assets.filter((a) => a.pdfUrl && excludedKeys.has(String(a.pdfUrl))).map((a) => String(a.id)),
  );

  // ── Phase C : report des lignes DB (ordre FK-safe) ────────────────
  console.log('\n## Phase C — lignes DB à reporter');
  console.log(`   ClosureBatch : ${batches.length}`);
  console.log(`   Document : ${docsToInsert.length} (${excludedDocIds.size} exclu(s) — clé invalide/orpheline)`);
  console.log(`   PedagogicalAsset : ${assetsToInsert.length} (${excludedAssetIds.size} exclu(s))`);
  console.log(`   ClosureJob : ${jobs.length}`);

  let inserted = 0;
  let replacedNewer = 0;
  let skippedCloudNewer = 0;
  if (WRITE) {
    const upsertAll = async (model: string, rows: Record<string, unknown>[], resolveAssetConflict: boolean) => {
      const delegate = (cloud as unknown as Record<string, any>)[model];
      let n = 0;
      for (const row of rows) {
        try {
          await delegate.upsert({ where: { id: row.id }, create: row, update: {} });
          n += 1;
        } catch (e) {
          if (resolveAssetConflict && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            // Conflit d'unique [sessionId, participantId, kind] : la ligne cloud
            // est une version du même asset. Politique « newer wins » :
            // local strictement plus récent → REMPLACEMENT in-place (id local
            // inclus, pour la cohérence des ClosureJob reportés) ; sinon SKIP.
            const existing = await delegate.findFirst({
              where: { sessionId: row.sessionId, participantId: row.participantId, kind: row.kind },
              select: { id: true, generatedAt: true },
            });
            if (existing && row.generatedAt instanceof Date && row.generatedAt > existing.generatedAt) {
              await delegate.update({ where: { id: existing.id }, data: row });
              replacedNewer += 1;
            } else {
              skippedCloudNewer += 1;
            }
            continue;
          }
          throw e;
        }
        if (n % 500 === 0) console.log(`   … ${model} ${n}/${rows.length}`);
      }
      console.log(`   → ${model} : ${n} ligne(s) reportée(s).`);
      inserted += n;
    };

    await upsertAll('closureBatch', batches, false);
    await upsertAll('document', docsToInsert, false);
    await upsertAll('pedagogicalAsset', assetsToInsert, true);
    console.log(`   → PedagogicalAsset : ${replacedNewer} remplacement(s) newer-wins, ${skippedCloudNewer} skip (cloud plus récent/égal).`);
    await upsertAll('closureJob', jobs, false);
  }

  console.log('\n=== RÉCAP REPORT DOCS ===');
  console.log(`Lignes manquantes : ${Object.values(counts).reduce((a, b) => a + b, 0)} — objets storage à copier : ${toCopy.length}`);
  if (WRITE) {
    console.log(
      `Objets copiés : ${copied} — lignes reportées : ${inserted} — remplacements newer-wins : ${replacedNewer} — skips (cloud plus récent) : ${skippedCloudNewer}`,
    );
    console.log(`Lignes exclues (clé invalide/orpheline) : ${excludedDocIds.size + excludedAssetIds.size}`);
  } else {
    console.log('(DRY — aucune écriture. Vérifier les comptes ci-dessus puis relancer avec WRITE=1.)');
  }

  await local.$disconnect();
  await cloud.$disconnect();
}

main().catch(async (err) => {
  console.error('Erreur report-docs-gap :', err);
  await local.$disconnect().catch(() => {});
  await cloud.$disconnect().catch(() => {});
  process.exit(1);
});
