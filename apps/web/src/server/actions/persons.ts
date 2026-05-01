'use server';

/**
 * Server Actions pour la recherche d'apprenants et leurs LegalLinks.
 * Utilisées par le composant <PersonOrOrgPicker>.
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

// SOLO_FORMS exported via /lib/legal-forms.ts (sync, can be imported anywhere).
// Ce fichier 'use server' ne peut exposer QUE des fonctions async.

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

/**
 * Vue rapide d'un apprenant — utilisée par le drawer slide-in sur les listes.
 * Retourne les infos minimales pour un coup d'oeil sans naviguer.
 */
export interface LearnerQuickViewData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  professionalStatus: string | null;
  completenessPct: number;
  legalLinks: Array<{ role: string; isPrimary: boolean; orgName: string; opcoCode: string | null }>;
  totalParticipations: number;
  totalAmount: number;
  ageficeConsumedYear: number;
  recentSessions: Array<{
    id: string;
    code: string;
    name: string | null;
    startDate: Date;
    priceHT: number;
    sponsorName: string;
  }>;
}

export async function getLearnerQuickView(personId: string): Promise<LearnerQuickViewData | null> {
  const { user } = await validateRequest();
  if (!user) return null;

  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: user.tenantId, archived: false },
    include: {
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: { organization: { select: { siret: true, legalName: true, opcoCode: true } } },
      },
      sensitiveData: true,
      participations: {
        orderBy: { session: { startDate: 'desc' } },
        take: 5,
        include: {
          session: { select: { id: true, code: true, name: true, startDate: true } },
          sponsorOrg: { select: { legalName: true, opcoCode: true } },
        },
      },
    },
  });
  if (!person) return null;

  const totalParticipations = await prisma.sessionParticipant.count({ where: { personId: person.id } });
  const allParticipations = await prisma.sessionParticipant.findMany({
    where: { personId: person.id },
    select: { priceHT: true, financingRequestDate: true, session: { select: { startDate: true } }, sponsorOrg: { select: { opcoCode: true } } },
  });
  const totalAmount = allParticipations.reduce((s, p) => s + Number(p.priceHT), 0);
  const currentYear = new Date().getFullYear();
  const ageficeConsumedYear = allParticipations
    .filter((p) => {
      if (p.sponsorOrg?.opcoCode !== 'AGEFICE') return false;
      const ref = p.financingRequestDate ?? p.session.startDate;
      return new Date(ref).getFullYear() === currentYear;
    })
    .reduce((s, p) => s + Number(p.priceHT), 0);

  const { computeLearnerCompleteness } = await import('@/lib/learner-completeness');
  const completenessPct = computeLearnerCompleteness({
    firstName: person.firstName,
    lastName: person.lastName,
    birthDate: person.birthDate,
    email: person.email,
    phone: person.phone,
    personalAddress: person.personalAddress,
    professionalStatus: person.professionalStatus,
    educationLevel: person.educationLevel,
    diplomas: person.diplomas,
    legalLinks: person.legalLinks.map((l) => ({ organization: l.organization })),
    sensitiveData: person.sensitiveData
      ? { socialSecurityNb: person.sensitiveData.socialSecurityNb, idDocumentUrl: person.sensitiveData.idDocumentUrl }
      : null,
  }).percent;

  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    professionalStatus: person.professionalStatus,
    completenessPct,
    legalLinks: person.legalLinks.map((l) => ({
      role: l.role,
      isPrimary: l.isPrimary,
      orgName: l.organization.legalName,
      opcoCode: l.organization.opcoCode,
    })),
    totalParticipations,
    totalAmount,
    ageficeConsumedYear,
    recentSessions: person.participations.map((p) => ({
      id: p.session.id,
      code: p.session.code,
      name: p.session.name,
      startDate: p.session.startDate,
      priceHT: Number(p.priceHT),
      sponsorName: p.sponsorOrg.legalName,
    })),
  };
}
