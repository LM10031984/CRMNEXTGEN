'use server';

/**
 * Server actions Paramètres OF (Phase 7 Plan 07-02 Task 3).
 *
 * 4 actions discriminées `{ ok, ... }` qui :
 *  1. Vérifient l'authentification via `validateRequest()`
 *  2. Valident l'input via le schéma Zod correspondant (`tenant-settings.ts`
 *     dans `@qualiof/shared`)
 *  3. Lisent le Tenant `before` (snapshot des champs concernés), appliquent
 *     `prisma.tenant.update` avec `where: { id: user.tenantId }`, relisent
 *     `after`
 *  4. Calculent le diff per-champ et créent une row `AuditLog` avec
 *     `action: 'parameters.update'` (D-09 — granularité par champ). Si aucun
 *     champ n'a changé, no-op (pas d'AuditLog superflu).
 *  5. `revalidatePath('/app/parametres')` pour forcer le rendu serveur à
 *     relire la BDD.
 *
 * Helpers exportés (`computeDiff` + `logTenantSettingsChange`) pour réutilisation
 * Plan 07-03 (upload assets logo/signatures qui logguera `parameters.upload.logo`,
 * `parameters.upload.signature.pedago`, etc. avec le même diff helper).
 *
 * Sécurité : toutes les mutations sont scopées par `where: { id: user.tenantId }`
 * — un utilisateur ne peut éditer que les Paramètres de son propre tenant.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import {
  tenantIdentitySchema,
  tenantAddressSchema,
  tenantBillingSchema,
  tenantEmailSchema,
  type TenantIdentityInput,
  type TenantAddressInput,
  type TenantBillingInput,
  type TenantEmailInput,
} from '@qualiof/shared';

type Diff = Record<string, { before: unknown; after: unknown }>;

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Helper pur — calcule la diff entre deux snapshots de champs Tenant.
 *
 * Stratégie de comparaison :
 *  - `null` et `undefined` sont normalisés à chaîne vide (les Paramètres OF
 *    autorisent souvent "vidange" d'un champ qui passe de `'X'` à `null`).
 *  - Les objets (typiquement `address` Json) sont comparés via JSON.stringify
 *    (shallow, suffisant pour les structures plates utilisées dans Tenant).
 *  - Les primitives sont comparées via leur String() representation.
 *
 * Retourne uniquement les clés qui diffèrent réellement → no-op AuditLog si {}.
 *
 * Exporté pour tests + réutilisation Plan 07-03.
 */
export function computeDiff<T extends Record<string, unknown>>(before: T, after: T): Diff {
  const diff: Diff = {};
  for (const key of Object.keys(after)) {
    const b = before[key];
    const a = after[key];
    const bStr =
      b === null || b === undefined
        ? ''
        : typeof b === 'object'
          ? JSON.stringify(b)
          : String(b);
    const aStr =
      a === null || a === undefined
        ? ''
        : typeof a === 'object'
          ? JSON.stringify(a)
          : String(a);
    if (bStr !== aStr) {
      diff[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return diff;
}

/**
 * Helper — écrit une row AuditLog si la diff n'est pas vide.
 *
 * Convention `action` (D-09 + Phase 8 RBAC) :
 *  - 'parameters.update' : identité, adresse, RIB, email
 *  - 'parameters.upload.logo' : Plan 07-03
 *  - 'parameters.upload.signature.pedago' : Plan 07-03
 *  - 'parameters.upload.signature.dirigeant' : Plan 07-03
 *
 * Exporté pour réutilisation Plan 07-03.
 */
export async function logTenantSettingsChange(opts: {
  tenantId: string;
  userId: string;
  action: string;
  diff: Diff;
}): Promise<void> {
  // No-op si aucun champ n'a changé — évite les logs vides qui polluent
  // l'historique sans valeur informative.
  if (Object.keys(opts.diff).length === 0) return;
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      entity: 'Tenant',
      entityId: opts.tenantId,
      action: opts.action,
      diff: opts.diff,
    },
  });
}

// ─── 1. SET-01 — Identité OF ────────────────────────────────────────────
export async function updateTenantIdentity(input: TenantIdentityInput): Promise<ActionResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const parsed = tenantIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation échouée',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { name: true, siret: true, numDA: true, rcs: true, legalForm: true },
  });
  if (!before) return { ok: false, error: 'Tenant introuvable' };

  const after = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: parsed.data,
    select: { name: true, siret: true, numDA: true, rcs: true, legalForm: true },
  });

  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'parameters.update',
    diff: computeDiff(before as Record<string, unknown>, after as Record<string, unknown>),
  });

  revalidatePath('/app/parametres');
  return { ok: true };
}

// ─── 2. SET-02 — Adresse + mentions légales (logo/signatures = Plan 07-03) ───
export async function updateTenantAddress(input: TenantAddressInput): Promise<ActionResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const parsed = tenantAddressSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation échouée',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { address: true, legalMentions: true },
  });
  if (!before) return { ok: false, error: 'Tenant introuvable' };

  // address est un Json Prisma — accepter undefined/null et l'address Zod
  // shape sans coupler aux internals Prisma.InputJsonValue.
  const after = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      address: (parsed.data.address ?? null) as never,
      legalMentions: parsed.data.legalMentions ?? null,
    },
    select: { address: true, legalMentions: true },
  });

  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'parameters.update',
    diff: computeDiff(before as Record<string, unknown>, after as Record<string, unknown>),
  });

  revalidatePath('/app/parametres');
  return { ok: true };
}

// ─── 3. SET-03 — Préférences facturation (préfixe + RIB) ─────────────────
export async function updateTenantBilling(input: TenantBillingInput): Promise<ActionResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const parsed = tenantBillingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation échouée',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { invoicePrefix: true, iban: true, bic: true },
  });
  if (!before) return { ok: false, error: 'Tenant introuvable' };

  const after = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      invoicePrefix: parsed.data.invoicePrefix,
      iban: parsed.data.iban ?? null,
      bic: parsed.data.bic ?? null,
    },
    select: { invoicePrefix: true, iban: true, bic: true },
  });

  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'parameters.update',
    diff: computeDiff(before as Record<string, unknown>, after as Record<string, unknown>),
  });

  revalidatePath('/app/parametres');
  return { ok: true };
}

// ─── 4. SET-03 — Email expéditeur SMTP ───────────────────────────────────
export async function updateTenantEmail(input: TenantEmailInput): Promise<ActionResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const parsed = tenantEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation échouée',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { emailFrom: true },
  });
  if (!before) return { ok: false, error: 'Tenant introuvable' };

  // emailFrom : '' (chaîne vide volontaire) → stocker `null` en BDD pour que
  // `of-config.pick(t.emailFrom, 'OF_EMAIL', ...)` repasse en fallback ENV.
  const after = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { emailFrom: parsed.data.emailFrom || null },
    select: { emailFrom: true },
  });

  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'parameters.update',
    diff: computeDiff(before as Record<string, unknown>, after as Record<string, unknown>),
  });

  revalidatePath('/app/parametres');
  return { ok: true };
}
