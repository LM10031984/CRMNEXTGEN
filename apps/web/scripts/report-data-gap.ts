// report-data-gap.ts — Report sélectif LOCAL → CLOUD des données métier manquantes
// (Phase 22, plan 22-03, remédiation D-01 — décision Laurent 2026-07-07, option 1).
//
// Contexte : la base cloud Supabase est issue du snapshot du 2026-06-16 (le dump
// frais du 03/07 n'a jamais été restauré — voir 22-DATA-GAP-AUDIT.md). Ce script
// reporte vers le cloud les données MÉTIER créées localement entre le 16/06 et le
// 03/07 : SES-0101 + inscriptions/créneaux/formateurs, personnes/organisations/
// LegalLinks/SensitiveData, RevenueTarget, et les 1 349 SessionCalendarSync
// (mappings d'idempotence Google Calendar — critiques contre les doublons d'events).
//
// NON reportés (décision option 1) : Document / ClosureBatch / ClosureJob /
// AIGenerationJob / PedagogicalAsset (artefacts regénérables — versions du 16/06
// assumées côté cloud) et AuditLog (traçabilité locale archivée au plan 22-10).
//
// Usage :
//   LOCAL_DATABASE_URL=postgresql://qualiof:qualiof_dev@localhost:5432/qualiof \
//   CLOUD_DATABASE_URL=<DIRECT_URL du .env racine> \
//   pnpm tsx apps/web/scripts/report-data-gap.ts            # DRY-RUN (défaut)
//   WRITE=1 ... pnpm tsx apps/web/scripts/report-data-gap.ts # écriture réelle
//
// Garanties :
//   - DRY par défaut : liste ce qui serait reporté, n'écrit RIEN.
//   - INSERT-ONLY idempotent : upsert par id avec update vide — une ligne déjà
//     présente côté cloud n'est JAMAIS modifiée (cloud garde raison sur l'existant).
//   - AUCUNE suppression, AUCUNE écriture côté LOCAL (client local = SELECT only).
//   - SÉQUENTIEL (for...of await — leçon deadlocks génération masse).
//   - Ordre d'insertion respectant les FK (Location → Person → Organization →
//     LegalLink → SensitiveData → TrainingSession → slots/trainers/participants →
//     RevenueTarget → SessionCalendarSync).

import { PrismaClient, Prisma } from '@qualiof/db';

// ─── Gardes de démarrage ────────────────────────────────────────────
const LOCAL_URL = process.env.LOCAL_DATABASE_URL;
const CLOUD_URL = process.env.CLOUD_DATABASE_URL;
const WRITE = process.env.WRITE === '1';

if (!LOCAL_URL) {
  console.error('ERREUR : LOCAL_DATABASE_URL absent (le .env pointe le CLOUD — passer l’URL Docker locale explicitement).');
  process.exit(2);
}
if (LOCAL_URL.toLowerCase().includes('supabase')) {
  console.error('ERREUR (garde anti-inversion) : LOCAL_DATABASE_URL contient « supabase ».');
  process.exit(2);
}
if (!CLOUD_URL || !CLOUD_URL.toLowerCase().includes('supabase')) {
  console.error('ERREUR (garde direction) : CLOUD_DATABASE_URL absent ou ne pointe pas Supabase.');
  process.exit(2);
}

const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const cloud = new PrismaClient({ datasources: { db: { url: CLOUD_URL } } });

// ─── Périmètre (ordre FK-safe) ──────────────────────────────────────
interface ScopeEntry {
  model: string; // délégué Prisma (camelCase)
  table: string; // nom de table (affichage)
  jsonNullable: string[]; // champs Json NULLABLES (null → Prisma.DbNull à l'insert)
  label: (row: Record<string, unknown>) => string; // identifiant humain pour le rapport
}

const SCOPE: ScopeEntry[] = [
  { model: 'location', table: 'Location', jsonNullable: [], label: (r) => String(r.name) },
  { model: 'person', table: 'Person', jsonNullable: ['personalAddress'], label: (r) => `${r.firstName} ${r.lastName}` },
  { model: 'organization', table: 'Organization', jsonNullable: ['address'], label: (r) => String(r.legalName) },
  { model: 'legalLink', table: 'LegalLink', jsonNullable: [], label: (r) => `${r.personId} ↔ ${r.organizationId} (${r.role})` },
  { model: 'sensitiveData', table: 'SensitiveData', jsonNullable: [], label: (r) => `personId=${r.personId}` },
  { model: 'trainingSession', table: 'TrainingSession', jsonNullable: [], label: (r) => `${r.code} — ${r.name ?? ''}` },
  { model: 'sessionSlot', table: 'SessionSlot', jsonNullable: [], label: (r) => `session=${r.sessionId} ${String(r.date)} ${r.halfDay}` },
  { model: 'sessionTrainer', table: 'SessionTrainer', jsonNullable: [], label: (r) => `session=${r.sessionId} person=${r.personId}` },
  { model: 'sessionParticipant', table: 'SessionParticipant', jsonNullable: ['docStatus'], label: (r) => `session=${r.sessionId} person=${r.personId}` },
  { model: 'revenueTarget', table: 'RevenueTarget', jsonNullable: [], label: (r) => `year=${r.year} amountHT=${r.amountHT}` },
  { model: 'sessionCalendarSync', table: 'SessionCalendarSync', jsonNullable: [], label: (r) => `session=${r.sessionId} ${r.eventType}/${r.eventKey}` },
];

// null → Prisma.DbNull sur les champs Json nullables (le client Prisma refuse
// le null JS brut sur un input Json).
function sanitizeRow(row: Record<string, unknown>, jsonNullable: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of jsonNullable) {
    if (out[f] === null) out[f] = Prisma.DbNull;
  }
  return out;
}

async function main(): Promise<void> {
  console.log(`Mode : ${WRITE ? 'WRITE (écriture réelle CLOUD)' : 'DRY-RUN (aucune écriture)'}`);
  console.log('');

  let totalMissing = 0;
  let totalInserted = 0;

  for (const entry of SCOPE) {
    const localDelegate = (local as unknown as Record<string, any>)[entry.model];
    const cloudDelegate = (cloud as unknown as Record<string, any>)[entry.model];

    const localIds: { id: string }[] = await localDelegate.findMany({ select: { id: true } });
    const cloudIds: { id: string }[] = await cloudDelegate.findMany({ select: { id: true } });
    const cloudSet = new Set(cloudIds.map((r) => r.id));
    const missingIds = localIds.map((r) => r.id).filter((id) => !cloudSet.has(id));

    console.log(`## ${entry.table} — local ${localIds.length} / cloud ${cloudIds.length} / MANQUANTS cloud : ${missingIds.length}`);
    totalMissing += missingIds.length;

    if (missingIds.length === 0) {
      console.log('   (rien à reporter)');
      continue;
    }

    // Lignes complètes côté LOCAL (scalaires uniquement — pas d'include).
    const rows: Record<string, unknown>[] = await localDelegate.findMany({ where: { id: { in: missingIds } } });

    // Détail humain (échantillon complet sous 30 lignes, sinon 10 premiers).
    const sample = rows.length <= 30 ? rows : rows.slice(0, 10);
    for (const r of sample) console.log(`   - ${entry.label(r)}`);
    if (rows.length > sample.length) console.log(`   … +${rows.length - sample.length} autres`);

    if (WRITE) {
      let inserted = 0;
      // SÉQUENTIEL — for...of await, jamais de parallèle.
      for (const row of rows) {
        const data = sanitizeRow(row, entry.jsonNullable);
        // INSERT-ONLY idempotent : update vide = no-op si la ligne existe déjà.
        await cloudDelegate.upsert({ where: { id: row.id }, create: data, update: {} });
        inserted += 1;
        if (inserted % 200 === 0) console.log(`   … ${inserted}/${rows.length}`);
      }
      totalInserted += inserted;
      console.log(`   → ${inserted} ligne(s) reportée(s) (upsert insert-only).`);
    }
    console.log('');
  }

  console.log('=== RÉCAP REPORT ===');
  console.log(`Lignes manquantes cloud (périmètre) : ${totalMissing}`);
  if (WRITE) {
    console.log(`Lignes reportées : ${totalInserted}`);
  } else {
    console.log('(DRY — aucune écriture. Relancer avec WRITE=1 après validation du détail ci-dessus.)');
  }

  await local.$disconnect();
  await cloud.$disconnect();
}

main().catch(async (err) => {
  console.error('Erreur report-data-gap :', err);
  await local.$disconnect().catch(() => {});
  await cloud.$disconnect().catch(() => {});
  process.exit(1);
});
