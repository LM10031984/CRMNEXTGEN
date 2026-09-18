import { STATUTS_OPCO_BLOQUANTS } from '@/lib/enrollment/verrou-financeur';
import { Prisma } from '@qualiof/db';
import {
  allocateCompanyPrice,
  sessionTotalHT,
  type SessionPrice,
} from '@/lib/sessions/session-regime';

/** Appelé exclusivement DANS la transaction qui change les inscriptions / le forfait. */
export async function synchronizeCompanyPriceTx(
  tx: Prisma.TransactionClient,
  session: SessionPrice & { id: string; tenantId: string },
  userId: string,
): Promise<number> {
  if (session.regime !== 'ENTREPRISE') return 0;
  const totalHT = sessionTotalHT(session, []);
  const participants = await tx.sessionParticipant.findMany({
    where: { sessionId: session.id, session: { tenantId: session.tenantId } },
    select: { id: true, priceHT: true, amountCollected: true },
    orderBy: { id: 'asc' },
  });
  const shares = allocateCompanyPrice(
    totalHT,
    participants.map((p) => p.id),
  );
  let updated = 0;
  const changes: { id: string; before: number; after: number }[] = [];
  for (const p of participants) {
    const price = shares[p.id]!;
    const before = Number(p.priceHT);
    if (before === price) continue;
    const result = await tx.sessionParticipant.updateMany({
      where: { id: p.id, sessionId: session.id, session: { tenantId: session.tenantId } },
      data: {
        priceHT: new Prisma.Decimal(price),
        amountRemaining: new Prisma.Decimal(Math.max(0, price - Number(p.amountCollected))),
      },
    });
    updated += result.count;
    if (result.count) changes.push({ id: p.id, before, after: price });
  }
  if (updated)
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId,
        entity: 'TrainingSession',
        entityId: session.id,
        action: 'pricing.companyAllocation',
        diff: { totalHT, population: participants.map((p) => p.id), updated, changes },
      },
    });
  return updated;
}

/** Ajouter un stagiaire ne doit jamais réécrire une ventilation déjà engagée. */
export async function assertCompanyPriceEditable(
  tx: Prisma.TransactionClient,
  session: SessionPrice & { id: string; tenantId: string },
): Promise<void> {
  if (session.regime !== 'ENTREPRISE') return;
  const [invoice, document, submission] = await Promise.all([
    tx.invoice.findFirst({
      where: {
        tenantId: session.tenantId,
        OR: [{ sessionId: session.id }, { participant: { sessionId: session.id } }],
        status: { not: 'CANCELLED' },
      },
      select: { number: true },
    }),
    tx.document.findFirst({
      where: {
        tenantId: session.tenantId,
        AND: [
          { OR: [{ sessionId: session.id }, { participant: { sessionId: session.id } }] },
          {
            OR: [
              { status: { in: ['signed', 'sent_for_signature'] } },
              { signedPdfUrl: { not: null } },
            ],
          },
        ],
      },
      select: { type: true },
    }),
    tx.sessionParticipant.findFirst({
      where: {
        sessionId: session.id,
        OR: [
          { conventionSigned: true },
          { invoiceSent: true },
          { amountCollected: { gt: 0 } },
          { opcoSubmissions: { some: { status: { in: [...STATUTS_OPCO_BLOQUANTS] } } } },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (invoice || document || submission)
    throw new Error(
      `Le forfait est engagé${invoice ? ` par la facture ${invoice.number}` : document ? ` par la pièce ${document.type}` : ' par une convention ou un dossier financeur'}. Corrigez cette pièce dans la fiche session avant de modifier le forfait ou les inscriptions.`,
    );
}
