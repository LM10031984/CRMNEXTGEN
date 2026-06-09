import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FileText, Download, Send, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { QuoteRecipientEditor } from '@/components/quotes/quote-recipient-editor';
import { QuoteHeaderEditor } from '@/components/quotes/quote-header-editor';
import { QuoteLinesEditor } from '@/components/quotes/quote-lines-editor';
import { QuoteStatusActions } from '@/components/quotes/quote-status-actions';
import { QuoteDeleteButton } from '@/components/quotes/quote-delete-button';
import { QuoteDownloadPdfButton } from '@/components/quotes/quote-download-pdf-button';

const STATUS_LABEL: Record<string, { label: string; variant: 'muted' | 'info' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Brouillon', variant: 'muted' },
  SENT: { label: 'Envoyé', variant: 'info' },
  ACCEPTED: { label: 'Accepté', variant: 'success' },
  REJECTED: { label: 'Refusé', variant: 'danger' },
  EXPIRED: { label: 'Expiré', variant: 'muted' },
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { lines: { orderBy: { order: 'asc' } } },
  });
  if (!quote) notFound();

  const status = STATUS_LABEL[quote.status] ?? STATUS_LABEL.DRAFT;
  if (!status) notFound();
  const isLocked = quote.status === 'ACCEPTED' || quote.status === 'REJECTED';

  // Charge les produits + personnes pour le picker "Pré-remplir depuis catalogue".
  // Limite raisonnable (top 50 produits actifs, top 50 personnes récentes) pour
  // éviter un over-fetch sur les gros catalogues — la recherche se fait côté UI.
  const [products, persons] = await Promise.all([
    prisma.trainingProduct.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        title: true,
        durationHours: true,
        priceHT: true,
      },
      take: 100,
    }),
    prisma.person.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <Breadcrumb
        items={[
          { label: 'Devis', href: '/app/devis' },
          { label: quote.number },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <BackToListLink fallbackHref="/app/devis" label="Retour aux devis" />
          <div className="flex items-baseline gap-3 mt-2">
            <h1 className="text-2xl font-semibold">{quote.number}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            {isLocked && (
              <span className="text-xs text-muted-foreground">
                · figé (édition désactivée)
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Créé le {new Date(quote.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
            {quote.validUntil && (
              <> · Valide jusqu'au {new Date(quote.validUntil).toLocaleDateString('fr-FR')}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <QuoteDownloadPdfButton quoteId={quote.id} number={quote.number} />
          <QuoteStatusActions
            quoteId={quote.id}
            status={quote.status}
            linesCount={quote.lines.length}
          />
          {!isLocked && (
            <QuoteDeleteButton quoteId={quote.id} number={quote.number} status={quote.status} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne destinataire + entête */}
        <div className="lg:col-span-1 space-y-4">
          <QuoteRecipientEditor
            quoteId={quote.id}
            disabled={isLocked}
            initial={{
              recipientName: quote.recipientName,
              recipientContact: quote.recipientContact,
              recipientAddress: quote.recipientAddress,
              recipientEmail: quote.recipientEmail,
              recipientSiret: quote.recipientSiret,
              title: quote.title,
              validUntil: quote.validUntil,
            }}
            persons={persons}
          />
          <QuoteHeaderEditor
            quoteId={quote.id}
            disabled={isLocked}
            initial={{
              headerCustomMd: quote.headerCustomMd,
              notes: quote.notes,
            }}
          />
        </div>

        {/* Colonne lignes + totaux */}
        <div className="lg:col-span-2 space-y-4">
          <QuoteLinesEditor
            quoteId={quote.id}
            disabled={isLocked}
            lines={quote.lines.map((l) => ({
              id: l.id,
              order: l.order,
              description: l.description,
              quantity: Number(l.quantity),
              unitPriceHT: Number(l.unitPriceHT),
              vatRate: Number(l.vatRate),
              lineTotalHT: Number(l.lineTotalHT),
            }))}
            products={products.map((p) => ({
              id: p.id,
              code: p.code,
              title: p.title,
              durationHours: p.durationHours,
              priceHT: Number(p.priceHT),
            }))}
            totals={{
              amountHT: Number(quote.amountHT),
              amountVAT: Number(quote.amountVAT),
              amountTTC: Number(quote.amountTTC),
            }}
          />
        </div>
      </div>
    </div>
  );
}
