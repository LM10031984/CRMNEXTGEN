import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Receipt, Building2, User, Calendar, FileText, Wallet, ExternalLink } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { RecordPaymentForm } from '@/components/invoices/record-payment-form';
import { CreateCreditNoteDialog } from '@/components/invoices/create-credit-note-dialog';

export const dynamic = 'force-dynamic';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, { label: string; variant: 'muted' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Brouillon', variant: 'muted' },
  ISSUED: { label: 'Émise', variant: 'info' },
  PARTIAL: { label: 'Partiel', variant: 'warning' },
  PAID: { label: 'Payée', variant: 'success' },
  OVERDUE: { label: 'En retard', variant: 'danger' },
  CANCELLED: { label: 'Annulée', variant: 'muted' },
  CREDIT_NOTE: { label: 'Avoir', variant: 'warning' },
};

const METHOD_LABEL: Record<string, string> = {
  virement: 'Virement bancaire',
  cheque: 'Chèque',
  cb: 'Carte bancaire',
  prelevement: 'Prélèvement',
  especes: 'Espèces',
  opco: 'Remboursement OPCO',
};

export default async function FactureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      participant: {
        include: {
          person: { select: { id: true, firstName: true, lastName: true, email: true } },
          session: { select: { id: true, code: true, name: true, startDate: true, endDate: true } },
        },
      },
      payerOrg: { select: { id: true, legalName: true, siret: true } },
      payments: { orderBy: { receivedAt: 'desc' } },
      // Phase 11 Plan 11-05 — Cross-nav avoirs (D-04 + D-07).
      creditNotes: {
        select: {
          id: true,
          number: true,
          amountHT: true,
          notes: true,
          issueDate: true,
        },
        orderBy: { issueDate: 'desc' },
      },
      originalInvoice: { select: { id: true, number: true } },
    },
  });
  if (!invoice) notFound();

  const status = STATUS_LABEL[invoice.status] ?? { label: invoice.status, variant: 'muted' as const };
  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  const isOverdue = invoice.dueDate && invoice.dueDate < new Date() && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED';
  // Phase 11 Plan 11-05 — CTA "Créer un avoir" visible si statut éligible D-03.
  const isCreditNoteEligible = ['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status);
  const isCreditNote = invoice.status === 'CREDIT_NOTE';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/factures" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Toutes les factures
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-violet-100 text-violet-700 inline-flex items-center justify-center">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight font-mono">{invoice.number}</h1>
                <Badge variant={isOverdue ? 'danger' : status.variant}>{isOverdue ? 'En retard' : status.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Émise le {invoice.issueDate ? fmtDate.format(invoice.issueDate) : '—'}
                {invoice.dueDate && <> · échéance le <strong>{fmtDate.format(invoice.dueDate)}</strong></>}
              </p>
            </div>
          </div>
          {invoice.pdfUrl && (
            <a
              href={`/api/documents-by-invoice/${invoice.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600"
            >
              <ExternalLink className="h-4 w-4" /> Voir le PDF
            </a>
          )}
        </div>
      </div>

      {/* Bandeau retour vers facture originale si on est sur un AVOIR — D-04 */}
      {isCreditNote && invoice.originalInvoice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Link
            href={`/app/factures/${invoice.originalInvoice.id}`}
            className="inline-flex items-center gap-1 hover:underline font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voir la facture originale {invoice.originalInvoice.number}
          </Link>
        </div>
      )}

      {/* Montants */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total HT" value={fmtEUR.format(Number(invoice.amountHT))} />
        <KpiCard label={`TVA (${Number(invoice.vatRate)}%)`} value={fmtEUR.format(Number(invoice.amountTTC) - Number(invoice.amountHT))} />
        <KpiCard label="Total TTC" value={fmtEUR.format(Number(invoice.amountTTC))} accent="primary" />
        <KpiCard
          label={remaining > 0 ? 'Reste à encaisser' : 'Soldé'}
          value={remaining > 0 ? fmtEUR.format(remaining) : fmtEUR.format(Number(invoice.amountPaid))}
          accent={remaining > 0 ? 'warning' : 'success'}
        />
      </section>

      {/* Saisie paiement + CTA avoir — Plan 11-05 D-03 */}
      <section className="flex flex-wrap items-start gap-3">
        <RecordPaymentForm invoiceId={invoice.id} remaining={remaining} />
        {isCreditNoteEligible && (
          <CreateCreditNoteDialog
            originalInvoiceId={invoice.id}
            originalAmountHt={Number(invoice.amountHT)}
            originalNumber={invoice.number}
          />
        )}
      </section>

      {/* Section "Avoirs liés" — D-04 + D-07 cross-nav */}
      {invoice.creditNotes && invoice.creditNotes.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200 bg-amber-50">
            <h2 className="font-semibold text-sm inline-flex items-center gap-2 text-amber-900">
              <FileText className="h-4 w-4" /> Avoirs liés ({invoice.creditNotes.length})
            </h2>
          </div>
          <ul className="divide-y divide-amber-100">
            {invoice.creditNotes.map((cn) => (
              <li key={cn.id} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/factures/${cn.id}`}
                    className="font-mono font-medium hover:underline text-amber-900"
                  >
                    {cn.number}
                  </Link>
                  {cn.issueDate && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      émis le {fmtDate.format(cn.issueDate)}
                    </span>
                  )}
                  {cn.notes && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {cn.notes}
                    </div>
                  )}
                </div>
                <span className="font-medium tabular-nums text-amber-900 whitespace-nowrap">
                  {fmtEUR.format(Math.abs(Number(cn.amountHT)))} HT
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Détails */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block icon={User} title="Apprenant">
          {invoice.participant ? (
            <>
              <Link href={`/app/apprenants/${invoice.participant.person.id}`} className="font-medium hover:text-primary">
                {invoice.participant.person.firstName} {invoice.participant.person.lastName}
              </Link>
              {invoice.participant.person.email && <div className="text-xs text-muted-foreground mt-0.5">{invoice.participant.person.email}</div>}
            </>
          ) : <span className="text-xs text-muted-foreground italic">Non rattaché</span>}
        </Block>

        <Block icon={Building2} title="Payeur">
          {invoice.payerOrg ? (
            <>
              <Link href={`/app/organisations/${invoice.payerOrg.id}`} className="font-medium hover:text-primary">
                {invoice.payerOrg.legalName}
              </Link>
              {invoice.payerOrg.siret && <div className="text-xs text-muted-foreground mt-0.5 font-mono">SIRET {invoice.payerOrg.siret}</div>}
            </>
          ) : <span className="text-xs text-muted-foreground italic">—</span>}
        </Block>

        <Block icon={Calendar} title="Session de formation">
          {invoice.participant?.session ? (
            <>
              <Link href={`/app/sessions/${invoice.participant.session.id}`} className="font-medium hover:text-primary">
                {invoice.participant.session.name ?? invoice.participant.session.code}
              </Link>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{invoice.participant.session.code}</div>
              <div className="text-xs text-muted-foreground">
                {fmtDate.format(invoice.participant.session.startDate)} → {fmtDate.format(invoice.participant.session.endDate)}
              </div>
            </>
          ) : <span className="text-xs text-muted-foreground italic">—</span>}
        </Block>

        <Block icon={FileText} title="Notes">
          {invoice.notes ? (
            <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
          ) : <span className="text-xs text-muted-foreground italic">Aucune note.</span>}
        </Block>
      </section>

      {/* Historique paiements */}
      <section className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-sm inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Historique des paiements ({invoice.payments.length})
          </h2>
        </div>
        {invoice.payments.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground italic">
            Aucun paiement enregistré.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mode</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Référence</th>
                <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Montant</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{fmtDateTime.format(p.receivedAt)}</td>
                  <td className="px-4 py-2.5 text-sm">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.reference ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtEUR.format(Number(p.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: 'primary' | 'success' | 'warning' }) {
  const cls =
    accent === 'primary' ? 'border-primary-200 bg-primary-50/50'
    : accent === 'success' ? 'border-emerald-200 bg-emerald-50/50'
    : accent === 'warning' ? 'border-amber-200 bg-amber-50/50'
    : 'border-border bg-white';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
