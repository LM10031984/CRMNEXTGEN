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

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.sessionParticipant.update({
    where: { id: input.participantId },
    data,
  });
  revalidatePath(`/app/sessions/${part.session.id}`);
  return { ok: true };
}

/**
 * Supprime une session et toutes ses dépendances (participants, formateurs,
 * documents). Refuse si des factures émises sont rattachées (intégrité légale).
 */
export async function deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

  // Refuse si des factures émises sont rattachées à cette session
  const invoiceCount = await prisma.invoice.count({
    where: { sessionId, status: { not: 'DRAFT' } },
  });
  if (invoiceCount > 0) {
    return {
      ok: false,
      error: `Impossible de supprimer : ${invoiceCount} facture(s) émise(s) sur cette session. Avoirs requis avant suppression.`,
    };
  }

  await prisma.trainingSession.delete({ where: { id: sessionId } });
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
