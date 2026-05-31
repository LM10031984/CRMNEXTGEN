import Link from 'next/link';
import type { InvoiceRow } from '@/server/actions/invoices-list';

/**
 * Phase 11 Plan 11-08 Task 2 — Table flat avec badges statuts pastilles (D-20).
 *
 * Style QualiOF (D-20) :
 *  - Pas grille Excel — table plate avec hover row.
 *  - Pastilles statuts (vert PAID / orange PARTIAL / rouge OVERDUE / gris CANCELLED).
 *  - Badge "AVO" inline + lien vers facture originale (D-07 cross-nav).
 *  - overflow-x-auto + -mx-4 sm:mx-0 pour responsive mobile (pattern Phase 3 listings).
 *
 * Empty state : "Aucune facture pour cette période" (D-Discretion / RESEARCH).
 * L'empty state "Aucun impayé 🎉" est géré par la page (filtre onlyUnpaid actif).
 */

// Palette Folk : fond pastel + texte contrasté, PAS de ring (Notion-style).
const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-blue-50 text-blue-700',
  PAID: 'bg-green-50 text-green-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  OVERDUE: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-400 line-through',
  CREDIT_NOTE: 'bg-violet-50 text-violet-700',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  PAID: 'Payée',
  PARTIAL: 'Partielle',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
  CREDIT_NOTE: 'Avoir',
};

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

interface Props {
  rows: InvoiceRow[];
}

export function InvoicesListTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div
        role="status"
        className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card py-16 text-center text-sm text-slate-500"
      >
        Aucune facture pour cette période
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card">
      <table className="min-w-full">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-200">
            <Th>Numéro</Th>
            <Th>Date</Th>
            <Th>Payeur</Th>
            <Th align="right">Montant TTC</Th>
            <Th align="right">Reste</Th>
            <Th>Statut</Th>
            <Th>Relances</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const reste = r.amountTtc - r.amountPaid;
            return (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="py-3 px-4 text-sm">
                  <Link
                    href={`/app/factures/${r.id}`}
                    className="text-slate-900 hover:text-blue-700 hover:underline font-mono font-medium"
                  >
                    {r.number}
                  </Link>
                  {r.isAvoir && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                      AVO
                    </span>
                  )}
                  {r.isAvoir && r.originalInvoiceId && r.originalNumber && (
                    <Link
                      href={`/app/factures/${r.originalInvoiceId}`}
                      className="ml-2 text-xs text-slate-500 hover:text-slate-700 hover:underline"
                    >
                      ← {r.originalNumber}
                    </Link>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-slate-500 tabular-nums">
                  {r.issueDate ? fmtDate.format(r.issueDate) : '—'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">{r.payerLabel}</td>
                <td className="py-3 px-4 text-sm text-right tabular-nums font-medium text-slate-900">
                  {fmtEUR.format(r.amountTtc)}
                </td>
                <td className="py-3 px-4 text-sm text-right tabular-nums text-slate-700">
                  {r.isAvoir ? '—' : fmtEUR.format(reste)}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={
                      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ' +
                      (STATUS_PALETTE[r.status] ?? 'bg-slate-100 text-slate-700')
                    }
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-500">
                  {r.reminderCount > 0 ? (
                    <span title={`Dernière relance : ${r.lastReminderAt ? fmtDate.format(r.lastReminderAt) : '—'}`}>
                      N{r.reminderCount}
                      {r.lastReminderAt && (
                        <span className="text-slate-400 ml-1 tabular-nums">
                          ({fmtDate.format(r.lastReminderAt)})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`py-2.5 px-4 text-${align} text-[11px] font-medium uppercase tracking-wider text-slate-500`}
    >
      {children}
    </th>
  );
}
