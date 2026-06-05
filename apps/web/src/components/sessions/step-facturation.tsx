import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TimelineStep, type StepState } from './timeline-step';

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  amountTTC: number;
  amountPaid: number;
  issueDate: Date | null;
  beneficiary: string;
  isCreditNote: boolean;
}

interface Props {
  state: StepState;
  invoices: InvoiceRow[];
  caTotalHT: number;
  /** Lien vers le dossier OPCO si applicable */
  opcoSubmissionId?: string | null;
  /** Expansion initiale (dérivée de stagesState[5] === 'active'). */
  expanded?: boolean;
}

const STATUS_PALETTE: Record<string, { bg: string; label: string }> = {
  DRAFT: { bg: 'bg-slate-100 text-slate-700', label: 'Brouillon' },
  ISSUED: { bg: 'bg-sky-100 text-sky-800', label: 'Émise' },
  PAID: { bg: 'bg-emerald-100 text-emerald-800', label: 'Payée' },
  PARTIAL: { bg: 'bg-amber-100 text-amber-800', label: 'Partielle' },
  OVERDUE: { bg: 'bg-red-100 text-red-800', label: 'En retard' },
  CANCELLED: { bg: 'bg-slate-200 text-slate-500', label: 'Annulée' },
  CREDIT_NOTE: { bg: 'bg-violet-100 text-violet-800', label: 'Avoir' },
};

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function StepFacturation({ state, invoices, caTotalHT, opcoSubmissionId, expanded }: Props) {
  const billed = invoices
    .filter((i) => !i.isCreditNote && i.status !== 'DRAFT' && i.status !== 'CANCELLED')
    .reduce((acc, i) => acc + i.amountTTC, 0);
  const paid = invoices
    .filter((i) => !i.isCreditNote)
    .reduce((acc, i) => acc + i.amountPaid, 0);
  const credit = invoices
    .filter((i) => i.isCreditNote)
    .reduce((acc, i) => acc + i.amountTTC, 0);

  const billedRatio = caTotalHT > 0 ? Math.min(1, billed / caTotalHT) : 0;
  const paidRatio = caTotalHT > 0 ? Math.min(1, paid / caTotalHT) : 0;

  const badge =
    invoices.length === 0 ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-medium">
        Aucune facture
      </span>
    ) : paidRatio >= 1 ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
        100% encaissé
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-medium">
        {Math.round(paidRatio * 100)}% encaissé
      </span>
    );

  return (
    <TimelineStep
      number={5}
      title="Facturation & encaissement"
      state={state}
      expanded={expanded}
      caption="Émission facture sponsor, suivi paiement, dossier OPCO / AGEFICE"
      badge={badge}
      action={
        opcoSubmissionId ? (
          <Link
            href={`/app/dossiers-opco/${opcoSubmissionId}` as Route}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <Wallet className="h-4 w-4" /> Voir le dossier OPCO
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null
      }
    >
      {/* Mini-KPI bars facturation/encaissement */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <KpiBar label="CA prévu HT" value={fmtEUR.format(caTotalHT)} ratio={1} color="slate" />
        <KpiBar
          label="Facturé TTC"
          value={fmtEUR.format(billed)}
          ratio={billedRatio}
          color="sky"
        />
        <KpiBar
          label="Encaissé TTC"
          value={fmtEUR.format(paid)}
          ratio={paidRatio}
          color="emerald"
        />
      </div>

      {/* Liste factures compacte */}
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Pas encore de facture émise pour cette session.
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">N°</th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Bénéficiaire</th>
                <th className="text-right px-3 py-2 font-medium">Montant</th>
                <th className="text-right px-3 py-2 font-medium">Payé</th>
                <th className="text-left px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => {
                const palette = STATUS_PALETTE[inv.status] ?? STATUS_PALETTE.DRAFT;
                return (
                  <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2">
                      <Link
                        href={`/app/factures/${inv.id}` as Route}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {inv.issueDate ? fmtDate.format(inv.issueDate) : '—'}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{inv.beneficiary}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {inv.isCreditNote ? (
                        <span className="text-violet-700">−{fmtEUR.format(inv.amountTTC)}</span>
                      ) : (
                        fmtEUR.format(inv.amountTTC)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {inv.amountPaid > 0 ? fmtEUR.format(inv.amountPaid) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="muted" className={`text-[10px] border-0 ${palette!.bg}`}>
                        {palette!.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {credit > 0 && (
                <tr className="bg-violet-50/30">
                  <td colSpan={3} className="px-3 py-2 text-xs italic text-violet-800">
                    Total avoirs
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-violet-800">
                    −{fmtEUR.format(credit)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </TimelineStep>
  );
}

function KpiBar({
  label,
  value,
  ratio,
  color,
}: {
  label: string;
  value: string;
  ratio: number;
  color: 'slate' | 'sky' | 'emerald';
}) {
  const colorMap = {
    slate: 'bg-slate-400',
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
  };
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
      <div className="h-1 mt-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${colorMap[color]} transition-[width] duration-500`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
