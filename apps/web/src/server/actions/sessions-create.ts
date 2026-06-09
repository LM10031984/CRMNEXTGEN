'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { prepareSession } from './prepare-training';

export interface CreateSessionInput {
  productId: string;
  startDate: string; // ISO
  endDate: string;
  modality: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';
  locationName?: string | null; // texte libre, on créera/réutilisera la Location
  locationCity?: string | null;
  trainerPersonIds: string[]; // au moins 1
  capacityMax?: number;
  pricePerLearner?: number | null;
  internalNotes?: string | null;
  participants: Array<{
    personId: string;
    sponsorOrgId: string;
    financingMode?: 'OPCO' | 'CPF' | 'ENTREPRISE' | 'AUTOFINANCEMENT' | 'POLE_EMPLOI' | 'AUTRE' | null;
  }>;
}

async function nextSessionCode(tenantId: string): Promise<string> {
  // Cherche le dernier code "SES-XXXX" pour ce tenant
  const last = await prisma.trainingSession.findFirst({
    where: { tenantId, code: { startsWith: 'SES-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const lastNum = last ? parseInt(last.code.replace('SES-', ''), 10) || 0 : 0;
  const next = lastNum + 1;
  return `SES-${String(next).padStart(4, '0')}`;
}

export async function searchProducts(query: string, limit = 20) {
  const { user } = await validateRequest();
  if (!user) return [];
  const term = query.trim();
  const rows = await prisma.trainingProduct.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true,
      ...(term && {
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } },
          { theme: { contains: term, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { title: 'asc' },
    take: limit,
    select: {
      id: true,
      code: true,
      title: true,
      durationHours: true,
      modality: true,
      priceHT: true,
      groupFlatPrice: true,
      theme: true,
      capacityMax: true,
    },
  });
  return rows.map((p) => ({
    ...p,
    priceHT: Number(p.priceHT),
    groupFlatPrice: p.groupFlatPrice == null ? null : Number(p.groupFlatPrice),
  }));
}

export async function listTrainers(): Promise<
  Array<{ id: string; firstName: string; lastName: string; email: string | null }>
> {
  const { user } = await validateRequest();
  if (!user) return [];

  // Aligne la définition "qui est un formateur" avec celle de la page
  // /app/formateurs : LegalLink role=FORMATEUR OU ExternalIdentity
  // entityType=Person.Trainer (créé à l'import des formateurs SmartOF)
  // OU déjà animé au moins une session.
  const externalIds = await prisma.externalIdentity.findMany({
    where: { tenantId: user.tenantId, entityType: 'Person.Trainer' },
    select: { entityId: true },
  });
  const trainerIdsFromExternal = externalIds.map((e) => e.entityId);

  return prisma.person.findMany({
    where: {
      tenantId: user.tenantId,
      archived: false,
      OR: [
        { legalLinks: { some: { role: 'FORMATEUR' } } },
        { trainerSessions: { some: {} } },
        { id: { in: trainerIdsFromExternal } },
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, email: true },
    take: 50,
  });
}

export async function createSessionFull(input: CreateSessionInput): Promise<{
  ok: boolean;
  sessionId?: string;
  error?: string;
}> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // Validations
  if (!input.productId) return { ok: false, error: 'Produit obligatoire' };
  if (!input.startDate || !input.endDate) return { ok: false, error: 'Dates obligatoires' };
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { ok: false, error: 'Dates invalides' };
  if (end < start) return { ok: false, error: 'La date de fin doit être après la date de début' };
  if (input.trainerPersonIds.length === 0) return { ok: false, error: 'Au moins un formateur est requis' };

  const product = await prisma.trainingProduct.findFirst({
    where: { id: input.productId, tenantId: user.tenantId },
    select: { id: true, title: true, priceHT: true, capacityMax: true },
  });
  if (!product) return { ok: false, error: 'Produit introuvable' };

  // Location optionnelle
  let locationId: string | null = null;
  if (input.locationName && input.locationName.trim()) {
    const existingLoc = await prisma.location.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: input.locationName.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingLoc) {
      locationId = existingLoc.id;
    } else {
      const loc = await prisma.location.create({
        data: {
          tenantId: user.tenantId,
          name: input.locationName.trim(),
          address: input.locationCity
            ? { city: input.locationCity.trim(), country: 'France' }
            : Prisma.JsonNull,
        },
      });
      locationId = loc.id;
    }
  }

  const code = await nextSessionCode(user.tenantId);
  const sessionName = `${product.title} - ${start.toLocaleDateString('fr-FR')}`;
  const pricePerLearner = input.pricePerLearner ?? Number(product.priceHT);

  // Création atomique
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.trainingSession.create({
      data: {
        tenantId: user.tenantId,
        productId: product.id,
        code,
        name: sessionName,
        status: 'DRAFT',
        startDate: start,
        endDate: end,
        modality: input.modality,
        locationId,
        capacityMax: input.capacityMax ?? product.capacityMax,
        pricePerLearner: new Prisma.Decimal(pricePerLearner),
        internalNotes: input.internalNotes ?? null,
      },
    });

    // Trainers
    for (const trainerPersonId of input.trainerPersonIds) {
      await tx.sessionTrainer.create({
        data: {
          sessionId: created.id,
          personId: trainerPersonId,
          role: input.trainerPersonIds[0] === trainerPersonId ? 'LEAD' : 'CO',
        },
      });
    }

    // Participants (chacun = 1 SessionParticipant avec sponsorOrgId)
    const createdParticipantIds: string[] = [];
    for (const p of input.participants) {
      const part = await tx.sessionParticipant.create({
        data: {
          sessionId: created.id,
          personId: p.personId,
          sponsorOrgId: p.sponsorOrgId,
          priceHT: new Prisma.Decimal(pricePerLearner),
          enrollmentStatus: 'PRE_ENROLLED',
          financingMode: p.financingMode ?? null,
        },
      });
      createdParticipantIds.push(part.id);
    }

    return { created, createdParticipantIds };
  });

  // Auto-trigger préparation pédagogique complète (programme + déroulé +
  // checklist + convention/convocation/analyse besoin par participant).
  // Fire-and-forget : la création de session reste rapide côté UX, la
  // préparation tourne en arrière-plan (analyse besoin = jobs BullMQ).
  // Idempotente : les generators sont find-or-create. prepareSession inclut
  // generateConventionForParticipant (surensemble de l'ancien hook HEAD).
  void prepareSession(session.created.id).catch((e) =>
    console.warn(`[createSessionFull] prepareSession failed for ${session.created.id}:`, e?.message ?? e),
  );

  revalidatePath('/app/sessions');
  revalidatePath('/app/dossiers-opco');
  return { ok: true, sessionId: session.created.id };
}

const SESSION_STATUSES = ['DRAFT', 'PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
  if (!SESSION_STATUSES.includes(status)) return { ok: false, error: 'invalid_status' };
  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: { tenantId: true },
  });
  if (!session || session.tenantId !== user.tenantId) return { ok: false, error: 'not_found' };
  await prisma.trainingSession.update({ where: { id: sessionId }, data: { status } });
  revalidatePath('/app/sessions');
  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true };
}
