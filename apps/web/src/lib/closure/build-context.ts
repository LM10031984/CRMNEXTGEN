/**
 * Helper partagé pour construire un ClosureContext à partir d'un participantId.
 * Utilisé par le worker BullMQ ET par les server actions de régénération
 * à la demande (ex: bouton "Régénérer la grille").
 */

import { prisma } from '@qualiof/db';
import type { ClosureContext } from './shared-template';

export async function buildClosureContextForParticipant(
  participantId: string,
  tenantId: string,
): Promise<ClosureContext | null> {
  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId } },
    include: {
      person: {
        include: {
          legalLinks: {
            where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT', 'SALARIE'] } },
            orderBy: [{ isPrimary: 'desc' }, { startDate: 'desc' }],
            include: { organization: { select: { legalName: true, brandName: true } } },
          },
        },
      },
      session: {
        include: {
          product: true,
          location: true,
          trainers: {
            include: { person: true },
            // Primary d'abord pour qu'il apparaisse en tête, puis ordre stable
            orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          },
        },
      },
    },
  });
  if (!participant) return null;

  const session = participant.session;
  const product = session.product;
  const sessionLocation = session.location
    ? `${session.location.name}${(session.location.address as { city?: string } | null)?.city ? ` — ${(session.location.address as { city?: string }).city}` : ''}`
    : null;

  const primaryLink = participant.person.legalLinks[0] ?? null;
  const entreprise = primaryLink
    ? primaryLink.organization.brandName ?? primaryLink.organization.legalName
    : null;

  return {
    apprenantPrenom: participant.person.firstName,
    apprenantNom: participant.person.lastName,
    apprenantCivility: participant.person.civility ?? null,
    sessionId: session.id,
    sessionCode: session.code,
    sessionTitle: product.title,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    sessionLocation,
    // Seul le formateur principal signe les docs Qualiopi. Si aucun n'est
    // marqué primary (vieille session sans backfill, edge case), on prend
    // le 1er par ordre stable (orderBy ci-dessus).
    sessionTrainers: (() => {
      const primary = session.trainers.find((t) => t.isPrimary) ?? session.trainers[0];
      return primary ? [`${primary.person.firstName} ${primary.person.lastName}`.trim()] : [];
    })(),
    durationHours: product.durationHours,
    tenantId,
    formationMeta: {
      programmeMd: product.programMd ?? '',
    },
    stagiaireMeta: {
      entreprise,
      fonction: primaryLink?.function ?? null,
      anciennete: participant.person.professionalExperience ?? null,
      diplomes: participant.person.diplomas ?? null,
      professionalStatus: participant.person.professionalStatus ?? null,
    },
  };
}
