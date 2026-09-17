import { Prisma, prisma } from '@qualiof/db';
import { assertCompanyPriceEditable, synchronizeCompanyPriceTx } from './company-session-price';

/** Écriture unitaire réservée aux sessions déclarées. La ventilation et l'audit
 * font partie de la même transaction sérialisable que l'inscription. */
export async function createDeclaredParticipant(user: { id: string; tenantId: string }, input: {
  sessionId: string; personId: string; sponsorOrgId: string; participantType?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.trainingSession.findFirst({ where: { id: input.sessionId, tenantId: user.tenantId } });
    if (!session?.regime) throw new Error('Session déclarée introuvable. Rechargez la fiche session.');
    const existing = await tx.sessionParticipant.findUnique({ where: { sessionId_personId: { sessionId: session.id, personId: input.personId } } });
    if (existing) {
      if (existing.sponsorOrgId !== input.sponsorOrgId) throw new Error('Cette personne est déjà inscrite avec un autre commanditaire. Corrigez le commanditaire depuis sa fiche inscription.');
      return existing;
    }
    await assertCompanyPriceEditable(tx, session);
    const participant = await tx.sessionParticipant.create({ data: {
      ...input, priceHT: new Prisma.Decimal(session.regime === 'ENTREPRISE' ? 0 : Number(session.pricePerLearner)), enrollmentStatus: 'PRE_ENROLLED',
    } });
    await synchronizeCompanyPriceTx(tx, session, user.id);
    await tx.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, entity: 'SessionParticipant', entityId: participant.id,
      action: 'sessionParticipants.create', diff: { sessionId: session.id, personId: input.personId, sponsorOrgId: input.sponsorOrgId, created: 1 } } });
    return participant;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
