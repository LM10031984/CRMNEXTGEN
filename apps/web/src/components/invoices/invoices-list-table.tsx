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

const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500 line-through',
  CREDIT_NOTE: 'bg-violet-100 text-violet-800',
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
        className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500"
      >
        Aucune facture pour cette période
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Numéro
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Date
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Payeur
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Montant TTC
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Reste
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Statut
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
            >
              Relances
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r) => {
            const reste = r.amountTtc - r.amountPaid;
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-sm">
                  <Link
                    href={`/app/factures/${r.id}`}
                    className="text-primary-700 hover:underline font-mono"
                  >
                    {r.number}
                  </Link>
                  {r.isAvoir && (
                    <span className="ml-2 inline-flex items-center rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                      AVO
                    </span>
                  )}
                  {r.isAvoir && r.originalInvoiceId && r.originalNumber && (
                    <Link
                      href={`/app/factures/${r.originalInvoiceId}`}
                      className="ml-2 text-xs text-slate-500 hover:underline"
                    >
                      ← {r.originalNumber}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">
                  {r.issueDate ? fmtDate.format(r.issueDate) : '—'}
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">{r.payerLabel}</td>
                <td className="px-4 py-2 text-sm text-right tabular-nums text-slate-700">
                  {fmtEUR.format(r.amountTtc)}
                </td>
                <td className="px-4 py-2 text-sm text-right tabular-nums text-slate-700">
                  {r.isAvoir ? '—' : fmtEUR.format(reste)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                      (STATUS_PALETTE[r.status] ?? 'bg-slate-100 text-slate-700')
                    }
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {r.reminderCount > 0 ? (
                    <span title={`Dernière relance : ${r.lastReminderAt ? fmtDate.format(r.lastReminderAt) : '—'}`}>
                      N{r.reminderCount}
                      {r.lastReminderAt && (
                        <span className="text-slate-400 ml-1">
                          ({fmtDate.format(r.lastReminderAt)})
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
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
