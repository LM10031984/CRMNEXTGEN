'use server';

/**
 * Server Actions pour les sessions et inscriptions.
 */

import { Prisma, prisma, SessionStatus, Modality, EnrollmentStatus, LinkRole } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  sessionCode,
  UpdateSessionDetailsInputSchema,
  type UpdateSessionDetailsInput,
} from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { normalizeNullableText } from '@/lib/sessions/normalize-nullable-text';
import { generateClosurePack } from './closure-pack';
import { generateConventionForParticipant } from './convention-generator';

// Zod schema pour unenrollParticipant — UUID strict pour participantId
const UnenrollInputSchema = z.object({
  participantId: z.string().uuid('participantId doit être un UUID valide'),
});

// ---------- Inscription d'un participant à une session ----------

export async function addParticipant(input: {
  sessionId: string;
  personId: string;
  sponsorOrgId: string;
  priceHT?: number;
  /**
   * Rôle explicite si on doit créer un LegalLink manquant.
   * Si non fourni ET aucun LegalLink existant entre cet apprenant et cette org,
   * l'inscription est REFUSÉE (au lieu de créer un SALARIE silencieux qui pourrissait
   * les données — recommandation audit).
   */
  legalLinkRole?: LinkRole;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; needsLegalLinkRole?: boolean }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // Vérifie que la session, la personne et l'org appartiennent au tenant
  const [session, person, sponsor] = await Promise.all([
    prisma.trainingSession.findFirst({ where: { id: input.sessionId, tenantId: user.tenantId } }),
    prisma.person.findFirst({ where: { id: input.personId, tenantId: user.tenantId } }),
    prisma.organization.findFirst({ where: { id: input.sponsorOrgId, tenantId: user.tenantId } }),
  ]);
  if (!session || !person || !sponsor) {
    return { ok: false, error: 'Session, apprenant ou organisation introuvable.' };
  }

  // Le LegalLink Person→Org doit exister avant l'inscription. Sinon refus
  // explicite (au lieu d'un SALARIE par défaut qui était faux dans 95% des cas immo).
  const link = await prisma.legalLink.findFirst({
    where: { personId: input.personId, organizationId: input.sponsorOrgId },
  });
  if (!link) {
    if (!input.legalLinkRole) {
      return {
        ok: false,
        error: `Aucun lien juridique entre cet apprenant et l'organisation "${sponsor.legalName}". Précise le rôle (EI_SELF, AGENT_COMMERCIAL, SALARIE, DIRIGEANT…) avant l'inscription.`,
        needsLegalLinkRole: true,
      };
    }
    await prisma.legalLink.create({
      data: {
        personId: input.personId,
        organizationId: input.sponsorOrgId,
        role: input.legalLinkRole,
      },
    });
  }

  try {
    const part = await prisma.sessionParticipant.upsert({
      where: { sessionId_personId: { sessionId: input.sessionId, personId: input.personId } },
      create: {
        sessionId: input.sessionId,
        personId: input.personId,
        sponsorOrgId: input.sponsorOrgId,
        priceHT: new Prisma.Decimal(input.priceHT ?? 0),
        enrollmentStatus: EnrollmentStatus.PRE_ENROLLED,
      },
      update: {
        sponsorOrgId: input.sponsorOrgId,
      },
    });

    // Auto-génération en parallèle des docs pré-formation pour CE participant.
    // Tous fire-and-forget pour ne pas bloquer l'inscription si une génération
    // échoue. Idempotent : skip si déjà existant.
    // 1) Convention (Code du Travail L6353-1) — template pur ~1s
    // 2) Convocation
    // 3) Demande AGEFICE — uniquement si TNS éligible (sponsor AGEFICE OU
    //    LegalLink EI_SELF/AGENT_COMMERCIAL sur une org rattachée AGEFICE).
    //    Bug remonté Laurent 2026-06-04 : "AGEFICE doit se créer automatiquement
    //    sans que je clique sur un bouton".
    const [existingConvention, existingConvocation, existingAgefice] = await Promise.all([
      prisma.document.findFirst({
        where: { tenantId: user.tenantId, type: 'CONVENTION', participantId: part.id },
        select: { id: true },
      }),
      prisma.document.findFirst({
        where: { tenantId: user.tenantId, type: 'CONVOCATION', participantId: part.id },
        select: { id: true },
      }),
      prisma.document.findFirst({
        where: { tenantId: user.tenantId, type: 'AGEFICE', participantId: part.id },
        select: { id: true },
      }),
    ]);

    if (!existingConvention) {
      generateConventionForParticipant(part.id).catch((e) => {
        console.warn(`[addParticipant] auto-gen convention failed for ${part.id}:`, e?.message ?? e);
      });
    }
    if (!existingConvocation) {
      const { generateConvocationForParticipant } = await import('./convocation-generator');
      generateConvocationForParticipant(part.id).catch((e) => {
        console.warn(`[addParticipant] auto-gen convocation failed for ${part.id}:`, e?.message ?? e);
      });
    }
    // Eligibilité AGEFICE : sponsor AGEFICE OU EI/AGENT_COMMERCIAL sur org AGEFICE
    const isAgeficeEligible =
      sponsor.opcoCode === 'AGEFICE' ||
      (await prisma.legalLink.findFirst({
        where: {
          personId: input.personId,
          OR: [
            { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] }, organization: { opcoCode: 'AGEFICE' } },
            { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] }, organization: { ageficeProfile: { isNot: null } } },
          ],
        },
        select: { id: true },
      })) !== null;

    if (isAgeficeEligible && !existingAgefice) {
      const { generateAgeficeForParticipant } = await import('./agefice-generator');
      generateAgeficeForParticipant(part.id).catch((e) => {
        console.warn(`[addParticipant] auto-gen AGEFICE failed for ${part.id}:`, e?.message ?? e);
      });
    }

    revalidatePath(`/app/sessions/${input.sessionId}`);
    return { ok: true, id: part.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Désinscrit un participant d'une session — Quick task 260523-eyi.
 *
 * Différences vs ancienne `removeParticipant` :
 *  - RBAC durci ADMIN+MANAGER (COMMERCIAL retiré — action destructive)
 *  - Zod validation UUID en amont (participantId)
 *  - Tenant scoping via session.tenantId
 *  - Transaction Prisma delete + AuditLog atomique (action='sessionParticipants.delete')
 *  - Discriminated return: { ok: true } | { ok: false; error: string }
 *
 * Convention AuditLog `[entity].[verb]` : `sessionParticipants.delete`
 * (cohérence avec `parameters.update`, `documents.*`, `invoices.*`).
 */
export async function unenrollParticipant(
  participantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) Validation Zod en premier (avant tout I/O)
  const parsed = UnenrollInputSchema.safeParse({ participantId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' };
  }
  const { participantId: validatedId } = parsed.data;

  // 2) RBAC durci ADMIN+MANAGER
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // 3) Récupération + tenant scoping
  const part = await prisma.sessionParticipant.findUnique({
    where: { id: validatedId },
    include: {
      session: { select: { tenantId: true, id: true } },
      person: { select: { firstName: true, lastName: true } },
    },
  });
  if (!part || part.session.tenantId !== user.tenantId) {
    return { ok: false, error: 'Inscription introuvable.' };
  }

  // 4) Transaction atomique : delete + auditLog
  await prisma.$transaction([
    prisma.sessionParticipant.delete({ where: { id: validatedId } }),
    prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'SessionParticipant',
        entityId: validatedId,
        action: 'sessionParticipants.delete',
        diff: {
          sessionId: part.session.id,
          personId: part.personId,
          personName: `${part.person.firstName} ${part.person.lastName}`,
          sponsorOrgId: part.sponsorOrgId,
          priceHT: Number(part.priceHT),
          enrollmentStatus: part.enrollmentStatus,
        },
      },
    }),
  ]);

  revalidatePath(`/app/sessions/${part.session.id}`);
  return { ok: true };
}

/**
 * Édite les champs courants d'une inscription : prix HT, statut, sponsorOrg.
 * Permet de corriger les valeurs aberrantes héritées des imports legacy
 * (ex: Marco DAS NEVES priceHT=315.43 au lieu de 315) sans passer par SQL.
 */
export async function updateParticipant(input: {
  participantId: string;
  priceHT?: number;
  enrollmentStatus?: keyof typeof EnrollmentStatus;
  sponsorOrgId?: string;
  // Date de dépôt du dossier de financement (ex: dossier AGEFICE). Détermine
  // l'année à laquelle s'applique le budget consommé. cf
  // feedback_budget_agefice_annee_dossier. ISO yyyy-mm-dd ou null pour effacer.
  financingRequestDate?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const part = await prisma.sessionParticipant.findUnique({
    where: { id: input.participantId },
    include: { session: { select: { tenantId: true, id: true } } },
  });
  if (!part || part.session.tenantId !== user.tenantId) {
    return { ok: false, error: 'Inscription introuvable.' };
  }

  const data: Prisma.SessionParticipantUpdateInput = {};
  if (input.priceHT !== undefined) {
    if (input.priceHT < 0) return { ok: false, error: 'Le prix HT ne peut pas être négatif.' };
    data.priceHT = new Prisma.Decimal(input.priceHT);
  }
  if (input.enrollmentStatus) data.enrollmentStatus = EnrollmentStatus[input.enrollmentStatus];
  if (input.sponsorOrgId) {
    const sponsor = await prisma.organization.findFirst({
      where: { id: input.sponsorOrgId, tenantId: user.tenantId },
    });
    if (!sponsor) return { ok: false, error: 'Organisation sponsor introuvable.' };
    data.sponsorOrg = { connect: { id: input.sponsorOrgId } };
  }
  if (input.financingRequestDate !== undefined) {
    if (input.financingRequestDate === null || input.financingRequestDate === '') {
      data.financingRequestDate = null;
    } else {
      const d = new Date(input.financingRequestDate);
      if (Number.isNaN(d.getTime())) return { ok: false, error: 'Date dossier invalide.' };
      data.financingRequestDate = d;
    }
  }

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.sessionParticipant.update({
    where: { id: input.participantId },
    data,
  });
  revalidatePath(`/app/sessions/${part.session.id}`);
  revalidatePath('/app/budget-agefice');
  return { ok: true };
}

/**
 * Supprime une session et toutes ses dépendances directes en cascade
 * (participants, formateurs, asset pédagogiques — déjà onDelete: Cascade
 * dans le schéma).
 *
 * Pour les relations sans cascade Prisma (Invoice.session et Document.session
 * sont en Restrict par défaut côté DB), on détache d'abord en mettant
 * sessionId = null. Les factures émises survivent ainsi à la suppression
 * de leur session — comportement légal correct (la facture reste valide
 * juridiquement même si la session est annulée/supprimée).
 *
 * Refuse uniquement si des factures NON-DRAFT sont rattachées : on
 * empêche les suppressions accidentelles d'une session déjà facturée.
 */
export async function deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true, code: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  const invoiceCount = await prisma.invoice.count({
    where: { sessionId, status: { not: 'DRAFT' } },
  });
  if (invoiceCount > 0) {
    return {
      ok: false,
      error: `Impossible de supprimer ${session.code} : ${invoiceCount} facture(s) émise(s). Annule ou crédite ces factures d'abord.`,
    };
  }

  try {
    // Détache tout ce qui n'est pas en cascade avant le DELETE final.
    // ClosureBatch n'a pas de FK formelle vers TrainingSession (sessionId est
    // juste un String non-contraint) — on les supprime explicitement.
    // SQL raw direct pour bypasser tout problème de FK Prisma côté ORM.
    await prisma.$executeRaw`UPDATE "Invoice" SET "sessionId" = NULL WHERE "sessionId" = ${sessionId}`;
    await prisma.$executeRaw`UPDATE "Document" SET "sessionId" = NULL WHERE "sessionId" = ${sessionId}`;
    // ClosureJob → ClosureBatch (cascade interne), supprime les batches qui suppriment leurs jobs
    await prisma.$executeRaw`DELETE FROM "ClosureBatch" WHERE "sessionId" = ${sessionId}`;
    // PedagogicalAsset a CASCADE via FK PostgreSQL → suppression auto
    // Le DELETE final déclenche toutes les CASCADES restantes (participants, trainers, slots, attendances)
    const result = await prisma.$executeRaw`DELETE FROM "TrainingSession" WHERE id = ${sessionId}`;
    if (result === 0) {
      return { ok: false, error: `Session ${session.code} non supprimée (déjà absente ?)` };
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error(`[deleteSession ${session.code}] failed:`, msg);
    return {
      ok: false,
      error: `Échec suppression ${session.code} : ${msg.slice(0, 300)}`,
    };
  }

  revalidatePath('/app/sessions');
  revalidatePath('/app/dossiers-opco');
  return { ok: true };
}

// ---------- Création d'une session ----------

export async function createSession(input: {
  productId: string;
  startDate: string; // ISO
  endDate: string;
  modality: keyof typeof Modality;
  capacityMin?: number;
  capacityMax?: number;
  pricePerLearner?: number;
  internalNotes?: string;
}): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const product = await prisma.trainingProduct.findFirst({
    where: { id: input.productId, tenantId: user.tenantId },
  });
  if (!product) return { ok: false, error: 'Formation introuvable.' };

  // Génère un code SES-YYYY-NNN incrémental dans l'année courante
  const year = new Date().getFullYear();
  const lastSession = await prisma.trainingSession.findFirst({
    where: { tenantId: user.tenantId, code: { startsWith: `SES-${year}-` } },
    orderBy: { code: 'desc' },
  });
  const lastSeq = lastSession?.code?.match(/SES-\d{4}-(\d+)/)?.[1];
  const nextSeq = lastSeq ? parseInt(lastSeq, 10) + 1 : 1;
  const code = sessionCode(year, nextSeq);

  const session = await prisma.trainingSession.create({
    data: {
      tenantId: user.tenantId,
      productId: input.productId,
      code,
      name: product.title,
      status: SessionStatus.DRAFT,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      modality: input.modality as Modality,
      capacityMin: input.capacityMin ?? product.capacityMin,
      capacityMax: input.capacityMax ?? product.capacityMax,
      pricePerLearner: input.pricePerLearner
        ? new Prisma.Decimal(input.pricePerLearner)
        : product.priceHT,
      internalNotes: input.internalNotes,
    },
  });

  revalidatePath('/app/sessions');
  return { ok: true, id: session.id, code };
}

/**
 * Duplique une session existante : meme produit, meme tarif, memes formateurs,
 * meme modalite/lieu. Decale les dates de duration jours par rapport a une
 * nouvelle date de debut. Cree N occurrences si recurrence (intervalle en
 * mois). Status DRAFT a chaque fois pour forcer la validation manuelle.
 * N'embarque PAS les participants.
 */
export async function duplicateSession(input: {
  sessionId: string;
  newStartDate: string;
  recurrence?: { count: number; intervalMonths: number };
}): Promise<{ ok: true; createdIds: string[]; firstCode: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const source = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    include: { trainers: { select: { personId: true, role: true } } },
  });
  if (!source) return { ok: false, error: 'Session source introuvable.' };

  const startBase = new Date(input.newStartDate);
  if (Number.isNaN(startBase.getTime())) return { ok: false, error: 'Date de debut invalide.' };

  const durationMs = new Date(source.endDate).getTime() - new Date(source.startDate).getTime();
  const occurrences = Math.max(1, input.recurrence?.count ?? 1);
  const intervalMonths = input.recurrence?.intervalMonths ?? 1;

  const year = startBase.getFullYear();
  const lastSession = await prisma.trainingSession.findFirst({
    where: { tenantId: user.tenantId, code: { startsWith: `SES-${year}-` } },
    orderBy: { code: 'desc' },
  });
  const lastSeqMatch = lastSession?.code?.match(/SES-\d{4}-(\d+)/);
  let nextSeq = lastSeqMatch && lastSeqMatch[1] ? parseInt(lastSeqMatch[1], 10) + 1 : 1;

  const createdIds: string[] = [];
  let firstCode = '';

  for (let i = 0; i < occurrences; i++) {
    const start = new Date(startBase);
    start.setMonth(start.getMonth() + i * intervalMonths);
    const end = new Date(start.getTime() + durationMs);
    const code = sessionCode(start.getFullYear(), nextSeq);
    nextSeq += 1;
    if (i === 0) firstCode = code;

    const created = await prisma.trainingSession.create({
      data: {
        tenantId: user.tenantId,
        productId: source.productId,
        code,
        name: source.name,
        status: SessionStatus.DRAFT,
        startDate: start,
        endDate: end,
        modality: source.modality,
        capacityMin: source.capacityMin,
        capacityMax: source.capacityMax,
        pricePerLearner: source.pricePerLearner,
        locationId: source.locationId,
        internalNotes: source.internalNotes,
        trainers: {
          create: source.trainers.map((t) => ({ personId: t.personId, role: t.role })),
        },
      },
    });
    createdIds.push(created.id);
  }

  revalidatePath('/app/sessions');
  return { ok: true, createdIds, firstCode };
}

// ---------- Helper : produits disponibles ----------

export async function listProducts() {
  const { user } = await validateRequest();
  if (!user) return [];
  return prisma.trainingProduct.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    orderBy: { title: 'asc' },
    select: { id: true, code: true, title: true, durationHours: true, modality: true, priceHT: true },
  });
}

// ---------- Mise à jour du statut d'une session ----------

const VALID_SESSION_STATUSES: SessionStatus[] = [
  'DRAFT',
  'PLANNED',
  'OPEN',
  'VALIDATED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

/**
 * Met à jour les dates startDate / endDate d'une session.
 * Validations : dates valides, endDate >= startDate.
 */
export async function updateSessionDates(input: {
  sessionId: string;
  startDate: string;
  endDate: string;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: 'Dates invalides' };
  }
  if (end < start) {
    return { ok: false, error: 'La date de fin ne peut pas être antérieure à la date de début' };
  }
  const result = await prisma.trainingSession.updateMany({
    where: { id: input.sessionId, tenantId: user.tenantId },
    data: { startDate: start, endDate: end },
  });
  if (result.count === 0) {
    return { ok: false, error: 'Session introuvable' };
  }
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}

export async function updateSessionStatus(input: {
  sessionId: string;
  newStatus: SessionStatus;
}): Promise<{ ok: boolean; error?: string; autoPackTriggered?: boolean }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
  if (!VALID_SESSION_STATUSES.includes(input.newStatus)) {
    return { ok: false, error: 'Statut invalide.' };
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true, status: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  // Verrou : une fois COMPLETED, on n'autorise que IN_PROGRESS (rectification)
  // ou CANCELLED → COMPLETED reste interdit pour préserver l'historique propre
  // (le pack closure a déjà été généré).
  if (session.status === 'COMPLETED' && input.newStatus !== 'IN_PROGRESS') {
    return {
      ok: false,
      error: 'Une session terminée ne peut être ré-ouverte que vers "En cours" (rectification).',
    };
  }

  await prisma.trainingSession.update({
    where: { id: input.sessionId },
    data: { status: input.newStatus },
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  revalidatePath('/app/sessions');

  // Auto-déclenchement du pack fin de formation lors d'une transition vers
  // COMPLETED — élimine le clic manuel "Générer le pack". Garde-fous :
  //   - Skip si un batch RUNNING/PENDING existe déjà (évite les doublons en cas
  //     de toggle rapide IN_PROGRESS ↔ COMPLETED par l'utilisateur).
  //   - Fire-and-forget (`void`) : la pré-génération du déroulé/grille obs
  //     session peut prendre 5-10 min via Ollama. Ne pas bloquer la réponse
  //     du toggle de statut.
  //   - Erreurs swallowed : un échec d'enqueue ne doit pas casser le change
  //     de statut. L'utilisateur pourra retrigger manuellement depuis la
  //     fiche session.
  let autoPackTriggered = false;
  if (input.newStatus === 'COMPLETED' && session.status !== 'COMPLETED') {
    const inFlight = await prisma.closureBatch.count({
      where: {
        tenantId: user.tenantId,
        sessionId: input.sessionId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
    });
    if (inFlight === 0) {
      autoPackTriggered = true;
      void generateClosurePack(input.sessionId).catch((e) => {
        console.error('[auto-pack] échec déclenchement pour', input.sessionId, ':', (e as Error).message);
      });
    }
  }

  return { ok: true, autoPackTriggered };
}

// ---------- Mise à jour des paramètres logistique session (C4.i17) ----------

export async function updateSessionLogistics(input: {
  sessionId: string;
  needsTrainerLodging?: boolean;
  trainerLodgingPlace?: string | null;
  trainerLodgingDates?: string | null;
  hasDisabledLearner?: boolean;
  disabilityAdaptations?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  // Normalisation "champ vidé" via helper unique partagé avec
  // updateSessionDetails (commit ui-e2). Pattern '?.trim() || null'
  // remplacé pour garder un seul chemin de normalisation.
  await prisma.trainingSession.update({
    where: { id: input.sessionId },
    data: {
      ...(input.needsTrainerLodging !== undefined ? { needsTrainerLodging: input.needsTrainerLodging } : {}),
      ...(input.trainerLodgingPlace !== undefined
        ? { trainerLodgingPlace: normalizeNullableText(input.trainerLodgingPlace) }
        : {}),
      ...(input.trainerLodgingDates !== undefined
        ? { trainerLodgingDates: normalizeNullableText(input.trainerLodgingDates) }
        : {}),
      ...(input.hasDisabledLearner !== undefined ? { hasDisabledLearner: input.hasDisabledLearner } : {}),
      ...(input.disabilityAdaptations !== undefined
        ? { disabilityAdaptations: normalizeNullableText(input.disabilityAdaptations) }
        : {}),
    },
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}

// ---------- Action helper pour redirect après création ----------

export async function createSessionAndRedirect(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '');
  const startDate = String(formData.get('startDate') ?? '');
  const endDate = String(formData.get('endDate') ?? '');
  const modality = String(formData.get('modality') ?? 'PRESENTIEL') as keyof typeof Modality;
  const pricePerLearner = formData.get('pricePerLearner')
    ? Number(formData.get('pricePerLearner'))
    : undefined;
  const internalNotes = String(formData.get('internalNotes') ?? '') || undefined;

  const res = await createSession({
    productId,
    startDate,
    endDate,
    modality,
    pricePerLearner,
    internalNotes,
  });
  if (!res.ok) throw new Error(res.error);
  redirect(`/app/sessions/${res.id}`);
}

// ─── BUG-19 — Édition inline du lieu de formation ────────────────────────
export async function updateSessionLocation(input: {
  sessionId: string;
  locationId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  // Si locationId fourni, vérifier qu'il existe et appartient au tenant
  if (input.locationId) {
    const location = await prisma.location.findFirst({
      where: { id: input.locationId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!location) return { ok: false, error: 'Lieu introuvable ou non autorisé.' };
  }

  await prisma.trainingSession.update({
    where: { id: input.sessionId },
    data: { locationId: input.locationId },
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}

/**
 * Crée une Location à la volée et l'attache à la session (find-or-create
 * insensitive sur le nom pour éviter les doublons).
 */
export async function createLocationAndAttachToSession(input: {
  sessionId: string;
  name: string;
  legalName?: string | null;
  city?: string | null;
  street?: string | null;
  postalCode?: string | null;
}): Promise<{ ok: boolean; error?: string; locationId?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Le nom du lieu est obligatoire.' };

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  let locationId: string;
  const existing = await prisma.location.findFirst({
    where: {
      tenantId: user.tenantId,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (existing) {
    locationId = existing.id;
  } else {
    const address: Record<string, string> = {};
    if (input.street?.trim()) address.street = input.street.trim();
    if (input.postalCode?.trim()) address.postalCode = input.postalCode.trim();
    if (input.city?.trim()) address.city = input.city.trim();
    const loc = await prisma.location.create({
      data: {
        tenantId: user.tenantId,
        name,
        legalName: input.legalName?.trim() || null,
        address: Object.keys(address).length > 0 ? address : Prisma.JsonNull,
      },
      select: { id: true },
    });
    locationId = loc.id;
  }

  await prisma.trainingSession.update({
    where: { id: input.sessionId },
    data: { locationId },
  });
  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true, locationId };
}

// ─── BUG-19 — Ajouter / retirer un formateur de la session ───────────────
export async function addSessionTrainer(input: {
  sessionId: string;
  personId: string;
  role?: string;
  isPrimary?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  const person = await prisma.person.findFirst({
    where: { id: input.personId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!person) return { ok: false, error: 'Personne introuvable.' };

  // Si on demande isPrimary=true, démarquer tous les autres trainers de la session
  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.sessionTrainer.updateMany({
        where: { sessionId: input.sessionId },
        data: { isPrimary: false },
      });
    }
    await tx.sessionTrainer.upsert({
      where: {
        sessionId_personId: {
          sessionId: input.sessionId,
          personId: input.personId,
        },
      },
      update: {
        role: input.role ?? undefined,
        isPrimary: input.isPrimary ?? undefined,
      },
      create: {
        sessionId: input.sessionId,
        personId: input.personId,
        role: input.role ?? 'Formateur',
        isPrimary: input.isPrimary ?? false,
      },
    });
  });

  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}

export async function removeSessionTrainer(input: {
  sessionId: string;
  personId: string;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  await prisma.sessionTrainer.delete({
    where: {
      sessionId_personId: {
        sessionId: input.sessionId,
        personId: input.personId,
      },
    },
  }).catch(() => null); // ignore if not found

  revalidatePath(`/app/sessions/${input.sessionId}`);
  return { ok: true };
}

// Helpers de listing pour les pickers UI (BUG-19).
export async function listLocations() {
  const { user } = await validateRequest();
  if (!user) return [];
  return prisma.location.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, address: true },
  });
}

export async function searchTrainerCandidates(query: string) {
  const { user } = await validateRequest();
  if (!user) return [];
  const q = query.trim();
  if (q.length === 0) {
    // Liste tous les formateurs identifiés du tenant :
    //   - déjà rattachés à une session via SessionTrainer
    //   - OU avec un LegalLink role=FORMATEUR (identifié sans avoir encore animé)
    //   - OU avec professionalStatus contenant "formateur"
    const recent = await prisma.person.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { trainerSessions: { some: {} } },
          { legalLinks: { some: { role: 'FORMATEUR' } } },
          { professionalStatus: { contains: 'formateur', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 50,
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return recent;
  }
  return prisma.person.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 20,
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

/**
 * Édite les champs scalaires d'une session depuis la modale "Modifier la session"
 * (Quick task 260523-oze). 9 champs gérés : name, startDate, endDate, capacityMin,
 * capacityMax, modality, pricePerLearner, language, internalNotes.
 *
 * Hors-scope (couverts par d'autres éditeurs inline déjà existants) :
 *  - status → SessionStatusSelect / updateSessionStatus
 *  - location → SessionLocationPicker / updateSessionLocation
 *  - trainers → SessionTrainerPicker / addSessionTrainer / removeSessionTrainer
 *  - logistique formateur → SessionLogisticsEditor / updateSessionLogistics
 *  - slots → sous-modèle multi-lignes, backlog séparé
 *
 * Pattern strict cloné de `unenrollParticipant` (quick task 260523-eyi) :
 *  - Zod validation en premier (refuse avant tout I/O)
 *  - RBAC ADMIN+MANAGER (édition de champs structurants : prix, dates, capacité)
 *  - Tenant scoping via findFirst({ id, tenantId })
 *  - Transaction Prisma `update + auditLog.create` atomique
 *  - Convention AuditLog `sessions.update` (entity=[entity].[verb])
 *  - Discriminated return `{ ok: true } | { ok: false; error: string }`
 *
 * Préservation horaire (décision plan 260523-oze) : `<input type="date">` envoie
 * 'YYYY-MM-DD'. Si la session existante a startDate=2026-05-15T09:30:00Z, et que
 * l'utilisateur change la date pour 2026-06-01, on reconstruit le DateTime en
 * combinant la nouvelle date avec l'heure d'origine (09:30 UTC). Évite que toute
 * édition de "juste le nom" remette les dates à T00:00:00.
 *
 * Diff AuditLog : ne capture que les champs effectivement modifiés (no-op si
 * rien ne change → return ok:true sans toucher BDD ni écrire d'AuditLog vide).
 */
export async function updateSessionDetails(
  input: UpdateSessionDetailsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) Validation Zod en premier (avant tout I/O)
  const parsed = UpdateSessionDetailsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Entrée invalide.',
    };
  }
  const data = parsed.data;

  // 2) RBAC ADMIN+MANAGER (édition de champs structurants)
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // 3) Récupération + tenant scoping
  const session = await prisma.trainingSession.findFirst({
    where: { id: data.sessionId, tenantId: user.tenantId },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  // 4) Construction du payload update + diff (only changed fields)
  const updateData: Prisma.TrainingSessionUpdateInput = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  // Helper : reconstruit un DateTime en préservant l'horaire de la session
  // d'origine. Évite que changer "juste le nom" décale les dates à T00:00:00Z.
  const mergeDateKeepTime = (newDateStr: string, oldDate: Date): Date => {
    const parts = newDateStr.split('-').map((s) => parseInt(s, 10));
    const y = parts[0]!;
    const m = parts[1]!;
    const d = parts[2]!;
    const merged = new Date(oldDate);
    merged.setUTCFullYear(y, m - 1, d);
    return merged;
  };

  // Normalisation "champ vidé" — SOURCE UNIQUE importée depuis
  // `lib/sessions/normalize-nullable-text.ts`. Consommée par CHAQUE chemin
  // d'écriture (modale, inline, futur SettingsDrawer).

  // name (nullable)
  if (data.name !== undefined) {
    const newName = normalizeNullableText(data.name);
    if (newName !== session.name) {
      updateData.name = newName;
      before.name = session.name;
      after.name = newName;
    }
  }

  // startDate / endDate avec préservation horaire
  if (data.startDate !== undefined) {
    const newStart = mergeDateKeepTime(data.startDate, session.startDate);
    if (newStart.getTime() !== session.startDate.getTime()) {
      updateData.startDate = newStart;
      before.startDate = session.startDate.toISOString();
      after.startDate = newStart.toISOString();
    }
  }
  if (data.endDate !== undefined) {
    const newEnd = mergeDateKeepTime(data.endDate, session.endDate);
    if (newEnd.getTime() !== session.endDate.getTime()) {
      updateData.endDate = newEnd;
      before.endDate = session.endDate.toISOString();
      after.endDate = newEnd.toISOString();
    }
  }

  // Cross-field validation après merge : refine Zod opère sur les strings du
  // payload, mais ici on doit aussi vérifier vs l'autre date qui n'est PAS
  // dans le payload (ex: user change uniquement endDate, on doit s'assurer
  // que la nouvelle endDate ≥ session.startDate stockée).
  const finalStart = (updateData.startDate as Date | undefined) ?? session.startDate;
  const finalEnd = (updateData.endDate as Date | undefined) ?? session.endDate;
  if (finalEnd < finalStart) {
    return { ok: false, error: 'Date de fin doit être ≥ date de début.' };
  }

  // capacités avec cross-field final
  if (data.capacityMin !== undefined && data.capacityMin !== session.capacityMin) {
    updateData.capacityMin = data.capacityMin;
    before.capacityMin = session.capacityMin;
    after.capacityMin = data.capacityMin;
  }
  if (data.capacityMax !== undefined && data.capacityMax !== session.capacityMax) {
    updateData.capacityMax = data.capacityMax;
    before.capacityMax = session.capacityMax;
    after.capacityMax = data.capacityMax;
  }
  const finalMin = (updateData.capacityMin as number | undefined) ?? session.capacityMin;
  const finalMax = (updateData.capacityMax as number | undefined) ?? session.capacityMax;
  if (finalMax < finalMin) {
    return { ok: false, error: 'Capacité max doit être ≥ capacité min.' };
  }

  // modality
  if (data.modality !== undefined && data.modality !== session.modality) {
    updateData.modality = data.modality as Modality;
    before.modality = session.modality;
    after.modality = data.modality;
  }

  // pricePerLearner (nullable Decimal). Comparaison via Number() pour éviter
  // les égalités Decimal vs number qui sont toujours différentes.
  if (data.pricePerLearner !== undefined) {
    const newPrice =
      data.pricePerLearner === null ? null : new Prisma.Decimal(data.pricePerLearner);
    const oldNum = session.pricePerLearner === null ? null : Number(session.pricePerLearner);
    const newNum = data.pricePerLearner;
    if (oldNum !== newNum) {
      updateData.pricePerLearner = newPrice;
      before.pricePerLearner = oldNum;
      after.pricePerLearner = newNum;
    }
  }

  // language
  if (data.language !== undefined && data.language !== session.language) {
    updateData.language = data.language;
    before.language = session.language;
    after.language = data.language;
  }

  // internalNotes (nullable) — normalisation via normalizeNullableText.
  if (data.internalNotes !== undefined) {
    const newNotes = normalizeNullableText(data.internalNotes);
    if (newNotes !== session.internalNotes) {
      updateData.internalNotes = newNotes;
      before.internalNotes = session.internalNotes;
      after.internalNotes = newNotes;
    }
  }

  // No-op si rien n'a changé (évite AuditLog vide + write inutile)
  if (Object.keys(updateData).length === 0) return { ok: true };

  // 5) Transaction atomique : update + AuditLog
  await prisma.$transaction([
    prisma.trainingSession.update({
      where: { id: data.sessionId },
      data: updateData,
    }),
    prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: data.sessionId,
        action: 'sessions.update',
        diff: { before, after } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath(`/app/sessions/${data.sessionId}`);
  return { ok: true };
}
