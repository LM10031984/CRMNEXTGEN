import type { Prisma } from '@qualiof/db';
import { legalLinkAtSession, type SessionPeriod } from '@/lib/persons/legal-link-period';
import { refusalForSessionPayer, type SessionRegime } from './session-regime';

/** Contrôle du payeur, avant toute écriture et relu dans la transaction.
 * Null = aucune nouvelle contrainte sur les sessions historiques. */
export async function assertSessionPayersTx(
  tx: Prisma.TransactionClient,
  session: SessionPeriod & { id?: string; tenantId: string; regime?: SessionRegime | null },
  entries: readonly { personId: string; sponsorOrgId: string; legalLinkRole?: string }[],
  excludeParticipantId?: string,
): Promise<void> {
  if (!session.regime) return;
  const [persons, organizations, existing] = await Promise.all([
    tx.person.findMany({
      where: { tenantId: session.tenantId, id: { in: entries.map((p) => p.personId) } },
      include: { legalLinks: true },
    }),
    tx.organization.findMany({
      where: {
        tenantId: session.tenantId,
        archived: false,
        id: { in: entries.map((p) => p.sponsorOrgId) },
      },
    }),
    session.id
      ? tx.sessionParticipant.findMany({
          where: {
            sessionId: session.id,
            session: { tenantId: session.tenantId },
            ...(excludeParticipantId ? { id: { not: excludeParticipantId } } : {}),
          },
          select: { sponsorOrgId: true },
        })
      : Promise.resolve([]),
  ]);
  for (const entry of entries) {
    const person = persons.find((p) => p.id === entry.personId);
    const org = organizations.find((o) => o.id === entry.sponsorOrgId);
    if (!person || !org)
      throw new Error(
        'Apprenant ou organisation commanditaire introuvable dans ce compte. Corrigez la fiche inscription.',
      );
    const name = `${person.firstName} ${person.lastName} (${org.legalName})`;
    let link;
    try {
      link = legalLinkAtSession(person.legalLinks, org.id, session);
    } catch (e) {
      throw new Error(`${name} : ${(e as Error).message}`);
    }
    const refusal = refusalForSessionPayer(session.regime, {
      name,
      sponsorLegalForm: org.legalForm,
      roleChezSponsor:
        link?.role ??
        (!person.legalLinks.some((l) => l.organizationId === org.id)
          ? entry.legalLinkRole
          : undefined),
    });
    if (refusal) throw new Error(refusal);
  }
  if (
    session.regime === 'ENTREPRISE' &&
    new Set([...existing, ...entries].map((p) => p.sponsorOrgId)).size > 1
  ) {
    throw new Error(
      'Cette session ENTREPRISE a déjà un autre commanditaire. Inscrivez cette personne dans une session dédiée à son entreprise ou corrigez le commanditaire dans la fiche inscription.',
    );
  }
}
