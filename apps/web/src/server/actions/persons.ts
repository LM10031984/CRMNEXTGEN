'use server';

/**
 * Server Actions pour la recherche d'apprenants et leurs LegalLinks.
 * Utilisées par le composant <PersonOrOrgPicker>.
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export interface PersonSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  legalLinks: Array<{
    id: string;
    role: string;
    isPrimary: boolean;
    organization: {
      id: string;
      legalName: string;
      legalForm: string;
      siret: string | null;
      opcoCode: string | null;
    };
  }>;
}

const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

export async function searchPersons(query: string, limit = 12): Promise<PersonSearchResult[]> {
  const { user } = await validateRequest();
  if (!user) return [];

  const term = (query || '').trim();
  if (term.length < 2) {
    // Retourne les plus récents si la requête est trop courte
    return prisma.person.findMany({
      where: { tenantId: user.tenantId, archived: false },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        legalLinks: {
          orderBy: { isPrimary: 'desc' },
          include: {
            organization: {
              select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
            },
          },
        },
      },
    }) as Promise<PersonSearchResult[]>;
  }

  return prisma.person.findMany({
    where: {
      tenantId: user.tenantId,
      archived: false,
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
    include: {
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: {
          organization: {
            select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
          },
        },
      },
    },
  }) as Promise<PersonSearchResult[]>;
}

export async function getPersonWithLinks(personId: string): Promise<PersonSearchResult | null> {
  const { user } = await validateRequest();
  if (!user) return null;
  return prisma.person.findFirst({
    where: { id: personId, tenantId: user.tenantId },
    include: {
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: {
          organization: {
            select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
          },
        },
      },
    },
  }) as Promise<PersonSearchResult | null>;
}

export function isSoloForm(legalForm: string): boolean {
  return SOLO_FORMS.includes(legalForm);
}
