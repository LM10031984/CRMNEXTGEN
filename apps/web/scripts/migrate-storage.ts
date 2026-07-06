/**
 * Migration idempotente des objets storage MinIO → Supabase (Phase 18 — 18-02).
 *
 * Copie chaque objet référencé EN BASE de MinIO (source) vers Supabase (cible),
 * puis vérifie 0 lien mort et écrit un rapport daté audit-réutilisable. C'est le
 * filet de sécurité AVANT la bascule `STORAGE_PROVIDER=supabase` (STOR-02).
 *
 * PÉRIMÈTRE COMPLET (vérifié dans schema.prisma) — 8 champs de clé storage sur
 * 8 tables, 2 buckets. Migrer moins = liens morts sur pièces apprenants et
 * factures après bascule (RESEARCH.md « CRITIQUE ») :
 *   Bucket qualiof-docs (DOCS_BUCKET) :
 *     Person.ribKey / SensitiveData.idDocumentUrl / Invoice.pdfUrl /
 *     Quote.pdfUrl / Document.pdfUrl / AgeficeProfile.cfpAttestationKey /
 *     PedagogicalAsset.pdfUrl
 *   Bucket preinscriptions (PREENROLLMENT_BUCKET) :
 *     PreEnrollment.cniKey / ribKey / cfpKey
 *
 * ⚠ Le script LIT MinIO (source) ET ÉCRIT Supabase (cible) EN MÊME TEMPS : il
 * NE peut PAS s'appuyer sur le switch PROVIDER global de storage.ts (qui sera
 * `supabase` au moment de la migration). Il instancie donc ses PROPRES clients
 * (S3 dédié pour MinIO source, supabase-js dédié pour la cible).
 *
 * RÈGLES NON NÉGOCIABLES (leçon mémoire « génération masse ») :
 *   - SÉQUENTIEL : for...of await, JAMAIS d'exécution parallèle groupée (deadlocks/pertes).
 *   - try/catch PAR clé : un objet absent (orphelin) n'arrête pas le run ;
 *     les orphelins sont LISTÉS sans action automatique (D-04).
 *   - IDEMPOTENT : upsert:true → re-run sans doublon.
 *
 * SÉCURITÉ :
 *   - DRY par défaut : compte et n'écrit RIEN (aucun uploadToSupabase appelé).
 *     WRITE=1 pour persister réellement.
 *   - BUCKET=docs|preinscriptions : filtre optionnel sur un seul bucket.
 *
 * ⚠ NE PAS exécuter ce script sans validation : l'exécution réelle DRY puis
 * WRITE est une étape humaine GATÉE (D-01/D-02, « destructif = étape séparée »,
 * exige MinIO en marche + projet Supabase réel). Ce plan LIVRE le code + tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '@qualiof/db';
import { PREENROLLMENT_BUCKET, DOCS_BUCKET } from '@/lib/storage';

// ─── Flags / constantes ────────────────────────────────────────────
const WRITE = process.env.WRITE === '1';
const ONLY_BUCKET = process.env.BUCKET; // 'docs' | 'preinscriptions' (filtre optionnel)
const DELAY_MS = 50; // lissage anti-throttle entre objets (mode WRITE)

// ─── Types ─────────────────────────────────────────────────────────
export interface KeyItem {
  bucket: string;
  table: string;
  field: string;
  id: string;
  key: string;
}

export interface MigrationReport {
  migrated: (KeyItem & { size: number })[];
  orphans: (KeyItem & { error: string })[];
  invalidKeys: KeyItem[];
  deadLinks: KeyItem[];
  byBucket: Record<string, { total: number; simulated: number; migrated: number }>;
}

// ─── Détection clé invalide Supabase (Pitfall 1) ───────────────────
/**
 * Supabase Storage refuse les clés avec leading /, double //, caractère %
 * (encodage), ou tout caractère non-ASCII (accents). On les liste SANS tenter
 * l'upload (sinon échec silencieux → lien mort après bascule).
 */
export function isInvalidSupabaseKey(key: string): boolean {
  return (
    key.startsWith('/') ||
    key.includes('//') ||
    key.includes('%') ||
    /[^\x00-\x7F]/.test(key)
  );
}

// ─── Collecte de TOUTES les clés storage référencées en base ───────
/**
 * Parcourt les 8 champs de clé storage réels du schéma et retourne une entrée
 * `{ bucket, table, field, id, key }` par valeur non-null/non-vide.
 */
export async function collectAllKeys(db: typeof prisma): Promise<KeyItem[]> {
  const items: KeyItem[] = [];

  const push = (bucket: string, table: string, field: string, rows: any[]) => {
    for (const row of rows) {
      const key = row[field];
      if (typeof key === 'string' && key.trim() !== '') {
        items.push({ bucket, table, field, id: row.id, key });
      }
    }
  };

  // Bucket qualiof-docs (DOCS_BUCKET) — 7 champs sur 7 tables.
  push(DOCS_BUCKET, 'Person', 'ribKey', await db.person.findMany({ select: { id: true, ribKey: true } }));
  push(
    DOCS_BUCKET,
    'SensitiveData',
    'idDocumentUrl',
    await db.sensitiveData.findMany({ select: { id: true, idDocumentUrl: true } }),
  );
  push(DOCS_BUCKET, 'Invoice', 'pdfUrl', await db.invoice.findMany({ select: { id: true, pdfUrl: true } }));
  push(DOCS_BUCKET, 'Quote', 'pdfUrl', await db.quote.findMany({ select: { id: true, pdfUrl: true } }));
  push(DOCS_BUCKET, 'Document', 'pdfUrl', await db.document.findMany({ select: { id: true, pdfUrl: true } }));
  push(
    DOCS_BUCKET,
    'AgeficeProfile',
    'cfpAttestationKey',
    await db.ageficeProfile.findMany({ select: { id: true, cfpAttestationKey: true } }),
  );
  push(
    DOCS_BUCKET,
    'PedagogicalAsset',
    'pdfUrl',
    await db.pedagogicalAsset.findMany({ select: { id: true, pdfUrl: true } }),
  );

  // Bucket preinscriptions (PREENROLLMENT_BUCKET) — 3 champs sur PreEnrollment.
  const preEnrollments = await db.preEnrollment.findMany({
    select: { id: true, cniKey: true, ribKey: true, cfpKey: true },
  });
  push(PREENROLLMENT_BUCKET, 'PreEnrollment', 'cniKey', preEnrollments);
  push(PREENROLLMENT_BUCKET, 'PreEnrollment', 'ribKey', preEnrollments);
  push(PREENROLLMENT_BUCKET, 'PreEnrollment', 'cfpKey', preEnrollments);

  return items;
}

// ─── Runner de migration (dépendances INJECTÉES → testable) ────────
interface RunMigrationDeps {
  keys: KeyItem[];
  write: boolean;
  downloadFromMinio: (bucket: string, key: string) => Promise<Buffer>;
  uploadToSupabase: (bucket: string, key: string, buf: Buffer) => Promise<void>;
  verifyExists: (bucket: string, key: string) => Promise<boolean>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Copie séquentielle MinIO→Supabase.
 *
 * En DRY (write=false) : n'appelle JAMAIS uploadToSupabase et `migrated` reste
 * VIDE — on compte seulement dans byBucket[bucket].simulated. En WRITE : copie
 * + vérif 0 lien mort (objectExists sur la cible) ; les orphelins (objet absent
 * de MinIO) et les clés invalides sont listés SANS action automatique.
 */
export async function runMigration({
  keys,
  write,
  downloadFromMinio,
  uploadToSupabase,
  verifyExists,
}: RunMigrationDeps): Promise<MigrationReport> {
  const report: MigrationReport = {
    migrated: [],
    orphans: [],
    invalidKeys: [],
    deadLinks: [],
    byBucket: {},
  };

  const bucketBucket = (bucket: string) => {
    if (!report.byBucket[bucket]) {
      report.byBucket[bucket] = { total: 0, simulated: 0, migrated: 0 };
    }
    return report.byBucket[bucket];
  };

  // SÉQUENTIEL — for...of await. JAMAIS d'exécution parallèle groupée (deadlocks/pertes).
  for (const item of keys) {
    const bb = bucketBucket(item.bucket);
    bb.total += 1;

    if (isInvalidSupabaseKey(item.key)) {
      report.invalidKeys.push(item);
      continue;
    }

    try {
      const buf = await downloadFromMinio(item.bucket, item.key);
      if (write) {
        await uploadToSupabase(item.bucket, item.key, buf);
        report.migrated.push({ ...item, size: buf.length });
        bb.migrated += 1;
        await sleep(DELAY_MS);
      } else {
        // DRY : on simule, on n'écrit RIEN et migrated reste vide.
        bb.simulated += 1;
      }
    } catch (e) {
      // Objet absent de MinIO (clé en base sans objet) = orphelin, listé sans
      // action auto (D-04). Le run continue (try/catch par clé).
      report.orphans.push({ ...item, error: String(e) });
    }
  }

  // Vérif 0 lien mort (WRITE seul, sur ce qui a été migré).
  if (write) {
    for (const m of report.migrated) {
      if (!(await verifyExists(m.bucket, m.key))) {
        report.deadLinks.push(m);
      }
    }
  }

  return report;
}

// ─── Clients dédiés (source MinIO / cible Supabase) ────────────────
// Mêmes défauts que storage.ts (source MinIO indépendante du switch global).
function makeMinioClient(): S3Client {
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

function makeSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceRole) {
    throw new Error(
      'Migration Supabase : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (cible).',
    );
  }
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Stream MinIO → Buffer (répliqué de storage.ts downloadFile).
async function minioGetBuffer(s3: S3Client, bucket: string, key: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Fichier vide ou introuvable (MinIO)');
  const chunks: Uint8Array[] = [];
  for await (const chunk of r.Body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// contentType déduit de l'extension.
function contentTypeFor(key: string): string {
  const ext = path.extname(key).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

// ─── Rapport Markdown daté ─────────────────────────────────────────
function writeReport(report: MigrationReport, write: boolean): string {
  const date = new Date().toISOString().slice(0, 10);
  // Ancré sur l'emplacement du script (apps/web/scripts → racine = 3 niveaux au-dessus),
  // pas sur process.cwd() : pnpm --filter exécute avec cwd=apps/web, et .planning/audit
  // vit à la racine du monorepo.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const dir = path.join(repoRoot, '.planning/audit');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `STORAGE-MIGRATION-REPORT-${date}.md`);

  const lines: string[] = [];
  lines.push(`# Rapport migration storage MinIO→Supabase — ${date}`);
  lines.push('');
  lines.push(`- **Mode** : ${write ? 'WRITE (écriture réelle Supabase)' : 'DRY (simulation, aucune écriture)'}`);
  lines.push('');
  lines.push('## Total par bucket');
  lines.push('');
  lines.push('| Bucket | Total clés | Simulés (DRY) | Migrés (WRITE) |');
  lines.push('| --- | --- | --- | --- |');
  for (const [bucket, s] of Object.entries(report.byBucket)) {
    lines.push(`| ${bucket} | ${s.total} | ${s.simulated} | ${s.migrated} |`);
  }
  lines.push('');
  lines.push(`## Migrés : ${report.migrated.length}`);
  lines.push('');
  lines.push('## Orphelins (clé en base, objet absent de MinIO — AUCUNE action auto, D-04)');
  lines.push('');
  if (report.orphans.length === 0) lines.push('_Aucun._');
  for (const o of report.orphans) lines.push(`- ${o.table}.${o.field} [${o.id}] → \`${o.bucket}/${o.key}\` : ${o.error}`);
  lines.push('');
  lines.push('## Clés invalides Supabase (leading /, //, %, non-ASCII — NON uploadées)');
  lines.push('');
  if (report.invalidKeys.length === 0) lines.push('_Aucune._');
  for (const k of report.invalidKeys) lines.push(`- ${k.table}.${k.field} [${k.id}] → \`${k.bucket}/${k.key}\``);
  lines.push('');
  lines.push('## Liens morts après migration (DOIT être VIDE pour autoriser la bascule)');
  lines.push('');
  if (report.deadLinks.length === 0) lines.push('_Aucun (0 lien mort)._');
  for (const d of report.deadLinks) lines.push(`- ⚠ ${d.table}.${d.field} [${d.id}] → \`${d.bucket}/${d.key}\``);
  lines.push('');

  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

// ─── CLI ───────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode : ${WRITE ? 'WRITE (écriture réelle Supabase)' : 'DRY (simulation)'}`);
  if (ONLY_BUCKET) console.log(`Filtre bucket : ${ONLY_BUCKET}`);

  const s3 = makeMinioClient();
  const supabase = WRITE ? makeSupabaseClient() : null;

  let keys = await collectAllKeys(prisma);
  if (ONLY_BUCKET) {
    const target = ONLY_BUCKET === 'preinscriptions' ? PREENROLLMENT_BUCKET : DOCS_BUCKET;
    keys = keys.filter((k) => k.bucket === target);
  }
  console.log(`Clés collectées : ${keys.length}`);

  try {
    const report = await runMigration({
      keys,
      write: WRITE,
      downloadFromMinio: (bucket, key) => minioGetBuffer(s3, bucket, key),
      uploadToSupabase: async (bucket, key, buf) => {
        const { error } = await supabase!
          .storage.from(bucket)
          .upload(key, buf, { upsert: true, contentType: contentTypeFor(key) });
        if (error) throw new Error(`Supabase upload failed : ${error.message}`);
      },
      verifyExists: async (bucket, key) => {
        const idx = key.lastIndexOf('/');
        const prefix = idx >= 0 ? key.slice(0, idx) : '';
        const name = idx >= 0 ? key.slice(idx + 1) : key;
        const { data, error } = await supabase!.storage.from(bucket).list(prefix, { search: name });
        if (error) throw new Error(`Supabase list failed : ${error.message}`);
        return (data ?? []).some((o) => o.name === name);
      },
    });

    const file = writeReport(report, WRITE);
    console.log('\n=== RÉCAP MIGRATION ===');
    for (const [bucket, s] of Object.entries(report.byBucket)) {
      console.log(`  ${bucket} : total ${s.total} | simulés ${s.simulated} | migrés ${s.migrated}`);
    }
    console.log(`  Orphelins       : ${report.orphans.length}`);
    console.log(`  Clés invalides  : ${report.invalidKeys.length}`);
    console.log(`  Liens morts     : ${report.deadLinks.length} ${report.deadLinks.length === 0 ? '(0 — bascule autorisée)' : '⚠ (bascule INTERDITE)'}`);
    console.log(`\nRapport écrit : ${file}`);
    if (!WRITE) console.log('\n(DRY — aucune écriture Supabase. Relancer avec WRITE=1 après validation.)');
  } finally {
    await prisma.$disconnect();
  }
}

// require.main === module en ESM tsx : exécute main() seulement en CLI direct.
// pathToFileURL (et pas `file://${argv[1]}`) : le chemin projet contient des espaces
// → import.meta.url est URL-encodé (%20), la concaténation brute ne matche jamais.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error('Erreur fatale migration :', err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
