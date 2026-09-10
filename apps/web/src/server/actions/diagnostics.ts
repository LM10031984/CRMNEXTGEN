'use server';

/**
 * Server actions du diagnostic d'agence R1 (lot B de la chaîne diagnostic).
 *
 * À ne pas confondre avec `diagnostic-public.ts` / `diagnostic-admin.ts`, qui
 * servent l'express 8 questions du stand MLS. Ici on est sur le R1 commercial :
 * 94 questions, grille équipe, synthèses budget et pipeline.
 *
 * Check-list appliquée à chaque action (convention `/quick`) :
 *   requireRole · scope tenantId sur TOUTES les requêtes, y compris les
 *   findFirst de contrôle · Zod avant tout I/O · AuditLog dans la même
 *   transaction que l'écriture · no-op si rien ne change · revalidatePath sur
 *   toutes les pages qui lisent · retour `{ ok }` discriminé, jamais de throw
 *   pour une erreur métier · Decimal comparé via Number().
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import {
  CreateDiagnosticSchema,
  parseAnswerValue,
  SaveAnswerSchema,
  UpsertParticipantSchema,
} from '@qualiof/shared';
import { getQuestionsForVariant, REFERENTIAL_VERSION } from '@qualiof/shared/diagnostic';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { computeSnapshot, resolveEmployeeCount } from '@/lib/diagnostic-r1/snapshot';

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const;

async function guard() {
  try {
    return { ok: true as const, user: await requireRole([...WRITE_ROLES]) };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false as const, error: e.message };
    }
    throw e;
  }
}

/** Référence DIAG-NNNN — même mécanique que DEV-NNNN sur les devis. */
async function generateDiagnosticReference(tenantId: string): Promise<string> {
  const existing = await prisma.diagnostic.findMany({
    where: { tenantId, reference: { startsWith: 'DIAG-' } },
    select: { reference: true },
  });
  const maxSeq = existing.reduce((m, d) => {
    const match = d.reference.match(/^DIAG-0*(\d+)$/);
    if (!match || !match[1]) return m;
    return Math.max(m, parseInt(match[1], 10));
  }, 0);
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = `DIAG-${String(maxSeq + attempt).padStart(4, '0')}`;
    const clash = await prisma.diagnostic.findFirst({
      where: { tenantId, reference: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('Impossible de générer une référence de diagnostic unique (50 collisions).');
}

/** Le diagnostic, scopé tenant. Aucune action ne lit un diagnostic autrement. */
async function findScoped(diagnosticId: string, tenantId: string) {
  return prisma.diagnostic.findFirst({
    where: { id: diagnosticId, tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      variant: true,
      organizationId: true,
      reference: true,
    },
  });
}

function revalidateDiagnostic(id: string) {
  revalidatePath('/app/diagnostics');
  revalidatePath(`/app/diagnostics/${id}`);
  revalidatePath(`/app/diagnostics/${id}/chapitre/[chapitre]`, 'page');
  revalidatePath('/app/leads');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Créer un diagnostic
// ─────────────────────────────────────────────────────────────────────────────

export async function createDiagnostic(
  input: unknown,
): Promise<ActionResult<{ diagnosticId: string; reference: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const parsed = CreateDiagnosticSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  let leadId = data.leadId ?? null;
  let organizationId: string | null = null;

  if (leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { id: true, organizationId: true },
    });
    if (!lead) return { ok: false, error: 'Lead introuvable' };
    organizationId = lead.organizationId;
  }

  const reference = await generateDiagnosticReference(user.tenantId);

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Créer le lead à la volée : en R1 on rencontre une agence avant qu'elle
      // n'existe au CRM. Le refus de saisir deux fois est la moitié du lot B.
      if (!leadId) {
        const lead = await tx.lead.create({
          data: {
            tenantId: user.tenantId,
            source: 'Diagnostic R1',
            status: 'QUALIFIED',
            firstName: data.newLeadContactFirstName || null,
            lastName: data.newLeadContactLastName || data.newLeadCompanyName || null,
            email: data.newLeadEmail || null,
            phone: data.newLeadPhone || null,
            ownerUserId: user.id,
            notes: `Agence : ${data.newLeadCompanyName}`,
          },
          select: { id: true },
        });
        leadId = lead.id;
      }

      const diagnostic = await tx.diagnostic.create({
        data: {
          tenantId: user.tenantId,
          reference,
          leadId: leadId!,
          organizationId,
          ownerUserId: user.id,
          variant: data.variant,
          mode: 'GUIDE',
          status: 'EN_COURS',
          referentialVersion: REFERENTIAL_VERSION,
          meetingAt: data.meetingAt ?? new Date(),
          r2PlannedAt: data.r2PlannedAt ?? null,
          expectedParticipants: data.expectedParticipants ?? null,
        },
        select: { id: true, reference: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnostic.id,
          action: 'diagnostic.created',
          diff: {
            reference: diagnostic.reference,
            variant: data.variant,
            referentialVersion: REFERENTIAL_VERSION,
            leadId,
          },
        },
      });

      return diagnostic;
    });

    revalidateDiagnostic(created.id);
    return { ok: true, data: { diagnosticId: created.id, reference: created.reference } };
  } catch (e) {
    console.error('[diagnostics] createDiagnostic', e);
    return { ok: false, error: "Le diagnostic n'a pas pu être créé." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Enregistrer une réponse (autosave)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Autosave d'une réponse. Appelée à chaque champ quitté, donc :
 *   • no-op si la valeur n'a pas bougé (pas d'AuditLog vide, pas d'écriture) ;
 *   • pas de `revalidatePath` ici — re-rendre la page à chaque frappe ferait
 *     sauter le focus du champ suivant en pleine saisie. La progression est
 *     rafraîchie par l'écran, pas par le serveur.
 */
export async function saveDiagnosticAnswer(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const parsed = SaveAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { diagnosticId, questionId, isSkipped } = parsed.data;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'ARCHIVE') {
    return { ok: false, error: 'Ce diagnostic est archivé.' };
  }

  // La question doit appartenir au set de la variante : sinon un léger se
  // remplirait de réponses invisibles à l'écran.
  const allowed = getQuestionsForVariant(diagnostic.variant).some((q) => q.id === questionId);
  if (!allowed) {
    return { ok: false, error: 'Cette question ne fait pas partie du diagnostic en cours.' };
  }

  const valueResult = parseAnswerValue(questionId, parsed.data.value);
  if (!valueResult.ok) return { ok: false, error: valueResult.error };
  const value = valueResult.value;

  const existing = await prisma.diagnosticAnswer.findUnique({
    where: { diagnosticId_questionId: { diagnosticId, questionId } },
    select: { id: true, value: true, isSkipped: true },
  });

  const unchanged =
    existing &&
    existing.isSkipped === isSkipped &&
    JSON.stringify(existing.value ?? null) === JSON.stringify(value ?? null);
  if (unchanged) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnosticAnswer.upsert({
        where: { diagnosticId_questionId: { diagnosticId, questionId } },
        create: {
          diagnosticId,
          questionId,
          value: value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue),
          isSkipped,
          origin: 'COMMERCIAL',
          confirmedAt: new Date(),
          confirmedById: user.id,
        },
        update: {
          value: value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue),
          isSkipped,
          // Une reprise en main humaine efface le doute d'une extraction IA :
          // la réponse redevient une réponse du commercial, confirmée.
          origin: 'COMMERCIAL',
          aiConfidence: null,
          confirmedAt: new Date(),
          confirmedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.answer.saved',
          diff: {
            questionId,
            before: (existing?.value ?? null) as Prisma.InputJsonValue,
            after: (value ?? null) as Prisma.InputJsonValue,
            isSkipped,
          },
        },
      });
    });
    return { ok: true };
  } catch (e) {
    console.error('[diagnostics] saveDiagnosticAnswer', e);
    return { ok: false, error: "La réponse n'a pas pu être enregistrée." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Grille équipe
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertDiagnosticParticipant(
  input: unknown,
): Promise<ActionResult<{ participantId: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const parsed = UpsertParticipantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const diagnostic = await findScoped(d.diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };

  const data = {
    displayName: d.displayName,
    statut: d.statut,
    fonction: d.fonction || null,
    fullTime: d.fullTime ?? null,
    experienceLevel: d.experienceLevel || null,
    caN1: d.caN1 ?? null,
    caCurrent: d.caCurrent ?? null,
    opcoEligible: d.opcoEligible ?? (d.statut === 'SALARIE' ? true : null),
    trainings24mCount: d.trainings24mCount ?? null,
    trainings24mHours: d.trainings24mHours ?? null,
    trainings24mFunded: d.trainings24mFunded ?? null,
    wantsTraining: d.wantsTraining ?? null,
    priorityNeed: d.priorityNeed || null,
    objectiveCa: d.objectiveCa ?? null,
    strengths: d.strengths || null,
    includedInProposal: d.includedInProposal,
  };

  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (d.id) {
        // Scope de contrôle : la fiche doit appartenir à CE diagnostic.
        const own = await tx.diagnosticParticipant.findFirst({
          where: { id: d.id, diagnosticId: d.diagnosticId },
          select: { id: true },
        });
        if (!own) throw new Error('FICHE_HORS_PERIMETRE');
        const updated = await tx.diagnosticParticipant.update({
          where: { id: d.id },
          data,
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'Diagnostic',
            entityId: d.diagnosticId,
            action: 'diagnostic.participant.updated',
            // Pas de nom ni de production dans le journal : la fiche équipe est
            // une donnée sensible, l'identifiant suffit à retrouver la ligne.
            diff: { participantId: updated.id, statut: d.statut },
          },
        });
        return updated;
      }

      const created = await tx.diagnosticParticipant.create({
        data: { ...data, diagnosticId: d.diagnosticId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: d.diagnosticId,
          action: 'diagnostic.participant.created',
          diff: { participantId: created.id, statut: d.statut },
        },
      });
      return created;
    });

    revalidateDiagnostic(d.diagnosticId);
    return { ok: true, data: { participantId: saved.id } };
  } catch (e) {
    if (e instanceof Error && e.message === 'FICHE_HORS_PERIMETRE') {
      return { ok: false, error: 'Fiche introuvable sur ce diagnostic.' };
    }
    console.error('[diagnostics] upsertDiagnosticParticipant', e);
    return { ok: false, error: "La fiche n'a pas pu être enregistrée." };
  }
}

export async function deleteDiagnosticParticipant(
  diagnosticId: string,
  participantId: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };

  const own = await prisma.diagnosticParticipant.findFirst({
    where: { id: participantId, diagnosticId },
    select: { id: true },
  });
  if (!own) return { ok: false, error: 'Fiche introuvable sur ce diagnostic.' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnosticParticipant.delete({ where: { id: participantId } });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.participant.deleted',
          diff: { participantId },
        },
      });
    });
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostics] deleteDiagnosticParticipant', e);
    return { ok: false, error: "La fiche n'a pas pu être supprimée." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Synthèses — recalcul du snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recalcule et persiste le snapshot (budget + pipeline).
 *
 * Appelée à la complétion d'un chapitre. Le calcul lui-même est pur et
 * instantané ; ce qui coûte, ce sont les deux lectures — d'où l'appel explicite
 * plutôt qu'un recalcul à chaque frappe.
 */
export async function recomputeDiagnosticSnapshot(
  diagnosticId: string,
): Promise<ActionResult<{ computedAt: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };

  try {
    const [answers, participants, { values: rules }] = await Promise.all([
      prisma.diagnosticAnswer.findMany({
        where: { diagnosticId },
        select: { questionId: true, value: true, isSkipped: true },
      }),
      prisma.diagnosticParticipant.findMany({
        where: { diagnosticId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          statut: true,
          caN1: true,
          opcoEligible: true,
          trainings24mFunded: true,
          includedInProposal: true,
          personId: true,
        },
      }),
      loadFundingRules(user.tenantId),
    ]);

    // La CFP réelle prime sur l'estimation dès que la personne est au CRM.
    const personIds = participants.map((p) => p.personId).filter((x): x is string => Boolean(x));
    const cfpByPerson = new Map<string, number | null>();
    if (personIds.length > 0) {
      const links = await prisma.legalLink.findMany({
        where: { personId: { in: personIds }, organization: { tenantId: user.tenantId } },
        select: { personId: true, organization: { select: { ageficeProfile: true } } },
      });
      for (const l of links) {
        const budget = l.organization?.ageficeProfile?.lastCfpEligibleBudget ?? null;
        if (budget !== null && !cfpByPerson.has(l.personId)) cfpByPerson.set(l.personId, budget);
      }
    }

    const answerMap = Object.fromEntries(
      answers.filter((a) => !a.isSkipped).map((a) => [a.questionId, a.value]),
    );

    const snapshotParticipants = participants.map((p) => ({
      id: p.id,
      statut: p.statut,
      caN1: p.caN1 === null ? null : Number(p.caN1),
      cfpEligibleBudget: p.personId ? (cfpByPerson.get(p.personId) ?? null) : null,
      opcoEligible: p.opcoEligible,
      consumedThisYear: null,
      trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded),
      includedInProposal: p.includedInProposal,
    }));

    const snapshot = computeSnapshot({
      rules,
      participants: snapshotParticipants,
      answers: answerMap,
      employeeCount: resolveEmployeeCount(answerMap, snapshotParticipants),
    });

    await prisma.diagnostic.update({
      where: { id: diagnosticId },
      data: { computedSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });

    revalidateDiagnostic(diagnosticId);
    return { ok: true, data: { computedAt: snapshot.computedAt } };
  } catch (e) {
    console.error('[diagnostics] recomputeDiagnosticSnapshot', e);
    return { ok: false, error: 'Le recalcul des synthèses a échoué.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Passage en audit complet · clôture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Passe un LÉGER en COMPLET. Aucune réponse n'est touchée : le set léger est un
 * sous-ensemble strict du complet, les questions manquantes apparaissent, c'est
 * tout. C'est ce que le test de contrat du référentiel garantit.
 */
export async function upgradeDiagnosticToComplet(diagnosticId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.variant === 'COMPLET') return { ok: true }; // no-op assumé

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnostic.update({
        where: { id: diagnosticId },
        data: { variant: 'COMPLET' },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.upgraded',
          diff: { variant: { before: 'LEGER', after: 'COMPLET' } },
        },
      });
    });
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostics] upgradeDiagnosticToComplet', e);
    return { ok: false, error: 'Le passage en audit complet a échoué.' };
  }
}

export async function completeDiagnostic(diagnosticId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'TERMINE') return { ok: true };

  // On recalcule AVANT de clore : le snapshot d'un diagnostic terminé est celui
  // que le rapport d'audit reprendra.
  await recomputeDiagnosticSnapshot(diagnosticId);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnostic.update({
        where: { id: diagnosticId },
        data: { status: 'TERMINE', completedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.completed',
          diff: { status: { before: diagnostic.status, after: 'TERMINE' } },
        },
      });
    });
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostics] completeDiagnostic', e);
    return { ok: false, error: 'La clôture du diagnostic a échoué.' };
  }
}

export async function reopenDiagnostic(diagnosticId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'EN_COURS') return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnostic.update({
        where: { id: diagnosticId },
        data: { status: 'EN_COURS', completedAt: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.reopened',
          diff: { status: { before: diagnostic.status, after: 'EN_COURS' } },
        },
      });
    });
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostics] reopenDiagnostic', e);
    return { ok: false, error: 'La réouverture a échoué.' };
  }
}
