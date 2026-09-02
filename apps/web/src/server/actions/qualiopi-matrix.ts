'use server';

/**
 * Server actions Phase 9.1 Plan 02 — Matrice Qualiopi (CENTRAL-01 / CENTRAL-02).
 *
 * 5 actions discriminées `{ ok, ... }` :
 *  1. `markDocStatus`                  — patch `SessionParticipant.docStatus[docType]` atomique
 *                                        (jsonb_set raw — Pitfall 2 race condition mitigée)
 *  2. `uploadSignedDoc`                — upload PDF signé MinIO + patch docStatus MANUAL_OK
 *  3. `regenerateParticipantDoc`       — route synchrone (Convention/AGEFICE/Programme)
 *                                        ou async via generateClosurePack(force=true) — Pitfall 1
 *  4. `regenerateBatchParticipantDocs` — N items → 1 ClosureBatch groupé par docKind
 *  5. `deleteDocument`                 — delete Document + reset docStatus[docType] (transaction)
 *
 * Conventions (cohérentes Phase 7/8/9) :
 *  - RBAC `requireRole(['ADMIN', 'MANAGER'])` (D-11 CONTEXT.md) sur les 5 actions.
 *  - Scope tenant strict via `session.tenantId` join (Pitfall 3 cross-tenant).
 *  - AuditLog `logDocumentEvent` (entity='Document', actions `documents.*`).
 *  - `revalidatePath('/app/sessions/{sessionId}')` après mutation.
 *  - Persistance du docStatus en `jsonb_set` raw (Pitfall 2 race condition Json patch).
 */

import { z } from 'zod';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@qualiof/db';
import { prisma } from '@qualiof/db';
import { DocStatusState } from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { logDocumentEvent } from '@/lib/document-audit';
import {
  getParticipantDocEngagement,
  engagementWarning,
} from '@/lib/docs/document-engagement';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { DOC_TYPE_TO_CLOSURE_KIND } from '@/lib/doc-scope';
import { generateClosurePack } from './closure-pack';
import { generateConventionForParticipant } from './convention-generator';
import { generateAgeficeForParticipant } from './agefice-generator';
import { generateProgrammeForProduct } from './programme-generator';
import { generateConvocationForParticipant } from './convocation-generator';
import { generateAgeficeAttendanceForParticipant } from './agefice-attendance-generator';

export type ActionResult<T = void> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ─── 1. markDocStatus ────────────────────────────────────────────────────

const MarkDocStatusInputSchema = z.object({
  participantId: z.string().uuid(),
  docType: z.string().min(1).max(64),
  state: DocStatusState,
  markedOkWithoutUpload: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

/**
 * Patche `SessionParticipant.docStatus[docType]` atomiquement via `jsonb_set` raw.
 *
 * Pourquoi raw SQL au lieu de `prisma.sessionParticipant.update` ?
 *  → Pitfall 2 RESEARCH : 2 admins concurrents qui patchent 2 docTypes différents
 *    en lecture-modif-écriture risquent d'écraser l'un l'autre. `jsonb_set` est
 *    atomique côté Postgres.
 *
 * Le sub-SELECT `sessionId IN (SELECT id FROM TrainingSession WHERE tenantId)` garantit
 * que l'UPDATE ne touche AUCUNE ligne si le participant est cross-tenant
 * (Pitfall 3 protection). La vérification `findFirst` en amont est une optim
 * pour court-circuiter (retour `Inscription introuvable`) mais le filtre raw
 * est la dernière ligne de défense.
 */
export async function markDocStatus(
  input: z.infer<typeof MarkDocStatusInputSchema>,
): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = MarkDocStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides' };
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: {
      id: parsed.data.participantId,
      session: { tenantId: user.tenantId },
    },
    select: { id: true, sessionId: true, docStatus: true },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const currentMap = (participant.docStatus ?? {}) as Record<string, unknown>;
  const before = currentMap[parsed.data.docType] ?? null;
  const entry = {
    state: parsed.data.state,
    ...(parsed.data.markedOkWithoutUpload !== undefined
      ? { markedOkWithoutUpload: parsed.data.markedOkWithoutUpload }
      : {}),
    ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    updatedAt: new Date().toISOString(),
  };

  // Pitfall 2 mitigation : jsonb_set atomique + filtre tenant strict.
  const jsonPath = `{${parsed.data.docType}}`;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "SessionParticipant"
    SET "docStatus" = jsonb_set(
          COALESCE("docStatus", '{}'::jsonb),
          ${jsonPath}::text[],
          ${JSON.stringify(entry)}::jsonb,
          true
        ),
        "updatedAt" = NOW()
    WHERE id = ${parsed.data.participantId}::uuid
      AND "sessionId" IN (
        SELECT id FROM "TrainingSession" WHERE "tenantId" = ${user.tenantId}::uuid
      )
  `);

  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: parsed.data.participantId,
    action: 'documents.status_change',
    diff: { [parsed.data.docType]: { before, after: entry } },
  });

  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}

// ─── 2. uploadSignedDoc ──────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo

/**
 * Upload du PDF signé scanné → MinIO `DOCS_BUCKET` + patch atomique
 * `docStatus[docType] = { state: 'MANUAL_OK', uploadedSignedPdfKey, ... }`.
 *
 * Signature `(formData: FormData)` car Server Actions Next.js 14 acceptent
 * directement FormData pour les uploads multipart depuis client RHF.
 *
 * Key MinIO : `signed/{tenantId}/{sessionCode}/{participantId}-{docType}-{sha8}.pdf`
 *   - sha8 du contenu PDF garantit unicité même upload répété.
 *   - Le nom est non-PII (pas le nom du participant en clair) — Person reste opaque.
 */
export async function uploadSignedDoc(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const participantId = String(formData.get('participantId') ?? '');
  const docType = String(formData.get('docType') ?? '');
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return { ok: false, error: 'Fichier manquant' };
  }
  if (file.type !== 'application/pdf') {
    return { ok: false, error: 'Format non supporté. Le fichier doit être un PDF.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'Fichier trop volumineux (max 10 Mo).' };
  }
  if (!participantId || !docType) {
    return { ok: false, error: 'Données invalides' };
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: {
      id: participantId,
      session: { tenantId: user.tenantId },
    },
    select: {
      id: true,
      sessionId: true,
      session: { select: { code: true } },
      docStatus: true,
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const buf = Buffer.from(await file.arrayBuffer());
  const sha8 = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  const safeCode = (participant.session.code ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  const key = `signed/${user.tenantId}/${safeCode}/${participantId}-${docType}-${sha8}.pdf`;
  await uploadFile(DOCS_BUCKET, key, buf, 'application/pdf');

  const currentMap = (participant.docStatus ?? {}) as Record<string, unknown>;
  const before = currentMap[docType] ?? null;
  const entry = {
    state: 'MANUAL_OK' as const,
    uploadedSignedPdfKey: key,
    uploadedSignedAt: new Date().toISOString(),
    uploadedByUserId: user.id,
    updatedAt: new Date().toISOString(),
  };

  const jsonPath = `{${docType}}`;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "SessionParticipant"
    SET "docStatus" = jsonb_set(
          COALESCE("docStatus", '{}'::jsonb),
          ${jsonPath}::text[],
          ${JSON.stringify(entry)}::jsonb,
          true
        ),
        "updatedAt" = NOW()
    WHERE id = ${participantId}::uuid
      AND "sessionId" IN (
        SELECT id FROM "TrainingSession" WHERE "tenantId" = ${user.tenantId}::uuid
      )
  `);

  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: participantId,
    action: 'documents.upload_signed',
    // mask key en log (sécurité — la clé MinIO contient tenantId/sessionCode)
    diff: { [docType]: { before, after: { ...entry, uploadedSignedPdfKey: '<masked>' } } },
  });

  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}

// ─── 3. regenerateParticipantDoc ─────────────────────────────────────────

const RegenerateParticipantDocInputSchema = z.object({
  participantId: z.string().uuid(),
  docKind: z.string().min(1).max(64),
  /**
   * Lot 0 · 0.2 — l'appelant a lu l'avertissement d'engagement et confirme.
   * Sans ce drapeau, un document déjà parti (email, dossier financeur) ou
   * signé n'est PAS remplacé en silence.
   */
  confirmEngaged: z.boolean().optional(),
});

/**
 * Re-génère un document pour 1 participant.
 *
 * Routing (cf. DOC_TYPE_TO_CLOSURE_KIND map Plan 01) :
 *  - `closureKind === null` ET docKind synchrone (CONVENTION / AGEFICE / PROGRAMME) →
 *      appel direct du generator dédié (~1-5s, pas BullMQ).
 *  - `closureKind !== null` (Closure ATTESTATION / CERTIFICAT / QCM / ...) →
 *      `generateClosurePack(sessionId, { participantIds: [pid], kinds: [closureKind], force: true })`.
 *      Le flag `force` bypass le skip-existing en mode mono (Pitfall 1 RESEARCH).
 */
export async function regenerateParticipantDoc(
  input: z.infer<typeof RegenerateParticipantDocInputSchema>,
): Promise<{
  ok: boolean;
  error?: string;
  batchId?: string;
  documentId?: string;
  /** L'UI doit demander confirmation puis rappeler avec `confirmEngaged: true`. */
  requiresConfirmation?: boolean;
  warning?: string;
}> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = RegenerateParticipantDocInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides' };
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: {
      id: parsed.data.participantId,
      session: { tenantId: user.tenantId },
    },
    select: { id: true, sessionId: true },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  // Lot 0 · 0.2 — un document déjà sorti de la maison ne se remplace pas en
  // silence. Le destinataire garde ce qu'il a reçu ; régénérer sans le dire
  // fabrique deux versions d'un même acte, dont une seule est chez le
  // financeur. On n'INTERDIT pas — on oblige à le regarder en face.
  const engagementCheck = parsed.data.confirmEngaged
    ? null
    : await getParticipantDocEngagement(
        user.tenantId,
        parsed.data.participantId,
        parsed.data.docKind,
      );
  if (engagementCheck) {
    const warning = engagementWarning(engagementCheck.engagement, 'regenerate');
    if (warning) {
      return { ok: false, requiresConfirmation: true, warning };
    }
  }

  // AuditLog en amont (l'action est lancée même si la génération est async)
  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: parsed.data.participantId,
    action: 'documents.regenerate',
    diff: {
      docKind: parsed.data.docKind,
      // Trace explicite : le document était engagé et un humain a confirmé.
      ...(parsed.data.confirmEngaged ? { confirmedOverEngagement: true } : {}),
    },
  });

  // Routing : synchrone (Convention / AGEFICE / Programme) vs BullMQ (ClosureDocKind).
  const closureKind = DOC_TYPE_TO_CLOSURE_KIND[parsed.data.docKind];

  if (closureKind === null || closureKind === undefined) {
    // Generators synchrones — switch par docKind.
    if (parsed.data.docKind === 'CONVENTION') {
      const res = await generateConventionForParticipant(parsed.data.participantId);
      revalidatePath(`/app/sessions/${participant.sessionId}`);
      return res;
    }
    if (parsed.data.docKind === 'CONVOCATION') {
      // BUG-14 — convocation synchrone, idempotente sha256.
      const res = await generateConvocationForParticipant(parsed.data.participantId);
      revalidatePath(`/app/sessions/${participant.sessionId}`);
      return res;
    }
    if (parsed.data.docKind === 'AGEFICE') {
      const res = await generateAgeficeForParticipant(parsed.data.participantId);
      revalidatePath(`/app/sessions/${participant.sessionId}`);
      return { ok: res.ok, ...(res.documentId ? { documentId: res.documentId } : {}), ...(res.error ? { error: res.error } : {}) };
    }
    if (parsed.data.docKind === 'ASSIDUITE') {
      // BUG-12 — Attestation d'assiduité AGEFICE (modèle 2023, 27 fields PDF)
      const res = await generateAgeficeAttendanceForParticipant(parsed.data.participantId);
      revalidatePath(`/app/sessions/${participant.sessionId}`);
      return { ok: res.ok, ...(res.documentId ? { documentId: res.documentId } : {}), ...(res.error ? { error: res.error } : {}) };
    }
    if (parsed.data.docKind === 'PROGRAMME') {
      // Doc session-wide → délègue au generator produit (1 PDF partagé).
      const sess = await prisma.trainingSession.findUnique({
        where: { id: participant.sessionId },
        select: { productId: true },
      });
      if (!sess?.productId) {
        return { ok: false, error: 'Produit introuvable pour la session' };
      }
      const res = await generateProgrammeForProduct(sess.productId, { force: true });
      revalidatePath(`/app/sessions/${participant.sessionId}`);
      return { ok: res.ok, ...(res.documentId ? { documentId: res.documentId } : {}), ...(res.error ? { error: res.error } : {}) };
    }
    return { ok: false, error: `Génération non supportée pour ${parsed.data.docKind}` };
  }

  // ClosureDocKind path → BullMQ avec force=true (Pitfall 1).
  const res = await generateClosurePack(participant.sessionId, {
    participantIds: [parsed.data.participantId],
    kinds: [closureKind as never],
    force: true,
  });
  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return res;
}

// ─── 4. regenerateBatchParticipantDocs ───────────────────────────────────

const BatchItemSchema = z.object({
  participantId: z.string().uuid(),
  docKind: z.string().min(1).max(64),
});

const RegenerateBatchInputSchema = z.object({
  sessionId: z.string().uuid(),
  items: z.array(BatchItemSchema).min(1).max(100),
});

/**
 * Re-génération multi-participants × multi-docKind.
 *
 * Stratégie : filtre les items à `ClosureDocKind` (BullMQ uniquement — les
 * synchrones (Convention/AGEFICE) doivent passer par le bouton ligne pour
 * éviter le batch de N×~3s d'I/O synchrone). Puis groupe par `closureKind`
 * et lance 1 `generateClosurePack(force=true)` par kind unique.
 */
export async function regenerateBatchParticipantDocs(
  input: z.infer<typeof RegenerateBatchInputSchema>,
): Promise<{ ok: boolean; error?: string; batchId?: string; total?: number }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = RegenerateBatchInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides' };
  }

  const closureItems = parsed.data.items.filter(
    (it) => DOC_TYPE_TO_CLOSURE_KIND[it.docKind] != null,
  );
  if (closureItems.length === 0) {
    return {
      ok: false,
      error: 'Aucun document compatible avec le batch (utilisez le bouton ligne pour Convention/AGEFICE).',
    };
  }

  // Groupe par closureKind → 1 generateClosurePack par kind unique.
  const byKind = new Map<string, string[]>();
  for (const it of closureItems) {
    const ck = DOC_TYPE_TO_CLOSURE_KIND[it.docKind]!;
    const arr = byKind.get(ck) ?? [];
    arr.push(it.participantId);
    byKind.set(ck, arr);
  }

  let firstBatchId: string | undefined;
  for (const [kind, pids] of byKind) {
    const res = await generateClosurePack(parsed.data.sessionId, {
      participantIds: pids,
      kinds: [kind as never],
      force: true,
    });
    if (!firstBatchId && res.batchId) firstBatchId = res.batchId;
  }

  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: parsed.data.sessionId,
    action: 'documents.regenerate',
    diff: { batch: parsed.data.items },
  });

  revalidatePath(`/app/sessions/${parsed.data.sessionId}`);
  return { ok: true, ...(firstBatchId ? { batchId: firstBatchId } : {}), total: closureItems.length };
}

// ─── 5. deleteDocument ───────────────────────────────────────────────────

const DeleteDocumentInputSchema = z.object({
  participantId: z.string().uuid(),
  docType: z.string().min(1).max(64),
  /** Lot 0 · 0.2 — voir `regenerateParticipantDoc`. */
  confirmEngaged: z.boolean().optional(),
});

/**
 * Supprime atomiquement :
 *  - Le `Document` participant-scoped (entityType='participant') si existe.
 *  - La clé `docStatus[docType]` (passe l'état à MISSING par défaut au prochain
 *    `deriveCellState`, puisque l'absence de clé == MISSING).
 *
 * Transaction `prisma.$transaction` pour atomicité : si la suppression Document
 * échoue, le reset docStatus n'a pas lieu, et vice-versa.
 */
export async function deleteDocument(
  input: z.infer<typeof DeleteDocumentInputSchema>,
): Promise<{
  ok: boolean;
  error?: string;
  requiresConfirmation?: boolean;
  warning?: string;
}> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = DeleteDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides' };
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: {
      id: parsed.data.participantId,
      session: { tenantId: user.tenantId },
    },
    select: { id: true, sessionId: true, personId: true, docStatus: true },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  // Lot 0 · 0.2 — supprimer un document engagé est pire que le régénérer : il
  // ne reste plus rien en face de ce que le destinataire détient.
  const engagementCheck = parsed.data.confirmEngaged
    ? null
    : await getParticipantDocEngagement(
        user.tenantId,
        parsed.data.participantId,
        parsed.data.docType,
      );
  if (engagementCheck) {
    const warning = engagementWarning(engagementCheck.engagement, 'delete');
    if (warning) {
      return { ok: false, requiresConfirmation: true, warning };
    }
  }

  await prisma.$transaction(async (tx) => {
    // Supprime le Document participant-scoped si présent.
    await tx.document.deleteMany({
      where: {
        tenantId: user.tenantId,
        entityType: 'participant',
        entityId: parsed.data.participantId,
        type: parsed.data.docType as never,
      },
    });

    // Reset docStatus[docType] : opérateur "- text" supprime la clé du JSONB.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "SessionParticipant"
      SET "docStatus" = "docStatus" - ${parsed.data.docType}::text,
          "updatedAt" = NOW()
      WHERE id = ${parsed.data.participantId}::uuid
        AND "sessionId" IN (
          SELECT id FROM "TrainingSession" WHERE "tenantId" = ${user.tenantId}::uuid
        )
    `);
  });

  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: parsed.data.participantId,
    action: 'documents.delete',
    diff: {
      docType: parsed.data.docType,
      ...(parsed.data.confirmEngaged ? { confirmedOverEngagement: true } : {}),
    },
  });

  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}
