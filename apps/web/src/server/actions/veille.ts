'use server';

/**
 * Server actions Veille Qualiopi (Phase 13 Plan 13-02 — VEILLE-02).
 *
 * 6 actions auth-protected (`requireRole(['ADMIN', 'MANAGER'])` strict — D-03) :
 *  1. createWatch              — création manuelle UI ('+ Ajouter une source')
 *  2. updateWatch              — édition champs hors exploitation (kebab menu)
 *  3. updateExploitation       — inline edit cellule exploitation (déclenche dateLastReviewed=now())
 *  4. approveWatch             — passe une DRAFT/suggestedBy=AUTO → ACTIVE (inbox)
 *  5. rejectWatch              — passe une DRAFT/suggestedBy=AUTO → ARCHIVED + reason
 *  6. archiveWatch             — archivage manuel d'une entrée
 *
 * Conventions partagées (cohérentes Phase 9/9.1/11) :
 *  - Toutes les queries scopées par `user.tenantId` (defense-in-depth multi-tenant).
 *  - AuditLog via `logRegulatoryWatchEvent` (helper Plan 01) — 5 verbes utilisés ici :
 *      regulatoryWatch.created / .updated / .exploitation_updated / .approved
 *      / .rejected / .archived. Les 2 autres verbes (auto_inserted/exported) sont
 *      pour Plans 05/04.
 *  - revalidatePath('/app/veille') sur chaque succès.
 *  - Retour discriminé `{ok:true, ...} | {ok:false, error}` (pattern Server Action UI).
 *
 * Décisions clés :
 *  - D-03 : LECTEUR/COMMERCIAL/COMPTABLE/FORMATEUR REJETÉS (requireRole ADMIN+MANAGER strict).
 *    Chaque action appelle explicitement `requireRole(['ADMIN', 'MANAGER'])` pour faciliter
 *    l'audit grep + s'assurer qu'aucune action n'oublie le guard.
 *  - D-08 : `approveWatch` ne peut transformer QUE des DRAFT/suggestedBy=AUTO (pas d'INSERT
 *    direct en ACTIVE pour les suggestions — toutes passent par inbox).
 *  - Defense-in-depth : `where: { id, tenantId: user.tenantId }` sur tous les findFirst/update.
 *  - RESEARCH §8.4 : updateExploitation set `dateLastReviewed = new Date()` à CHAQUE appel
 *    (le KPI "X jours depuis" doit bouger même si exploitation = même chaîne).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import {
  createWatchSchema,
  updateWatchSchema,
  updateExploitationSchema,
  rejectWatchSchema,
  type CreateWatchInput,
  type UpdateWatchInput,
  type UpdateExploitationInput,
  type RejectWatchInput,
} from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { logRegulatoryWatchEvent } from '@/lib/regulatoryWatch-audit';

const ROUTE = '/app/veille';

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

// ─── 1. createWatch ────────────────────────────────────────────────────────
/**
 * Création manuelle d'une entrée veille. Status par défaut = 'ACTIVE',
 * suggestedBy = 'USER' (cf. enum RegulatoryWatchSource).
 *
 * AuditLog `regulatoryWatch.created` avec diff source='manual-ui', theme, title.
 */
export async function createWatch(
  input: CreateWatchInput,
): Promise<ActionResult<{ watchId: string }>> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = createWatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.flatten().formErrors.join(', ') ||
        Object.values(parsed.error.flatten().fieldErrors).flat().join(', ') ||
        'Validation failed',
    };
  }

  try {
    const created = await prisma.regulatoryWatch.create({
      data: {
        tenantId: user.tenantId,
        ...parsed.data,
        status: 'ACTIVE',
        suggestedBy: 'USER',
      },
      select: { id: true },
    });

    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: created.id,
      action: 'regulatoryWatch.created',
      diff: {
        source: 'manual-ui',
        theme: parsed.data.theme,
        title: parsed.data.title,
      },
    });

    revalidatePath(ROUTE);
    return { ok: true, watchId: created.id };
  } catch (e) {
    console.error('[createWatch] error', e);
    return { ok: false, error: (e as Error).message ?? 'Erreur création veille' };
  }
}

// ─── 2. updateWatch ────────────────────────────────────────────────────────
/**
 * Édition d'une entrée existante hors exploitation (kebab menu UI).
 * Si `exploitation` est passé dans le patch, il est IGNORÉ ici — utiliser
 * `updateExploitation` qui set aussi `dateLastReviewed`.
 *
 * AuditLog `regulatoryWatch.updated` avec diff before/after par champ modifié.
 */
export async function updateWatch(input: UpdateWatchInput): Promise<ActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = updateWatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation failed' };

  const { id, exploitation: _ignored, ...rest } = parsed.data;
  // Filtre les undefined explicitement pour ne pas écraser un champ existant avec undefined.
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) data[k] = v;
  }

  try {
    const existing = await prisma.regulatoryWatch.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return { ok: false, error: 'Entrée veille introuvable' };

    // Diff before/after sur les champs effectivement modifiés.
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const [k, v] of Object.entries(data)) {
      const existingValue = (existing as Record<string, unknown>)[k];
      if (existingValue !== v) {
        diff[k] = { before: existingValue, after: v };
      }
    }

    await prisma.regulatoryWatch.update({
      where: { id },
      data,
    });

    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: id,
      action: 'regulatoryWatch.updated',
      diff,
    });

    revalidatePath(ROUTE);
    return { ok: true };
  } catch (e) {
    console.error('[updateWatch] error', e);
    return { ok: false, error: (e as Error).message ?? 'Erreur mise à jour' };
  }
}

// ─── 3. updateExploitation ─────────────────────────────────────────────────
/**
 * Inline edit du champ exploitation (cellule du tableau Plan 03).
 *
 * NON-NÉGOCIABLE : set `dateLastReviewed = new Date()` à chaque appel — c'est
 * le mécanisme qui fait bouger le KPI "X jours depuis dernière mise à jour"
 * (cf. RESEARCH §8.4 + success criterion roadmap Phase 13).
 *
 * AuditLog `regulatoryWatch.exploitation_updated` avec diff before/after sur
 * `exploitation` ET `dateLastReviewed`.
 */
export async function updateExploitation(
  input: UpdateExploitationInput,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = updateExploitationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation failed' };

  try {
    const existing = await prisma.regulatoryWatch.findFirst({
      where: { id: parsed.data.id, tenantId: user.tenantId },
      select: { id: true, exploitation: true, dateLastReviewed: true },
    });
    if (!existing) return { ok: false, error: 'Entrée veille introuvable' };

    const now = new Date();
    await prisma.regulatoryWatch.update({
      where: { id: parsed.data.id },
      data: {
        exploitation: parsed.data.exploitation,
        dateLastReviewed: now,
      },
    });

    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: parsed.data.id,
      action: 'regulatoryWatch.exploitation_updated',
      diff: {
        exploitation: {
          before: existing.exploitation,
          after: parsed.data.exploitation,
        },
        dateLastReviewed: {
          before: existing.dateLastReviewed,
          after: now,
        },
      },
    });

    revalidatePath(ROUTE);
    return { ok: true };
  } catch (e) {
    console.error('[updateExploitation] error', e);
    return {
      ok: false,
      error: (e as Error).message ?? 'Erreur mise à jour exploitation',
    };
  }
}

// ─── 4. approveWatch ───────────────────────────────────────────────────────
/**
 * Validation d'une suggestion auto inbox (DRAFT + suggestedBy=AUTO) → ACTIVE.
 *
 * D-08 NO auto-accept : ce passage status='ACTIVE' n'a lieu QUE via cette action
 * (UI Plan 03 — bouton "Valider"). Le worker (Plan 05) crée toujours en DRAFT,
 * jamais ACTIVE directement, même si confidence ≥ 90.
 *
 * AuditLog `regulatoryWatch.approved` avec diff status DRAFT → ACTIVE.
 */
export async function approveWatch(watchId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  if (!watchId || typeof watchId !== 'string') {
    return { ok: false, error: 'ID watch invalide' };
  }

  try {
    const existing = await prisma.regulatoryWatch.findFirst({
      where: { id: watchId, tenantId: user.tenantId },
      select: { id: true, status: true, suggestedBy: true },
    });
    if (!existing) return { ok: false, error: 'Entrée veille introuvable' };

    if (existing.suggestedBy !== 'AUTO' || existing.status !== 'DRAFT') {
      return {
        ok: false,
        error: 'Seules les suggestions AUTO en statut DRAFT peuvent être validées',
      };
    }

    await prisma.regulatoryWatch.update({
      where: { id: watchId },
      data: { status: 'ACTIVE' },
    });

    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: watchId,
      action: 'regulatoryWatch.approved',
      diff: { status: { before: 'DRAFT', after: 'ACTIVE' } },
    });

    revalidatePath(ROUTE);
    return { ok: true };
  } catch (e) {
    console.error('[approveWatch] error', e);
    return { ok: false, error: (e as Error).message ?? 'Erreur validation' };
  }
}

// ─── 5. rejectWatch ────────────────────────────────────────────────────────
/**
 * Rejet d'une suggestion auto inbox → ARCHIVED avec raison.
 *
 * AuditLog `regulatoryWatch.rejected` avec diff status + rejectionReason.
 * On accepte le rejet sur les suggestedBy='AUTO' uniquement (l'inbox ne montre
 * que les suggestions auto).
 */
export async function rejectWatch(input: RejectWatchInput): Promise<ActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = rejectWatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation failed' };

  try {
    const existing = await prisma.regulatoryWatch.findFirst({
      where: { id: parsed.data.id, tenantId: user.tenantId },
      select: { id: true, status: true, suggestedBy: true },
    });
    if (!existing) return { ok: false, error: 'Entrée veille introuvable' };

    if (existing.suggestedBy !== 'AUTO') {
      return {
        ok: false,
        error: 'Seules les suggestions AUTO peuvent être rejetées via inbox',
      };
    }

    await prisma.regulatoryWatch.update({
      where: { id: parsed.data.id },
      data: { status: 'ARCHIVED' },
    });

    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: parsed.data.id,
      action: 'regulatoryWatch.rejected',
      diff: {
        status: { before: existing.status, after: 'ARCHIVED' },
        rejectionReason: parsed.data.reason,
      },
    });

    revalidatePath(ROUTE);
    return { ok: true };
  } catch (e) {
    console.error('[rejectWatch] error', e);
    return { ok: false, error: (e as Error).message ?? 'Erreur rejet' };
  }
}

// ─── 6. archiveWatch ───────────────────────────────────────────────────────
/**
 * Archivage manuel d'une entrée veille (kebab menu UI "Archiver").
 *
 * Soft-delete : passe `status='ARCHIVED'`. Conserve l'entrée pour historique
 * audit Qualiopi (les entrées ARCHIVED restent dans l'export PDF V2 si demandé).
 *
 * AuditLog `regulatoryWatch.archived` avec diff status before/after.
 */
export async function archiveWatch(watchId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  if (!watchId || typeof watchId !== 'string') {
    return { ok: false, error: 'ID watch invalide' };
  }

  try {
    const existing = await prisma.regulatoryWatch.findFirst({
      where: { id: watchId, tenantId: user.tenantId },
      select: { id: true, status: true },
    });
    if (!existing) return { ok: false, error: 'Entrée veille introuvable' };

    await prisma.regulatoryWatch.update({
      where: { id: watchId },
      data: { status: 'ARCHIVED' },
    });

    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: watchId,
      action: 'regulatoryWatch.archived',
      diff: { status: { before: existing.status, after: 'ARCHIVED' } },
    });

    revalidatePath(ROUTE);
    return { ok: true };
  } catch (e) {
    console.error('[archiveWatch] error', e);
    return { ok: false, error: (e as Error).message ?? 'Erreur archivage' };
  }
}
