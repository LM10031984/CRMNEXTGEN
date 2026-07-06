/**
 * Teardown E2E — purge EXCLUSIVE des données de test préfixées `E2E-` / `e2e-`
 * (Phase 21, plan 21-06 — TEST-01, convention D-11 : données jetables identifiables).
 *
 * Worker/CLI-safe : imports UNIQUEMENT `@qualiof/db` + `@supabase/supabase-js`
 * (AUCUN import React/next/auth — leçon feedback_worker_no_react_imports).
 *
 * Cibles (lues dans schema.prisma) :
 *   - TrainingSession.name           startsWith E2E-
 *   - Person.firstName|lastName      startsWith E2E-
 *   - TrainingProduct.title          startsWith E2E-
 *   - Organization.legalName         startsWith E2E-
 *   - PreEnrollment.token            startsWith e2e-|E2E- (+ firstName E2E-)
 *
 * ORDRE de suppression (FK, cf. schema.prisma) :
 *   Document (SetNull sur session/participant → orphelins si non supprimés d'abord)
 *   → ClosureBatch (sessionId = String SANS FK → PAS de cascade ; ClosureJob
 *     cascade du batch) → PedagogicalAsset (cascade session, explicite pour les
 *     compteurs + collecte pdfUrl) → Attendance (cascade slot, MAIS personId
 *     Restrict sur Person → doit partir avant les Person) → SessionParticipant
 *     (cascade session, personId Restrict) → SessionSlot/SessionTrainer (cascade
 *     session, explicites pour compteurs) → TrainingSession → PreEnrollment
 *     → Person (SensitiveData/LegalLink cascade) → Organization (LegalLink/Contact
 *     cascade) → TrainingProduct (TrainingModule cascade).
 *
 * Storage : les clés (Document.pdfUrl / PedagogicalAsset.pdfUrl → bucket
 * qualiof-docs ; PreEnrollment.cniKey/ribKey/cfpKey → bucket preinscriptions)
 * sont collectées AVANT les delete, puis supprimées via supabase-js service role.
 *
 * Idempotent : re-run sur base propre = tous compteurs 0, exit 0.
 * RGPD : ne loggue JAMAIS de PII — uniquement des compteurs par table.
 */

import { prisma } from '@qualiof/db';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const DOCS_BUCKET = process.env.S3_BUCKET_DOCS ?? 'qualiof-docs';
const PREENROLLMENT_BUCKET = 'preinscriptions';

/** Filtre OR startsWith sur les 2 casse du préfixe (E2E- / e2e-). */
function prefixOr(field: string): Array<Record<string, { startsWith: string }>> {
  return [{ [field]: { startsWith: 'E2E-' } }, { [field]: { startsWith: 'e2e-' } }];
}

/**
 * GARDE-FOU structurel : interdit tout deleteMany avec un `where` vide/undefined
 * (un deleteMany global purgerait la base cloud réelle). Chaque delete du script
 * passe par cette assertion.
 */
function assertScopedWhere(where: unknown, label: string): void {
  if (!where || typeof where !== 'object' || Object.keys(where as object).length === 0) {
    throw new Error(
      `[teardown-e2e] REFUS : deleteMany ${label} sans clause where scopée (protection anti-purge globale)`,
    );
  }
}

/** Supprime des objets storage par lot (best-effort, loggue les compteurs). */
async function removeStorageObjects(bucket: string, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    console.warn(
      `[teardown-e2e] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY absents — ${keys.length} objet(s) ${bucket} NON supprimés`,
    );
    return 0;
  }
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.storage.from(bucket).remove(keys);
  if (error) {
    console.warn(`[teardown-e2e] storage remove ${bucket} : ${error.message}`);
    return 0;
  }
  return (data ?? []).length;
}

export async function teardownE2EData(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // ── 0. Résolution des ids E2E (aucune PII loggée) ────────────────
  const sessions = await prisma.trainingSession.findMany({
    where: { OR: prefixOr('name') },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const persons = await prisma.person.findMany({
    where: { OR: [...prefixOr('firstName'), ...prefixOr('lastName')] },
    select: { id: true },
  });
  const personIds = persons.map((p) => p.id);

  const preWhere = { OR: [...prefixOr('token'), ...prefixOr('firstName')] };
  const preEnrollments = await prisma.preEnrollment.findMany({
    where: preWhere,
    select: { id: true, cniKey: true, ribKey: true, cfpKey: true },
  });

  // Les participants E2E sont ceux des sessions E2E OU des personnes E2E.
  const participants = await prisma.sessionParticipant.findMany({
    where: { OR: [{ sessionId: { in: sessionIds } }, { personId: { in: personIds } }] },
    select: { id: true },
  });
  const participantIds = participants.map((p) => p.id);

  // ── 1. Collecte des clés storage AVANT les delete ────────────────
  const docWhere = {
    OR: [{ sessionId: { in: sessionIds } }, { participantId: { in: participantIds } }],
  };
  const docs = await prisma.document.findMany({ where: docWhere, select: { pdfUrl: true } });
  const assets = await prisma.pedagogicalAsset.findMany({
    where: { sessionId: { in: sessionIds } },
    select: { pdfUrl: true },
  });
  const docsBucketKeys = [
    ...docs.map((d) => d.pdfUrl),
    ...assets.map((a) => a.pdfUrl),
  ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');
  const preBucketKeys = preEnrollments
    .flatMap((p) => [p.cniKey, p.ribKey, p.cfpKey])
    .filter((k): k is string => typeof k === 'string' && k.trim() !== '');

  // ── 2. Suppressions Prisma (ordre FK, chaque where scopé + assert) ─
  assertScopedWhere(docWhere, 'Document');
  counts.document = (await prisma.document.deleteMany({ where: docWhere })).count;

  const batchWhere = { sessionId: { in: sessionIds } };
  assertScopedWhere(batchWhere, 'ClosureBatch');
  // ClosureJob cascade du batch (onDelete: Cascade) — compté avant pour le log.
  counts.closureJob = await prisma.closureJob.count({
    where: { batch: { sessionId: { in: sessionIds } } },
  });
  counts.closureBatch = (await prisma.closureBatch.deleteMany({ where: batchWhere })).count;

  const assetWhere = { sessionId: { in: sessionIds } };
  assertScopedWhere(assetWhere, 'PedagogicalAsset');
  counts.pedagogicalAsset = (
    await prisma.pedagogicalAsset.deleteMany({ where: assetWhere })
  ).count;

  const attendanceWhere = {
    OR: [{ slot: { sessionId: { in: sessionIds } } }, { personId: { in: personIds } }],
  };
  assertScopedWhere(attendanceWhere, 'Attendance');
  counts.attendance = (await prisma.attendance.deleteMany({ where: attendanceWhere })).count;

  const participantWhere = { id: { in: participantIds } };
  assertScopedWhere(participantWhere, 'SessionParticipant');
  counts.sessionParticipant = (
    await prisma.sessionParticipant.deleteMany({ where: participantWhere })
  ).count;

  const slotWhere = { sessionId: { in: sessionIds } };
  assertScopedWhere(slotWhere, 'SessionSlot');
  counts.sessionSlot = (await prisma.sessionSlot.deleteMany({ where: slotWhere })).count;
  assertScopedWhere(slotWhere, 'SessionTrainer');
  counts.sessionTrainer = (await prisma.sessionTrainer.deleteMany({ where: slotWhere })).count;

  const sessionWhere = { id: { in: sessionIds } };
  assertScopedWhere(sessionWhere, 'TrainingSession');
  counts.trainingSession = (
    await prisma.trainingSession.deleteMany({ where: sessionWhere })
  ).count;

  assertScopedWhere(preWhere, 'PreEnrollment');
  counts.preEnrollment = (await prisma.preEnrollment.deleteMany({ where: preWhere })).count;

  const personWhere = { id: { in: personIds } };
  assertScopedWhere(personWhere, 'Person');
  counts.person = (await prisma.person.deleteMany({ where: personWhere })).count;

  const orgWhere = { OR: prefixOr('legalName') };
  assertScopedWhere(orgWhere, 'Organization');
  counts.organization = (await prisma.organization.deleteMany({ where: orgWhere })).count;

  const productWhere = { OR: prefixOr('title') };
  assertScopedWhere(productWhere, 'TrainingProduct');
  counts.trainingProduct = (
    await prisma.trainingProduct.deleteMany({ where: productWhere })
  ).count;

  // ── 3. Storage (clés collectées avant les delete) ────────────────
  counts.storageDocsObjects = await removeStorageObjects(DOCS_BUCKET, docsBucketKeys);
  counts.storagePreObjects = await removeStorageObjects(PREENROLLMENT_BUCKET, preBucketKeys);

  // Log compteurs uniquement (0 PII).
  console.log('[teardown-e2e] compteurs :', JSON.stringify(counts));
  return counts;
}

async function main(): Promise<void> {
  try {
    await teardownE2EData();
    console.log('[teardown-e2e] OK — base propre (re-run = tous compteurs 0)');
  } catch (e) {
    console.error('[teardown-e2e] FAILED:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Garde d'entrée robuste aux espaces du chemin (« CRM Next gen » → %20 dans
// import.meta.url) — leçon Phase 18 : pathToFileURL(argv[1]).href = même encodage.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
