'use server';

/**
 * Server Actions pour la gestion des LegalLinks (cas EI / multi-casquettes).
 */

import { prisma, LinkRole } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';

export async function searchOrganizations(query: string, limit = 10) {
  const { user } = await validateRequest();
  if (!user) return [];
  const term = (query || '').trim();
  if (term.length < 2) {
    return prisma.organization.findMany({
      where: { tenantId: user.tenantId, archived: false },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
    });
  }
  return prisma.organization.findMany({
    where: {
      tenantId: user.tenantId,
      archived: false,
      OR: [
        { legalName: { contains: term, mode: 'insensitive' } },
        { siret: { contains: term } },
      ],
    },
    orderBy: { legalName: 'asc' },
    take: limit,
    select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
  });
}

export async function createLegalLink(input: {
  personId: string;
  organizationId: string;
  role: keyof typeof LinkRole;
  isPrimary?: boolean;
  function?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  // Vérifie que la personne et l'org appartiennent au tenant
  const [person, org] = await Promise.all([
    prisma.person.findFirst({ where: { id: input.personId, tenantId: user.tenantId } }),
    prisma.organization.findFirst({ where: { id: input.organizationId, tenantId: user.tenantId } }),
  ]);
  if (!person || !org) return { ok: false, error: 'Personne ou organisation introuvable.' };

  try {
    const link = await prisma.legalLink.upsert({
      where: {
        personId_organizationId_role: {
          personId: input.personId,
          organizationId: input.organizationId,
          role: input.role as LinkRole,
        },
      },
      create: {
        personId: input.personId,
        organizationId: input.organizationId,
        role: input.role as LinkRole,
        isPrimary: input.isPrimary ?? false,
        function: input.function,
      },
      update: {
        isPrimary: input.isPrimary ?? false,
        function: input.function,
      },
    });

    // Si on marque ce lien comme principal, démarque les autres pour cette person
    if (input.isPrimary) {
      await prisma.legalLink.updateMany({
        where: { personId: input.personId, id: { not: link.id }, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    revalidatePath(`/app/apprenants/${input.personId}`);
    revalidatePath(`/app/organisations/${input.organizationId}`);
    return { ok: true, id: link.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteLegalLink(linkId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const link = await prisma.legalLink.findUnique({
    where: { id: linkId },
    include: { person: { select: { tenantId: true } } },
  });
  if (!link || link.person.tenantId !== user.tenantId) {
    return { ok: false, error: 'Lien introuvable.' };
  }

  await prisma.legalLink.delete({ where: { id: linkId } });
  revalidatePath(`/app/apprenants/${link.personId}`);
  return { ok: true };
}

export async function setPrimaryLegalLink(linkId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const link = await prisma.legalLink.findUnique({
    where: { id: linkId },
    include: { person: { select: { tenantId: true } } },
  });
  if (!link || link.person.tenantId !== user.tenantId) {
    return { ok: false, error: 'Lien introuvable.' };
  }

  await prisma.$transaction([
    prisma.legalLink.updateMany({
      where: { personId: link.personId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.legalLink.update({ where: { id: linkId }, data: { isPrimary: true } }),
  ]);
  revalidatePath(`/app/apprenants/${link.personId}`);
  return { ok: true };
}
