import { prisma } from '@qualiof/db';

/** Même programme que la session : inscription, session/entreprise, puis catalogue. */
export async function resolveProgrammeDocument(input: {
  tenantId: string;
  sessionId: string;
  productId: string;
  participantId: string;
  sponsorOrgId: string;
}) {
  const docs = await prisma.document.findMany({
    where: {
      tenantId: input.tenantId,
      type: 'PROGRAMME',
      OR: [
        { sessionId: input.sessionId, participantId: input.participantId },
        { sessionId: input.sessionId, participantId: null, entityType: { not: 'organization' } },
        {
          sessionId: input.sessionId,
          participantId: null,
          entityType: 'organization',
          entityId: input.sponsorOrgId,
        },
        { entityType: 'product', entityId: input.productId, sessionId: null, participantId: null },
      ],
    },
    select: {
      id: true,
      type: true,
      participantId: true,
      sessionId: true,
      entityType: true,
      entityId: true,
      pdfUrl: true,
      signedPdfUrl: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const available = docs.filter(
    (d) => d.type === 'PROGRAMME' && (d.pdfUrl?.trim() || d.signedPdfUrl?.trim()),
  );
  return (
    available.find(
      (d) => d.participantId === input.participantId && d.sessionId === input.sessionId,
    ) ??
    available.find(
      (d) =>
        d.sessionId === input.sessionId &&
        !d.participantId &&
        d.entityType === 'organization' &&
        d.entityId === input.sponsorOrgId,
    ) ??
    available.find(
      (d) => d.sessionId === input.sessionId && !d.participantId && d.entityType !== 'organization',
    ) ??
    available.find(
      (d) =>
        d.entityType === 'product' &&
        d.entityId === input.productId &&
        !d.sessionId &&
        !d.participantId,
    ) ??
    null
  );
}
