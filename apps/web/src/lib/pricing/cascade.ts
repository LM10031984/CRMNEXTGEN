/**
 * Cascade du tarif de session vers les inscrits.
 *
 * Écart E-2 de l'audit du 28/08 : un tarif de session qui ne descend pas
 * jusqu'aux inscrits ne sert à rien. Ce sont les `SessionParticipant.priceHT`
 * que lisent la convention, la demande de prise en charge et la facture — pas
 * `TrainingSession.pricePerLearner`. Changer le tarif de la session sans
 * propager laissait des conventions à l'ancien montant, ou à zéro.
 *
 * Règle validée par Laurent le 28/08 : le nouveau prix ne redescend QUE sur les
 * inscrits dont aucun document contractuel ne porte encore de montant. Dès
 * qu'une convention ou une facture existe, on n'y touche plus — sinon la fiche
 * et la pièce déjà produite annoncent des sommes différentes. Les inscrits
 * laissés de côté sont journalisés avec leur motif : c'est à l'admin d'arbitrer.
 *
 * ⚠ Un tarif effacé (`newPrice = null`) ne propage RIEN. Écraser les inscrits
 * avec 0 fabriquerait des conventions à zéro euro — l'inverse du but.
 */

import { prisma } from '@qualiof/db';
import { Prisma } from '@qualiof/db';
import { isCoveredByGroupConvention } from '@/lib/docs/convention-coverage';
import { partitionnerPourCascade, type MotifExclusion } from './classify-participant';

export interface PriceCascadeResult {
  /** Inscrits dont le prix a été aligné sur celui de la session. */
  updated: number;
  /** Inscrits laissés tels quels parce qu'une pièce les engage déjà. */
  skipped: { id: string; motif: MotifExclusion }[];
}

export async function applyPriceCascade(input: {
  tenantId: string;
  userId: string;
  sessionId: string;
  newPrice: number | null;
}): Promise<PriceCascadeResult> {
  const { tenantId, userId, sessionId, newPrice } = input;

  // Tarif effacé : on ne descend pas un zéro sur des inscrits.
  if (newPrice === null || !(newPrice > 0)) return { updated: 0, skipped: [] };

  const [participants, documents, factures] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where: { sessionId, session: { tenantId } },
      select: { id: true, sponsorOrgId: true },
    }),
    // Conventions de la session, toutes formes confondues : la couverture est
    // résolue par le helper partagé, jamais par un filtre écrit à la main.
    prisma.document.findMany({
      where: { tenantId, sessionId, type: 'CONVENTION' },
      select: { id: true, type: true, entityType: true, entityId: true, participantId: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId, OR: [{ sessionId }, { participant: { sessionId } }] },
      select: { participantId: true, participantIds: true },
    }),
  ]);

  if (participants.length === 0) return { updated: 0, skipped: [] };

  // Une facture peut porter un inscrit seul (`participantId`) ou un groupe
  // (`participantIds`, Json[]) — les deux comptent comme un engagement.
  const facturesParParticipant = new Set<string>();
  for (const f of factures) {
    if (f.participantId) facturesParParticipant.add(f.participantId);
    if (Array.isArray(f.participantIds)) {
      for (const x of f.participantIds) if (typeof x === 'string') facturesParParticipant.add(x);
    }
  }

  const conventionsIndividuelles = new Set(
    documents.filter((d) => d.participantId).map((d) => d.participantId as string),
  );

  const { aMettreAJour, exclus } = partitionnerPourCascade(
    participants.map((p) => ({
      id: p.id,
      aFacture: facturesParParticipant.has(p.id),
      aConvention:
        conventionsIndividuelles.has(p.id) ||
        isCoveredByGroupConvention(documents, { id: p.id, sponsorOrgId: p.sponsorOrgId }),
    })),
  );

  if (aMettreAJour.length > 0) {
    await prisma.sessionParticipant.updateMany({
      where: { id: { in: aMettreAJour }, session: { tenantId } },
      data: { priceHT: new Prisma.Decimal(newPrice) },
    });
  }

  // Journal : ce qui a bougé ET ce qui a été laissé, avec le motif. Un montant
  // qui change sans trace est indéfendable en audit.
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      entity: 'TrainingSession',
      entityId: sessionId,
      action: 'pricing.cascade',
      diff: {
        newPrice,
        updated: aMettreAJour,
        skipped: exclus,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return { updated: aMettreAJour.length, skipped: exclus };
}
