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
import {
  DocStatusState,
  SignedScansInputSchema,
  MAX_SIGNED_SCANS_PER_BATCH,
} from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { logDocumentEvent } from '@/lib/document-audit';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { DOC_TYPE_TO_CLOSURE_KIND, isDocumentDocType } from '@/lib/doc-scope';
import { splitPdfPages } from '@/lib/pdf-split';
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

type SignedScanParticipant = {
  id: string;
  sessionId: string;
  session: { code: string | null };
  docStatus: unknown;
};

const SIGNED_SCAN_PARTICIPANT_SELECT = {
  id: true,
  sessionId: true,
  session: { select: { code: true } },
  docStatus: true,
} as const;

/** Garde-fous communs à tout PDF signé entrant (spec §5 A). */
function validateSignedPdf(file: File): string | null {
  if (file.type !== 'application/pdf') {
    return 'Format non supporté. Le fichier doit être un PDF.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'Fichier trop volumineux (max 10 Mo).';
  }
  return null;
}

/**
 * Cœur partagé du dépôt d'un PDF signé (scan manuel).
 *
 * Un seul chemin d'écriture pour les deux entrées UI — la modale par cellule
 * (`uploadSignedDoc`) et la zone de dépôt de la fiche session
 * (`uploadSignedScans`). Ne journalise PAS : chaque appelant pose sa propre
 * action AuditLog.
 *
 * Chemin bucket — spec §4.4 :
 *   `sessions/{tenantId}/{sessionCode}/signed/{docType}-{entityId}-{sha8}.pdf`
 * Une session = un préfixe = un dossier zippable pour le pack audit (lot D).
 * L'ancien préfixe `signed/{tenantId}/…` reste lisible : rien n'est déplacé.
 */
async function persistSignedScan(opts: {
  userId: string;
  tenantId: string;
  participant: SignedScanParticipant;
  docType: string;
  buf: Buffer;
}): Promise<{ key: string; before: unknown; entry: Record<string, unknown> }> {
  const { userId, tenantId, participant, docType, buf } = opts;

  const sha8 = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  const safeCode = (participant.session.code ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  const key = `sessions/${tenantId}/${safeCode}/signed/${docType}-${participant.id}-${sha8}.pdf`;
  await uploadFile(DOCS_BUCKET, key, buf, 'application/pdf');

  const currentMap = (participant.docStatus ?? {}) as Record<string, unknown>;
  const before = currentMap[docType] ?? null;
  const now = new Date();
  const entry = {
    state: 'MANUAL_OK' as const,
    uploadedSignedPdfKey: key,
    uploadedSignedAt: now.toISOString(),
    uploadedByUserId: userId,
    updatedAt: now.toISOString(),
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
    WHERE id = ${participant.id}::uuid
      AND "sessionId" IN (
        SELECT id FROM "TrainingSession" WHERE "tenantId" = ${tenantId}::uuid
      )
  `);

  // Règle métier n°2 — le PDF signé fait foi. Si un `Document` de ce type
  // existe déjà pour ce participant, il porte désormais le signé. On n'en crée
  // JAMAIS un nouveau : le mécanisme `docStatus` suffit pour les scans sans
  // Document (l'émargement papier d'une session sans pack généré, par ex.).
  if (isDocumentDocType(docType)) {
    await prisma.document.updateMany({
      where: { tenantId, participantId: participant.id, type: docType },
      data: {
        signedPdfUrl: key,
        signedAt: now,
        signatureKind: 'MANUAL_SCAN',
        status: 'signed',
      },
    });
  }

  return { key, before, entry };
}

/**
 * Upload du PDF signé scanné → bucket `DOCS_BUCKET` + patch atomique
 * `docStatus[docType] = { state: 'MANUAL_OK', uploadedSignedPdfKey, ... }`.
 *
 * Signature `(formData: FormData)` car Server Actions Next.js 14 acceptent
 * directement FormData pour les uploads multipart depuis client RHF.
 *
 * Entrée « une cellule à la fois » (modale de la matrice). Pour un dépôt de
 * plusieurs scans d'un coup, cf. `uploadSignedScans`.
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
  const invalid = validateSignedPdf(file);
  if (invalid) return { ok: false, error: invalid };
  if (!participantId || !docType) {
    return { ok: false, error: 'Données invalides' };
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    select: SIGNED_SCAN_PARTICIPANT_SELECT,
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const { before, entry } = await persistSignedScan({
    userId: user.id,
    tenantId: user.tenantId,
    participant,
    docType,
    buf: Buffer.from(await file.arrayBuffer()),
  });

  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: participantId,
    action: 'documents.upload_signed',
    // mask key en log (sécurité — la clé bucket contient tenantId/sessionCode)
    diff: { [docType]: { before, after: { ...entry, uploadedSignedPdfKey: '<masked>' } } },
  });

  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}

// ─── 2 bis. uploadSignedScans (lot A — zone de dépôt) ─────────────────────

export type SignedScanFailure = { filename: string; error: string };
export type UploadSignedScansResult =
  | { ok: true; saved: number; failures: SignedScanFailure[] }
  | { ok: false; error: string };

/**
 * Dépôt de plusieurs scans signés sur une session, un par participant
 * (spec 2026-09-04 §5 lot A).
 *
 * Rappel métier : **la fiche d'émargement est individuelle**. Le scan revient
 * participant par participant — jamais un « signé » posé sur toute la session
 * d'un coup. D'où l'affectation explicite fichier → participant.
 *
 * FormData :
 *   sessionId, docType, mode (`assign` | `split`),
 *   files[]           — N PDF en mode assign, 1 seul en mode split
 *   participantIds[]  — aligné sur files en mode assign,
 *                       ordre des pages en mode split
 *
 * Tolérant par fichier : un scan refusé (mauvais format, trop lourd, stagiaire
 * introuvable) n'annule pas les autres — il ressort dans `failures` pour que
 * l'admin le retraite. Seules les erreurs de cadrage (RBAC, affectation
 * incohérente, découpage impossible) rendent `ok: false`.
 */
export async function uploadSignedScans(formData: FormData): Promise<UploadSignedScansResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = SignedScansInputSchema.safeParse({
    sessionId: formData.get('sessionId'),
    docType: formData.get('docType'),
    mode: formData.get('mode') ?? undefined,
    participantIds: formData.getAll('participantIds').map(String),
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  const { sessionId, docType, mode, participantIds } = parsed.data;

  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: 'Aucun fichier déposé.' };
  if (files.length > MAX_SIGNED_SCANS_PER_BATCH) {
    return { ok: false, error: `Trop de fichiers (max ${MAX_SIGNED_SCANS_PER_BATCH}).` };
  }
  if (mode === 'assign' && files.length !== participantIds.length) {
    return { ok: false, error: 'Chaque fichier doit être affecté à un stagiaire.' };
  }
  if (mode === 'split' && files.length !== 1) {
    return { ok: false, error: 'Le mode « une fiche par page » attend un seul PDF.' };
  }

  const rows = await prisma.sessionParticipant.findMany({
    where: {
      id: { in: participantIds },
      sessionId,
      session: { tenantId: user.tenantId },
    },
    select: SIGNED_SCAN_PARTICIPANT_SELECT,
  });
  const participantById = new Map<string, SignedScanParticipant>(rows.map((r) => [r.id, r]));

  // Chaque item = un PDF à poser sur un participant.
  const items: Array<{ filename: string; participantId: string; buf?: Buffer; error?: string }> = [];

  if (mode === 'split') {
    const file = files[0]!;
    const invalid = validateSignedPdf(file);
    if (invalid) return { ok: false, error: invalid };

    let pages: Buffer[];
    try {
      pages = await splitPdfPages(Buffer.from(await file.arrayBuffer()));
    } catch {
      return { ok: false, error: 'PDF illisible : le découpage par page a échoué.' };
    }
    if (pages.length !== participantIds.length) {
      return {
        ok: false,
        error: `Le PDF contient ${pages.length} page(s) pour ${participantIds.length} stagiaire(s) sélectionné(s).`,
      };
    }
    participantIds.forEach((participantId, index) => {
      items.push({
        filename: `${file.name} — page ${index + 1}`,
        participantId,
        buf: pages[index]!,
      });
    });
  } else {
    for (const [index, file] of files.entries()) {
      const invalid = validateSignedPdf(file);
      items.push({
        filename: file.name,
        participantId: participantIds[index]!,
        ...(invalid ? { error: invalid } : { buf: Buffer.from(await file.arrayBuffer()) }),
      });
    }
  }

  const failures: SignedScanFailure[] = [];
  let saved = 0;

  for (const item of items) {
    if (item.error || !item.buf) {
      failures.push({ filename: item.filename, error: item.error ?? 'Fichier illisible' });
      continue;
    }
    const participant = participantById.get(item.participantId);
    if (!participant) {
      failures.push({ filename: item.filename, error: 'Inscription introuvable' });
      continue;
    }

    try {
      const { key } = await persistSignedScan({
        userId: user.id,
        tenantId: user.tenantId,
        participant,
        docType,
        buf: item.buf,
      });
      await logDocumentEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        targetEntityId: participant.id,
        action: 'document.signed_scan_uploaded',
        diff: { sessionId, docType, participantId: participant.id, key },
      });
      saved += 1;
    } catch (e) {
      failures.push({
        filename: item.filename,
        error: e instanceof Error ? e.message : 'Enregistrement impossible',
      });
    }
  }

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, saved, failures };
}

// ─── 3. regenerateParticipantDoc ─────────────────────────────────────────

const RegenerateParticipantDocInputSchema = z.object({
  participantId: z.string().uuid(),
  docKind: z.string().min(1).max(64),
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
): Promise<{ ok: boolean; error?: string; batchId?: string; documentId?: string }> {
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

  // AuditLog en amont (l'action est lancée même si la génération est async)
  await logDocumentEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetEntityId: parsed.data.participantId,
    action: 'documents.regenerate',
    diff: { docKind: parsed.data.docKind },
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
    diff: { docType: parsed.data.docType },
  });

  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}
