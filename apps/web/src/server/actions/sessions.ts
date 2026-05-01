'use server';

/**
 * Server Actions pour les sessions et inscriptions.
 */

import { Prisma, prisma, SessionStatus, Modality, EnrollmentStatus, LinkRole } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sessionCode } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';

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
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

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
    revalidatePath(`/app/sessions/${input.sessionId}`);
    return { ok: true, id: part.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function removeParticipant(participantId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const part = await prisma.sessionParticipant.findUnique({
    where: { id: participantId },
    include: { session: { select: { tenantId: true, id: true } } },
  });
  if (!part || part.session.tenantId !== user.tenantId) {
    return { ok: false, error: 'Inscription introuvable.' };
  }
  await prisma.sessionParticipant.delete({ where: { id: participantId } });
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
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

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
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  const invoiceCount = await prisma.invoice.count({
    where: { sessionId, status: { not: 'DRAFT' } },
  });
  if (invoiceCount > 0) {
    return {
      ok: false,
      error: `Impossible de supprimer : ${invoiceCount} facture(s) émise(s) sur cette session. Avoirs requis avant suppression.`,
    };
  }

  try {
    await prisma.$transaction([
      // Détache les factures DRAFT (rare, mais possible) — elles survivent
      prisma.invoice.updateMany({
        where: { sessionId },
        data: { sessionId: null },
      }),
      // Détache les Documents non-cascade (programme/AGEFICE générés)
      prisma.document.updateMany({
        where: { sessionId },
        data: { sessionId: null },
      }),
      // Suppression effective (cascade Prisma sur participants, trainers,
      // attendances, pedagogicalAssets)
      prisma.trainingSession.delete({ where: { id: sessionId } }),
    ]);
  } catch (e: any) {
    return {
      ok: false,
      error: `Échec suppression : ${e?.message ?? e}. Vérifie qu'aucune dépendance n'empêche la suppression.`,
    };
  }

  revalidatePath('/app/sessions');
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
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

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
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

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
