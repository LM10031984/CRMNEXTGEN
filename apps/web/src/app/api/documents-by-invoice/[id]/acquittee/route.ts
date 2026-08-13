import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { acquittedInvoiceKey } from '@/lib/invoice-storage';

/**
 * Quick 260813-efh — sert l'édition ACQUITTÉE d'une facture (duplicata
 * tamponné « PAYÉ » pour les dossiers OPCO/AGEFICE).
 *
 * Le PDF est produit en amont par `generateAcquittedInvoicePdf` ; cette route
 * ne fait que le streamer, comme la route soeur qui sert la facture normale.
 *
 * Pourquoi une route API et pas une URL signée : `createSignedDownloadUrl`
 * lève une exception avec le provider MinIO (local) — elle n'est implémentée
 * que côté Supabase. Streamer le buffer marche dans les deux environnements
 * et évite d'exposer l'endpoint de stockage au navigateur.
 *
 * La clé n'est jamais reçue du client : elle est recalculée depuis le numéro
 * de la facture après un lookup scopé `tenantId` (pas d'IDOR).
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await context.params;

  const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!invoice) return new NextResponse('Not found', { status: 404 });

  const key = acquittedInvoiceKey(invoice.number);

  try {
    const buffer = await downloadFile(DOCS_BUCKET, key);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.number}-acquittee.pdf"`,
        // Régénérable à tout moment (la clé est écrasée) → pas de cache long.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[documents-by-invoice/${id}/acquittee] read error :`, e);
    }
    return new NextResponse('Pièce acquittée non générée', { status: 404 });
  }
}
