/**
 * Helper partagé pour construire un ClosureContext à partir d'un participantId.
 * Utilisé par le worker BullMQ ET par les server actions de régénération
 * à la demande (ex: bouton "Régénérer la grille").
 */

import { prisma } from '@qualiof/db';
import { loadOfConfig } from '@/lib/of-config';
import {
  fallbackLieuOf,
  formatLieuFormation,
  villeLieuFormation,
} from '@/lib/locations/format-lieu';
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
  // Lieu — composition déléguée à `formatLieuFormation`, la SOURCE UNIQUE déjà
  // utilisée par la convention : « {raison sociale} — {nom}, {rue}, {CP} {ville} ».
  //
  // Refus AGEFICE 2026-08-28 (« Feuille(s) d'émargement incomplet : raison
  // sociale du lieu de formation ») : ce module composait auparavant sa propre
  // version « {rue}, {CP} {ville} », qui laissait tomber la raison sociale.
  // Le worker en avait une TROISIÈME (« {nom} — {ville} »). Les deux passent
  // désormais par le helper commun.
  const of = await loadOfConfig(tenantId);
  const fallbackLieu = fallbackLieuOf(of);
  const sessionLocation = formatLieuFormation(session.location, fallbackLieu);
  const sessionLocationCity = villeLieuFormation(session.location, of.addressVille);

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
    sessionLocationCity,
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
