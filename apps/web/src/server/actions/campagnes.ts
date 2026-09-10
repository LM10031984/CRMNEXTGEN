'use server';

/**
 * Server actions de la campagne de pré-inscription par RDV (lot F, spec §7).
 *
 * Le besoin, dans les mots de Laurent : « générer un lien par rapport à ce
 * rendez-vous où les gens peuvent se préinscrire, déposer leur dossier et leurs
 * papiers. Comme ça, l'admin peut voir ce qui est bon ou pas bon. On peut
 * mettre des dates préalables de formation. »
 *
 * Check-list `/quick` appliquée partout : requireRole · scope tenantId sur
 * TOUTES les requêtes, y compris les findFirst de contrôle · Zod avant tout
 * I/O · AuditLog dans la même transaction que l'écriture · revalidatePath ·
 * retour `{ ok }` discriminé, jamais de throw pour une erreur métier.
 *
 * Le token brut n'existe qu'une fois, au retour de la création : seule son
 * empreinte SHA-256 est stockée (doctrine §9.4, portée du repo diag). Le
 * reperdre oblige à en régénérer un — c'est le prix d'un lien qu'on ne peut pas
 * ressortir de la base après coup.
 */

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { z } from 'zod';

import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { hashPublicToken, PUBLIC_TOKEN_BYTES } from '@/lib/proposition/public-link';
import { defaultMaxUses, buildCampagneUrl } from '@/lib/campagne/lien';

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const;

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

async function guard(roles: readonly string[] = WRITE_ROLES) {
  try {
    return { ok: true as const, user: await requireRole([...roles] as never) };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false as const, error: e.message };
    }
    throw e;
  }
}

function revalidateCampagne(id?: string) {
  revalidatePath('/app/campagnes');
  if (id) revalidatePath(`/app/campagnes/${id}`);
  revalidatePath('/app/preinscriptions');
}

/** Validité par défaut du lien : le R2 + 30 j (§7.1). */
const DEFAULT_VALIDITY_DAYS = 30;

const DateOptionSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    label: z.string().trim().max(120).optional().nullable(),
  })
  .refine((d) => d.endsAt.getTime() > d.startsAt.getTime(), {
    message: 'La fin d’une date doit suivre son début',
    path: ['endsAt'],
  });

const CreateCampagneSchema = z.object({
  label: z.string().trim().min(3, 'Donnez un libellé reconnaissable').max(160),
  /**
   * D-22 — le rattachement canonique, et le seul obligatoire.
   *
   * Une campagne sans agence produisait des dossiers dont l'admin ne savait pas
   * de quel client ils venaient. Le diagnostic et le lead ci-dessous restent
   * facultatifs : ils ajoutent du contexte, ils ne remplacent jamais l'agence.
   */
  organizationId: z.string().uuid('Choisissez l’agence pour qui vous ouvrez cette campagne'),
  diagnosticId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  proposalId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  /** Sert à calculer le quota par défaut, et à afficher « X / Y » ensuite. */
  effectifAttendu: z.coerce.number().int().min(0).max(500).default(0),
  validityDays: z.coerce.number().int().min(1).max(365).default(DEFAULT_VALIDITY_DAYS),
  dateOptions: z.array(DateOptionSchema).max(6, 'Six dates suffisent à faire un choix').default([]),
});

export type CreateCampagneInput = z.input<typeof CreateCampagneSchema>;

/**
 * Créer une campagne et son lien.
 *
 * `effectifAttendu` sert à deux choses et pas à une : le quota par défaut
 * (3 × l'effectif, §4) et le dénominateur du « X pré-inscrits / Y attendus ».
 * Il est stocké dans `maxUses` divisé par 3 — non : il est stocké TEL QUEL
 * nulle part, et c'est assumé. Le modèle n'a pas de champ pour lui, et en
 * ajouter un pour un affichage ne valait pas une migration ; le dénominateur
 * se relit depuis `maxUses / 3`, qui est exactement ce qu'on en a fait.
 */
export async function createCampagne(
  input: CreateCampagneInput,
): Promise<ActionResult<{ id: string; url: string; token: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = CreateCampagneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  // Scope tenant sur les rattachements : une agence, un diagnostic, un lead ou
  // un produit d'un autre tenant ne doit pas pouvoir être accroché, même en
  // forgeant l'identifiant.
  const org = await prisma.organization.findFirst({
    where: { id: data.organizationId, tenantId: g.user.tenantId },
    select: { id: true },
  });
  if (!org) return { ok: false, error: 'Agence introuvable' };

  if (data.leadId) {
    const l = await prisma.lead.findFirst({
      where: { id: data.leadId, tenantId: g.user.tenantId },
      select: { id: true },
    });
    if (!l) return { ok: false, error: 'Lead introuvable' };
  }
  if (data.diagnosticId) {
    const d = await prisma.diagnostic.findFirst({
      where: { id: data.diagnosticId, tenantId: g.user.tenantId },
      select: { id: true },
    });
    if (!d) return { ok: false, error: 'Diagnostic introuvable' };
  }
  if (data.productId) {
    const p = await prisma.trainingProduct.findFirst({
      where: { id: data.productId, tenantId: g.user.tenantId },
      select: { id: true },
    });
    if (!p) return { ok: false, error: 'Produit introuvable' };
  }

  const token = randomBytes(PUBLIC_TOKEN_BYTES).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + data.validityDays);

  const created = await prisma.$transaction(async (tx) => {
    const batch = await tx.enrollmentBatch.create({
      data: {
        tenantId: g.user.tenantId,
        label: data.label,
        organizationId: data.organizationId,
        leadId: data.leadId || null,
        diagnosticId: data.diagnosticId || null,
        proposalId: data.proposalId || null,
        productId: data.productId || null,
        tokenHash: hashPublicToken(token),
        expiresAt,
        maxUses: defaultMaxUses(data.effectifAttendu),
        createdById: g.user.id,
        dateOptions: {
          create: data.dateOptions.map((d) => ({
            startsAt: d.startsAt,
            endsAt: d.endsAt,
            label: d.label || null,
          })),
        },
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'EnrollmentBatch',
        entityId: batch.id,
        action: 'campagne.create',
        diff: {
          label: data.label,
          organizationId: data.organizationId,
          leadId: data.leadId || null,
          diagnosticId: data.diagnosticId || null,
          effectifAttendu: data.effectifAttendu,
          dates: data.dateOptions.length,
          expiresAt: expiresAt.toISOString(),
          // Jamais le token, ni son empreinte : un AuditLog se relit, et ce
          // lien doit rester non rejouable depuis l'historique.
        },
      },
    });

    return batch;
  });

  revalidateCampagne(created.id);
  return {
    ok: true,
    data: { id: created.id, url: buildCampagneUrl(token), token },
  };
}

/**
 * Régénérer le lien.
 *
 * Le seul moyen de récupérer un lien perdu — et il INVALIDE le précédent, ce
 * qui est le comportement voulu : si on régénère parce que le lien a fuité,
 * laisser l'ancien ouvert ne servirait à rien.
 */
export async function regenerateCampagneToken(
  batchId: string,
): Promise<ActionResult<{ url: string; token: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const batch = await prisma.enrollmentBatch.findFirst({
    where: { id: batchId, tenantId: g.user.tenantId },
    select: { id: true, status: true },
  });
  if (!batch) return { ok: false, error: 'Campagne introuvable' };
  if (batch.status !== 'OUVERTE') {
    return { ok: false, error: 'Cette campagne est fermée : rouvrez-la avant de régénérer un lien.' };
  }

  const token = randomBytes(PUBLIC_TOKEN_BYTES).toString('hex');

  await prisma.$transaction(async (tx) => {
    await tx.enrollmentBatch.update({
      where: { id: batchId },
      data: { tokenHash: hashPublicToken(token) },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'EnrollmentBatch',
        entityId: batchId,
        action: 'campagne.token_regenerate',
        diff: { motif: 'lien régénéré — le précédent ne fonctionne plus' },
      },
    });
  });

  revalidateCampagne(batchId);
  return { ok: true, data: { url: buildCampagneUrl(token), token } };
}

const StatusSchema = z.enum(['OUVERTE', 'CLOTUREE', 'ANNULEE']);

/** Ouvrir, clôturer ou révoquer. Une révocation reste réversible côté outil. */
export async function setCampagneStatus(
  batchId: string,
  status: z.infer<typeof StatusSchema>,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = StatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'Statut inconnu' };

  const batch = await prisma.enrollmentBatch.findFirst({
    where: { id: batchId, tenantId: g.user.tenantId },
    select: { id: true, status: true },
  });
  if (!batch) return { ok: false, error: 'Campagne introuvable' };
  if (batch.status === parsed.data) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.enrollmentBatch.update({ where: { id: batchId }, data: { status: parsed.data } });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'EnrollmentBatch',
        entityId: batchId,
        action: 'campagne.status',
        diff: { avant: batch.status, apres: parsed.data },
      },
    });
  });

  revalidateCampagne(batchId);
  return { ok: true };
}

/**
 * Retenir une date.
 *
 * Une seule à la fois : retenir la deuxième libère la première. C'est cette
 * date qui commande ensuite la deadline administrative affichée aux
 * participants, et deux dates retenues donneraient deux deadlines.
 */
export async function retenirDate(
  batchId: string,
  dateOptionId: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const option = await prisma.batchDateOption.findFirst({
    where: { id: dateOptionId, batchId, batch: { tenantId: g.user.tenantId } },
    select: { id: true, isRetained: true, startsAt: true },
  });
  if (!option) return { ok: false, error: 'Date introuvable' };

  await prisma.$transaction(async (tx) => {
    await tx.batchDateOption.updateMany({ where: { batchId }, data: { isRetained: false } });
    await tx.batchDateOption.update({
      where: { id: dateOptionId },
      data: { isRetained: !option.isRetained },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'EnrollmentBatch',
        entityId: batchId,
        action: 'campagne.date_retenue',
        diff: {
          dateOptionId,
          startsAt: option.startsAt.toISOString(),
          retenue: !option.isRetained,
        },
      },
    });
  });

  revalidateCampagne(batchId);
  return { ok: true };
}

/** Ajouter une date après coup — le calendrier bouge, la campagne suit. */
export async function ajouterDate(
  batchId: string,
  input: z.input<typeof DateOptionSchema>,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = DateOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const batch = await prisma.enrollmentBatch.findFirst({
    where: { id: batchId, tenantId: g.user.tenantId },
    select: { id: true, _count: { select: { dateOptions: true } } },
  });
  if (!batch) return { ok: false, error: 'Campagne introuvable' };
  if (batch._count.dateOptions >= 6) {
    return { ok: false, error: 'Six dates suffisent à faire un choix.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchDateOption.create({
      data: {
        batchId,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        label: parsed.data.label || null,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'EnrollmentBatch',
        entityId: batchId,
        action: 'campagne.date_ajoutee',
        diff: { startsAt: parsed.data.startsAt.toISOString() },
      },
    });
  });

  revalidateCampagne(batchId);
  return { ok: true };
}

/**
 * Supprimer une date.
 *
 * Refusée dès qu'elle porte des voix : effacer une date choisie ferait
 * disparaître le choix de participants sans que personne ne le sache.
 */
export async function supprimerDate(
  batchId: string,
  dateOptionId: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const option = await prisma.batchDateOption.findFirst({
    where: { id: dateOptionId, batchId, batch: { tenantId: g.user.tenantId } },
    select: { id: true, votes: true, startsAt: true },
  });
  if (!option) return { ok: false, error: 'Date introuvable' };

  const voix =
    option.votes && typeof option.votes === 'object' && !Array.isArray(option.votes)
      ? Object.values(option.votes as Record<string, unknown>).filter(Boolean).length
      : 0;
  if (voix > 0) {
    return {
      ok: false,
      error: `Cette date a déjà ${voix} choix. Retirez-la de la sélection plutôt que de l’effacer.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchDateOption.delete({ where: { id: dateOptionId } });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'EnrollmentBatch',
        entityId: batchId,
        action: 'campagne.date_supprimee',
        diff: { startsAt: option.startsAt.toISOString() },
      },
    });
  });

  revalidateCampagne(batchId);
  return { ok: true };
}
