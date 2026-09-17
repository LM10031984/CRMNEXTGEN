import { assertSessionPayersTx } from '@/lib/sessions/enrollment-regime-guard';
import { legalLinkAtSession } from '@/lib/persons/legal-link-period';
import { Prisma, prisma, LinkRole } from '@qualiof/db';
import { assertCompanyPriceEditable, synchronizeCompanyPriceTx } from './company-session-price';

/** Écriture unitaire réservée aux sessions déclarées. La ventilation et l'audit
 * font partie de la même transaction sérialisable que l'inscription. */
export async function createDeclaredParticipant(
  user: { id: string; tenantId: string },
  input: {
    sessionId: string;
    personId: string;
    sponsorOrgId: string;
    participantType?: string | null;
    legalLinkRole?: LinkRole;
  },
) {
  return prisma.$transaction(
    async (tx) => {
      const session = await tx.trainingSession.findFirst({
        where: { id: input.sessionId, tenantId: user.tenantId },
      });
      if (!session?.regime)
        throw new Error('Session déclarée introuvable. Rechargez la fiche session.');
      const existing = await tx.sessionParticipant.findUnique({
        where: { sessionId_personId: { sessionId: session.id, personId: input.personId } },
      });
      if (existing) {
        if (existing.sponsorOrgId !== input.sponsorOrgId)
          throw new Error(
            'Cette personne est déjà inscrite avec un autre commanditaire. Corrigez le commanditaire depuis sa fiche inscription.',
          );
        return existing;
      }
      await assertSessionPayersTx(tx, session, [input]);
      await assertCompanyPriceEditable(tx, session);
      const links = await tx.legalLink.findMany({
        where: { personId: input.personId, organizationId: input.sponsorOrgId },
      });
      if (!legalLinkAtSession(links, input.sponsorOrgId, session)) {
        if (
          links.length ||
          !input.legalLinkRole ||
          !Object.values(LinkRole).includes(input.legalLinkRole)
        ) {
          const person = await tx.person.findFirst({
            where: { id: input.personId, tenantId: user.tenantId },
            select: { firstName: true, lastName: true },
          });
          throw new Error(
            `${person ? `${person.firstName} ${person.lastName}` : 'Cet apprenant'} : aucun rattachement actif chez ce commanditaire aux dates de la session. Corrigez sa période ou ajoutez son rôle dans la fiche apprenant.`,
          );
        }
        const link = await tx.legalLink.create({
          data: {
            personId: input.personId,
            organizationId: input.sponsorOrgId,
            role: input.legalLinkRole,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'LegalLink',
            entityId: link.id,
            action: 'legalLinks.create',
            diff: {
              personId: input.personId,
              organizationId: input.sponsorOrgId,
              role: input.legalLinkRole,
              created: 1,
            },
          },
        });
      }
      const { legalLinkRole: _role, ...participantInput } = input;
      const participant = await tx.sessionParticipant.create({
        data: {
          ...participantInput,
          priceHT: new Prisma.Decimal(
            session.regime === 'ENTREPRISE' ? 0 : Number(session.pricePerLearner),
          ),
          enrollmentStatus: 'PRE_ENROLLED',
        },
      });
      await synchronizeCompanyPriceTx(tx, session, user.id);
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'SessionParticipant',
          entityId: participant.id,
          action: 'sessionParticipants.create',
          diff: {
            sessionId: session.id,
            personId: input.personId,
            sponsorOrgId: input.sponsorOrgId,
            created: 1,
          },
        },
      });
      return participant;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
