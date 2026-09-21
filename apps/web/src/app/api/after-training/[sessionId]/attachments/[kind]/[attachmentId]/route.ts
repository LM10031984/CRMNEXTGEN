import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError, UnauthorizedError } from '@/lib/rbac';
import { DOCS_BUCKET, downloadFile } from '@/lib/storage';
import { invoiceDownloadFilename } from '@/lib/docs/invoice-filename';
import { buildDownloadFilename, extFromStorageKey } from '@/lib/docs/download-filename';

export async function GET(
  req: Request,
  context: { params: Promise<{ sessionId: string; kind: string; attachmentId: string }> },
) {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return new NextResponse('Unauthorized', { status: 401 });
    if (error instanceof ForbiddenError) return new NextResponse('Forbidden', { status: 403 });
    throw error;
  }
  const { sessionId, kind, attachmentId } = await context.params;
  let sourceKey: string | null = null;
  let filename: string | null = null;

  if (kind === 'document') {
    const document = await prisma.document.findFirst({
      where: {
        id: attachmentId,
        tenantId: user.tenantId,
        sessionId,
        type: { in: ['ATTESTATION_FIN', 'CERTIFICAT_REALISATION'] },
      },
      include: {
        participant: { select: { person: { select: { firstName: true, lastName: true } } } },
        session: { select: { code: true } },
      },
    });
    if (document) {
      sourceKey = document.signedPdfUrl ?? document.pdfUrl;
      filename = buildDownloadFilename({
        docType: document.type,
        firstName: document.participant?.person.firstName,
        lastName: document.participant?.person.lastName,
        sessionCode: document.session?.code,
        ext: extFromStorageKey(sourceKey),
      });
    }
  } else if (kind === 'invoice') {
    const invoice = await prisma.invoice.findFirst({
      where: { id: attachmentId, tenantId: user.tenantId },
      include: {
        payerOrg: { select: { brandName: true, legalName: true } },
        participant: {
          select: {
            sessionId: true,
            sponsorOrgId: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (
      invoice &&
      invoice.pdfUrl &&
      ['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status)
    ) {
      const groupedIds = Array.isArray(invoice.participantIds)
        ? (invoice.participantIds as string[])
        : [];
      const singleGroupedParticipant =
        groupedIds.length === 1
          ? await prisma.sessionParticipant.findFirst({
              where: { id: groupedIds[0], sessionId, session: { tenantId: user.tenantId } },
              select: { sponsorOrgId: true },
            })
          : null;
      const groupedShapeIsSafe =
        groupedIds.length === 0 ||
        (groupedIds.length === 1 && groupedIds[0] === invoice.participantId);
      const directIndividual =
        invoice.participantId != null &&
        invoice.participant?.sessionId === sessionId &&
        invoice.participant.sponsorOrgId === invoice.payerOrgId &&
        (invoice.sessionId == null || invoice.sessionId === sessionId) &&
        groupedShapeIsSafe;
      const safeSingleGrouped =
        invoice.participantId == null &&
        groupedIds.length === 1 &&
        invoice.sessionId === sessionId &&
        singleGroupedParticipant?.sponsorOrgId === invoice.payerOrgId;
      if (directIndividual || safeSingleGrouped) {
        sourceKey = invoice.pdfUrl;
        filename = invoiceDownloadFilename(invoice);
      }
    }
  }

  if (!sourceKey || !filename) return new NextResponse('Not found', { status: 404 });
  try {
    const buffer = await downloadFile(DOCS_BUCKET, sourceKey);
    const download = new URL(req.url).searchParams.get('dl') === '1';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('Document indisponible', { status: 500 });
  }
}
