/**
 * Génère le PDF d'un devis à la demande.
 *
 * - Auth obligatoire (validateRequest) + tenant scope
 * - Génération via Gotenberg (cf. lib/pdf-render.ts)
 * - Inline display dans le navigateur (Content-Disposition: inline) — le
 *   bouton "Télécharger" du composant client utilise `download={number}.pdf`
 *   pour forcer le téléchargement.
 *
 * Pas de cache fichier persistant pour l'instant (génération ~1s acceptable
 * pour un devis). Si Laurent valide le module, on pourra mettre en cache
 * dans MinIO et l'invalider à chaque update du devis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { loadOfConfig } from '@/lib/of-config';
import { renderQuoteHtml } from '@/lib/quote-template';
import { renderHtmlToPdf } from '@/lib/pdf-render';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { lines: { orderBy: { order: 'asc' } } },
  });
  if (!quote) return new NextResponse('Devis introuvable', { status: 404 });

  const of = await loadOfConfig(user.tenantId);

  const html = renderQuoteHtml(
    {
      number: quote.number,
      status: quote.status,
      title: quote.title,
      createdAt: quote.createdAt,
      validUntil: quote.validUntil,
      recipientName: quote.recipientName,
      recipientContact: quote.recipientContact,
      recipientAddress: quote.recipientAddress,
      recipientEmail: quote.recipientEmail,
      recipientSiret: quote.recipientSiret,
      lines: quote.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceHT: Number(l.unitPriceHT),
        vatRate: Number(l.vatRate),
        lineTotalHT: Number(l.lineTotalHT),
      })),
      amountHT: Number(quote.amountHT),
      amountVAT: Number(quote.amountVAT),
      amountTTC: Number(quote.amountTTC),
      headerCustomMd: quote.headerCustomMd,
      notes: quote.notes,
    },
    of,
    user.tenantId,
  );

  const pdf = await renderHtmlToPdf(html);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${quote.number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
