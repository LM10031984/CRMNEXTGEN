import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Receipt, Building2, User, Calendar, FileText, Wallet, ExternalLink } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { RecordPaymentForm } from '@/components/invoices/record-payment-form';
import { CreateCreditNoteDialog } from '@/components/invoices/create-credit-note-dialog';
import { SendReminderButton } from '@/components/invoices/send-reminder-button';

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

  // Phase 11 Plan 11-06 Task 3 — récupère aussi la config tenant.invoiceReminderDays
  // en parallèle du lookup facture pour câbler <SendReminderButton maxLevel>.
  const [invoice, tenant] = await Promise.all([
    prisma.invoice.findFirst({
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
    }),
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { invoiceReminderDays: true },
    }),
  ]);
  if (!invoice) notFound();
  const tenantReminderDays = tenant?.invoiceReminderDays ?? [30, 45];

  const status = STATUS_LABEL[invoice.status] ?? { label: invoice.status, variant: 'muted' as const };
  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  const isOverdue = invoice.dueDate && invoice.dueDate < new Date() && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED';
  // Phase 11 Plan 11-05 — CTA "Créer un avoir" visible si statut éligible D-03.
  const isCreditNoteEligible = ['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status);
  const isCreditNote = invoice.status === 'CREDIT_NOTE';
  // Phase 11 Plan 11-06 — Bouton manuel "Envoyer relance maintenant" visible
  // si la facture est dans un état où une relance fait sens (D-13 auto-stop
  // sur PAID/CANCELLED/CREDIT_NOTE/DRAFT). Le bouton lui-même se désactive
  // aussi si reminderCount >= maxLevel.
  const isReminderEligible = ['ISSUED', 'PARTIAL', 'OVERDUE'].includes(invoice.status);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/factures"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-3 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Toutes les factures
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-violet-50 text-violet-600 inline-flex items-center justify-center">
              <Receipt className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-3xl font-bold tracking-tight font-mono text-slate-900">{invoice.number}</h1>
                <Badge variant={isOverdue ? 'danger' : status.variant}>{isOverdue ? 'En retard' : status.label}</Badge>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Émise le <span className="font-medium text-slate-700">{invoice.issueDate ? fmtDate.format(invoice.issueDate) : '—'}</span>
                {invoice.dueDate && <> · échéance le <span className="font-semibold text-slate-900">{fmtDate.format(invoice.dueDate)}</span></>}
              </p>
            </div>
          </div>
          {invoice.pdfUrl && (
            <a
              href={`/api/documents-by-invoice/${invoice.id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: 'dark' })}
            >
              <ExternalLink className="h-4 w-4" /> Voir le PDF
            </a>
          )}
        </div>
      </div>

      {/* Bandeau retour vers facture originale si on est sur un AVOIR — D-04 */}
      {isCreditNote && invoice.originalInvoice && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <Link
            href={`/app/factures/${invoice.originalInvoice.id}`}
            className="inline-flex items-center gap-1.5 hover:text-amber-700 font-medium transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voir la facture originale <span className="font-mono">{invoice.originalInvoice.number}</span>
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

      {/* Saisie paiement + CTA avoir — Plan 11-05 D-03 + CTA relance manuel Plan 11-06 D-09 */}
      <section className="flex flex-wrap items-start gap-3">
        <RecordPaymentForm invoiceId={invoice.id} remaining={remaining} />
        {isCreditNoteEligible && (
          <CreateCreditNoteDialog
            originalInvoiceId={invoice.id}
            originalAmountHt={Number(invoice.amountHT)}
            originalNumber={invoice.number}
          />
        )}
        {isReminderEligible && (
          <SendReminderButton
            invoiceId={invoice.id}
            status={invoice.status}
            lastReminderAt={invoice.lastReminderAt}
            reminderCount={invoice.reminderCount}
            maxLevel={tenantReminderDays.length}
          />
        )}
      </section>

      {/* Section "Avoirs liés" — D-04 + D-07 cross-nav */}
      {invoice.creditNotes && invoice.creditNotes.length > 0 && (
        <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/40 flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-amber-50 text-amber-700">
              <FileText className="h-4 w-4" strokeWidth={2} />
            </span>
            <h2 className="font-semibold text-sm text-slate-900">
              Avoirs liés <span className="text-slate-500 font-normal">· {invoice.creditNotes.length}</span>
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {invoice.creditNotes.map((cn) => (
              <li key={cn.id} className="px-5 py-3.5 text-sm flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/factures/${cn.id}`}
                    className="font-mono font-semibold hover:underline text-slate-900"
                  >
                    {cn.number}
                  </Link>
                  {cn.issueDate && (
                    <span className="ml-2 text-xs text-slate-500">
                      émis le <span className="tabular-nums">{fmtDate.format(cn.issueDate)}</span>
                    </span>
                  )}
                  {cn.notes && (
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {cn.notes}
                    </div>
                  )}
                </div>
                <span className="font-semibold tabular-nums text-amber-700 whitespace-nowrap">
                  {fmtEUR.format(Math.abs(Number(cn.amountHT)))} <span className="text-[10px] font-normal text-slate-500">HT</span>
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
      <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-blue-50 text-primary">
            <Wallet className="h-4 w-4" strokeWidth={2} />
          </span>
          <h2 className="font-semibold text-sm text-slate-900">
            Historique des paiements <span className="text-slate-500 font-normal">· {invoice.payments.length}</span>
          </h2>
        </div>
        {invoice.payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500 italic">
            Aucun paiement enregistré.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mode</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Référence</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">{fmtDateTime.format(p.receivedAt)}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-700">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{p.reference ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-900">{fmtEUR.format(Number(p.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2.5">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} /> {title}
      </div>
      <div className="text-slate-900">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: 'primary' | 'success' | 'warning' }) {
  // Folk-style : carte sobre, chiffre coloré uniquement si accent.
  const valueClass =
    accent === 'primary' ? 'text-blue-700'
    : accent === 'success' ? 'text-green-700'
    : accent === 'warning' ? 'text-amber-700'
    : 'text-slate-900';
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-4">
      <div className="text-xs font-medium text-slate-500 mb-1.5">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
