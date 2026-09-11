'use server';

/**
 * Lot C — le transcript et son pré-remplissage (spec §6.4).
 *
 * Le parcours : le commercial mène son R1 en conversation libre, colle le
 * compte rendu ici, et retrouve son questionnaire déjà servi — chaque réponse
 * accompagnée de l'extrait qui la justifie. Il ne relit pas 94 écrans, il
 * traite trois files (`lib/diagnostic-r1/transcript/triage.ts`).
 *
 * Deux invariants tiennent tout le lot, et ils sont vérifiés ICI, pas seulement
 * dans le prompt :
 *   • une réponse du commercial n'est JAMAIS écrasée (mode HYBRIDE), ni une
 *     réponse IA déjà confirmée — le `updateMany` porte la condition ;
 *   • rien de non confirmé ne sort d'un calcul ou d'un document — c'est le
 *     filtre `REPONSES_CONFIRMEES`, appliqué chez les lecteurs.
 *
 * Check-list appliquée à chaque action (convention `/quick`) : requireRole ·
 * scope tenantId sur toutes les requêtes · Zod avant tout I/O · AuditLog dans
 * la transaction · revalidatePath · retour `{ ok }` discriminé.
 */

import { createHash } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma, Prisma } from '@qualiof/db';
import { REFERENTIAL_VERSION } from '@qualiof/shared/diagnostic';

import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { extraireDuTranscript } from '@/lib/diagnostic-r1/transcript/extract';
import type { ReponseExistante } from '@/lib/diagnostic-r1/transcript/normalize';
import { PROMPT_VERSION } from '@/lib/diagnostic-r1/transcript/prompt';

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

/** Le diagnostic, scopé tenant. Aucune action ne le lit autrement. */
async function findScoped(diagnosticId: string, tenantId: string) {
  return prisma.diagnostic.findFirst({
    where: { id: diagnosticId, tenantId },
    select: { id: true, tenantId: true, status: true, variant: true, reference: true, mode: true },
  });
}

function revalidateDiagnostic(id: string) {
  revalidatePath('/app/diagnostics');
  revalidatePath(`/app/diagnostics/${id}`);
  revalidatePath(`/app/diagnostics/${id}/transcript`);
  revalidatePath(`/app/diagnostics/${id}/chapitre/[chapitre]`, 'page');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Déposer le transcript
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 400 000 caractères ≈ 2 h 30 de conversation transcrite. Au-delà, ce n'est
 * plus un rendez-vous, et l'appel serait de toute façon coupé.
 */
const TRANSCRIPT_MAX = 400_000;

const EnregistrerTranscriptSchema = z.object({
  diagnosticId: z.string().uuid(),
  transcriptText: z
    .string()
    .trim()
    .min(200, 'Un compte rendu de rendez-vous fait plus de 200 caractères.')
    .max(TRANSCRIPT_MAX, 'Compte rendu trop long — le déposer en deux fois.'),
  transcriptSource: z.enum(['colle', 'fichier']),
});

export async function enregistrerTranscript(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const parsed = EnregistrerTranscriptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { diagnosticId, transcriptText, transcriptSource } = parsed.data;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'ARCHIVE') return { ok: false, error: 'Ce diagnostic est archivé.' };

  // Le mode se DÉDUIT de ce qui existe déjà : un questionnaire déjà entamé au
  // clavier devient HYBRIDE, un questionnaire vierge devient TRANSCRIPT. On ne
  // demande pas au commercial de qualifier sa propre séance.
  const dejaSaisies = await prisma.diagnosticAnswer.count({
    where: { diagnosticId, origin: 'COMMERCIAL' },
  });
  const mode = dejaSaisies > 0 ? 'HYBRIDE' : 'TRANSCRIPT';

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnostic.update({
        where: { id: diagnosticId },
        data: { transcriptText, transcriptSource, mode },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.transcript.saved',
          // Jamais le texte : il porte des propos nominatifs sur des personnes
          // qui n'ont pas demandé à figurer dans un journal (§L-10, RGPD).
          diff: { source: transcriptSource, longueur: transcriptText.length, mode },
        },
      });
    });
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostic-transcript] enregistrerTranscript', e);
    return { ok: false, error: "Le compte rendu n'a pas pu être enregistré." };
  }
}

/**
 * Effacer le transcript sans toucher aux réponses qui en sont issues.
 *
 * C'est la porte RGPD manuelle, à côté de la purge automatique à J+90
 * (`lib/rgpd/retention.ts`) : le texte source est ce qu'il y a de plus
 * sensible — il contient des propos sur des salariés nommés. Les réponses
 * extraites, elles, sont des données de diagnostic ; elles restent.
 */
export async function supprimerTranscript(diagnosticId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  if (!z.string().uuid().safeParse(diagnosticId).success) {
    return { ok: false, error: 'Diagnostic introuvable' };
  }
  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.diagnostic.update({
        where: { id: diagnosticId },
        data: { transcriptText: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.transcript.deleted',
          diff: { motif: 'suppression manuelle' },
        },
      });
    });
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostic-transcript] supprimerTranscript', e);
    return { ok: false, error: "Le compte rendu n'a pas pu être supprimé." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Le pré-remplissage
// ─────────────────────────────────────────────────────────────────────────────

export interface BilanPreRemplissage {
  retenues: number;
  rejets: number;
  rejetsParMotif: Record<string, number>;
  model: string;
  durationMs: number;
}

const MESSAGES_ERREUR: Record<string, string> = {
  'transcript-vide': "Aucun compte rendu n'est déposé sur ce diagnostic.",
  'reponse-coupee':
    'Le compte rendu est trop long pour un seul passage — le déposer en deux fois.',
  'json-hors-format': "Le modèle n'a pas répondu dans le format attendu. Relancer l'extraction.",
  'appel-echoue': "Le service d'IA n'a pas répondu. Réessayer dans un instant.",
};

/**
 * Lance l'extraction et écrit les réponses retenues.
 *
 * Appelée par la route `/api/diagnostic-r1/prefill` plutôt que directement
 * depuis l'écran : l'appel dure des dizaines de secondes, et c'est la route qui
 * porte le `maxDuration` (même raison que `/api/diagnostic/traiter` pour
 * l'express du stand).
 */
export async function lancerPreRemplissage(
  diagnosticId: string,
): Promise<ActionResult<BilanPreRemplissage>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  if (!z.string().uuid().safeParse(diagnosticId).success) {
    return { ok: false, error: 'Diagnostic introuvable' };
  }

  const diagnostic = await prisma.diagnostic.findFirst({
    where: { id: diagnosticId, tenantId: user.tenantId },
    select: { id: true, status: true, variant: true, transcriptText: true },
  });
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'ARCHIVE') return { ok: false, error: 'Ce diagnostic est archivé.' };
  if (!diagnostic.transcriptText) {
    return { ok: false, error: MESSAGES_ERREUR['transcript-vide']! };
  }

  // Un second clic pendant que le premier tourne relancerait un appel payant
  // sur le même texte, et les deux écritures se marcheraient dessus.
  const enCours = await prisma.aIGenerationJob.findFirst({
    where: { tenantId: user.tenantId, refTable: 'Diagnostic', refId: diagnosticId, status: 'RUNNING' },
    select: { id: true, createdAt: true },
  });
  if (enCours) {
    return { ok: false, error: 'Une extraction est déjà en cours sur ce diagnostic.' };
  }

  const answers = await prisma.diagnosticAnswer.findMany({
    where: { diagnosticId },
    select: { questionId: true, value: true, isSkipped: true, origin: true, confirmedAt: true },
  });
  const existantes: ReponseExistante[] = answers.map((a) => ({
    questionId: a.questionId,
    value: a.value,
    isSkipped: a.isSkipped,
    origin: a.origin,
    confirmed: a.confirmedAt !== null,
  }));

  const inputHash = createHash('sha256')
    .update(
      [diagnostic.transcriptText, diagnostic.variant, REFERENTIAL_VERSION, PROMPT_VERSION].join('|'),
    )
    .digest('hex');

  const job = await prisma.aIGenerationJob.create({
    data: {
      tenantId: user.tenantId,
      provider: '-',
      model: '-',
      promptVersion: PROMPT_VERSION,
      inputHash,
      status: 'RUNNING',
      refTable: 'Diagnostic',
      refId: diagnosticId,
    },
    select: { id: true },
  });

  const resultat = await extraireDuTranscript({
    transcript: diagnostic.transcriptText,
    variant: diagnostic.variant,
    existantes,
  });

  if (!resultat.ok) {
    await prisma.aIGenerationJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMsg: `${resultat.erreur}${resultat.detail ? ` — ${resultat.detail}` : ''}` },
    });
    return { ok: false, error: MESSAGES_ERREUR[resultat.erreur] ?? "L'extraction a échoué." };
  }

  // On partage AVANT la transaction : les décisions sont déjà prises par le
  // moteur pur, la transaction ne fait qu'écrire.
  const dejaEnBase = new Set(answers.map((a) => a.questionId));
  const aCreer = resultat.retenues.filter((r) => !dejaEnBase.has(r.questionId));
  const aRemplacer = resultat.retenues.filter((r) => dejaEnBase.has(r.questionId));

  const rejetsParMotif = resultat.rejets.reduce<Record<string, number>>((acc, r) => {
    acc[r.motif] = (acc[r.motif] ?? 0) + 1;
    return acc;
  }, {});

  try {
    await prisma.$transaction(
      async (tx) => {
        if (aCreer.length > 0) {
          await tx.diagnosticAnswer.createMany({
            data: aCreer.map((r) => ({
              diagnosticId,
              questionId: r.questionId,
              value: r.value as Prisma.InputJsonValue,
              isSkipped: false,
              origin: 'IA_TRANSCRIPT' as const,
              aiConfidence: new Prisma.Decimal(r.confidence),
              aiQuote: r.quote,
              confirmedAt: null,
            })),
            // Quelqu'un a pu répondre entre la lecture et l'écriture : la
            // contrainte d'unicité tranche, et sa réponse gagne.
            skipDuplicates: true,
          });
        }

        for (const r of aRemplacer) {
          // La condition EST le garde-fou : on ne remplace qu'une extraction
          // que personne n'a encore relue. Une réponse du commercial ou une
          // extraction confirmée ne bouge pas, même si le modèle est plus sûr.
          await tx.diagnosticAnswer.updateMany({
            where: {
              diagnosticId,
              questionId: r.questionId,
              origin: 'IA_TRANSCRIPT',
              confirmedAt: null,
            },
            data: {
              value: r.value as Prisma.InputJsonValue,
              isSkipped: false,
              aiConfidence: new Prisma.Decimal(r.confidence),
              aiQuote: r.quote,
            },
          });
        }

        await tx.diagnostic.update({
          where: { id: diagnosticId },
          data: { prefillModel: resultat.meta.model, prefillAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'Diagnostic',
            entityId: diagnosticId,
            action: 'diagnostic.transcript.prefilled',
            // Des compteurs, pas des réponses : le détail se lit sur l'écran de
            // revue, et le journal n'a pas à porter les propos du dirigeant.
            diff: {
              retenues: resultat.retenues.length,
              creees: aCreer.length,
              remplacees: aRemplacer.length,
              rejets: resultat.rejets.length,
              rejetsParMotif,
              soumises: resultat.meta.soumises,
              model: resultat.meta.model,
              promptVersion: resultat.meta.promptVersion,
            },
          },
        });
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    console.error('[diagnostic-transcript] écriture du pré-remplissage', e);
    await prisma.aIGenerationJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMsg: 'écriture des réponses impossible' },
    });
    return { ok: false, error: "Les réponses extraites n'ont pas pu être enregistrées." };
  }

  await prisma.aIGenerationJob.update({
    where: { id: job.id },
    data: {
      status: 'DONE',
      provider: resultat.meta.provider,
      model: resultat.meta.model,
      latencyMs: resultat.meta.durationMs,
    },
  });

  revalidateDiagnostic(diagnosticId);
  return {
    ok: true,
    data: {
      retenues: resultat.retenues.length,
      rejets: resultat.rejets.length,
      rejetsParMotif,
      model: resultat.meta.model,
      durationMs: resultat.meta.durationMs,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. La revue : confirmer, rejeter
// ─────────────────────────────────────────────────────────────────────────────

const ConfirmerSchema = z.object({
  diagnosticId: z.string().uuid(),
  questionIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * Confirme des réponses extraites — à l'unité ou par chapitre.
 *
 * C'est le geste qui fait entrer une réponse dans les calculs et les documents :
 * avant lui, elle ne compte nulle part (`REPONSES_CONFIRMEES`). Il porte donc
 * le nom de celui qui l'a fait, et la date.
 */
export async function confirmerReponses(input: unknown): Promise<ActionResult<{ count: number }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const parsed = ConfirmerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { diagnosticId, questionIds } = parsed.data;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'ARCHIVE') return { ok: false, error: 'Ce diagnostic est archivé.' };

  try {
    let count = 0;
    await prisma.$transaction(async (tx) => {
      const r = await tx.diagnosticAnswer.updateMany({
        where: {
          diagnosticId,
          questionId: { in: questionIds },
          origin: 'IA_TRANSCRIPT',
          confirmedAt: null,
        },
        data: { confirmedAt: new Date(), confirmedById: user.id },
      });
      count = r.count;
      if (count === 0) return;

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.transcript.confirmed',
          diff: { count, questionIds },
        },
      });
    });

    if (count === 0) return { ok: true, data: { count: 0 } };
    revalidateDiagnostic(diagnosticId);
    return { ok: true, data: { count } };
  } catch (e) {
    console.error('[diagnostic-transcript] confirmerReponses', e);
    return { ok: false, error: "Les réponses n'ont pas pu être confirmées." };
  }
}

const RejeterSchema = z.object({
  diagnosticId: z.string().uuid(),
  questionId: z.string().min(1),
});

/**
 * Écarte une réponse extraite : le modèle a mal lu, la question redevient
 * simplement non posée. On supprime plutôt que de marquer « rejetée » — une
 * réponse fausse gardée en base finit toujours par ressortir quelque part, et
 * la trace du geste est dans le journal.
 */
export async function rejeterReponse(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const parsed = RejeterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { diagnosticId, questionId } = parsed.data;

  const diagnostic = await findScoped(diagnosticId, user.tenantId);
  if (!diagnostic) return { ok: false, error: 'Diagnostic introuvable' };
  if (diagnostic.status === 'ARCHIVE') return { ok: false, error: 'Ce diagnostic est archivé.' };

  try {
    let count = 0;
    await prisma.$transaction(async (tx) => {
      const r = await tx.diagnosticAnswer.deleteMany({
        where: { diagnosticId, questionId, origin: 'IA_TRANSCRIPT', confirmedAt: null },
      });
      count = r.count;
      if (count === 0) return;
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnosticId,
          action: 'diagnostic.transcript.rejected',
          diff: { questionId },
        },
      });
    });

    if (count === 0) {
      return { ok: false, error: 'Cette réponse a déjà été relue — la corriger dans le chapitre.' };
    }
    revalidateDiagnostic(diagnosticId);
    return { ok: true };
  } catch (e) {
    console.error('[diagnostic-transcript] rejeterReponse', e);
    return { ok: false, error: "La réponse n'a pas pu être écartée." };
  }
}
