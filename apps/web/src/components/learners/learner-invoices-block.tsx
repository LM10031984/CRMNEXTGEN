/**
 * Phase 11 Plan 11-09 Task 1 — `LearnerInvoicesBlock` (Server Component).
 *
 * Cross-navigation Airtable-style (D-07) : bloc "Factures" sur la fiche
 * apprenant `/app/apprenants/[id]` listant toutes les Invoice où
 * `participant.personId === current`. Reproduit le pattern Phase 9.1 D-05
 * (matrice docs + timeline) — table compacte plate, pas une PrioCard.
 *
 * Anti-régression :
 *  - PAS de directive 'use client' — RSC async pure.
 *  - Filtre defense-in-depth `tenantId` + `participant.personId` (le simple
 *    fait d'avoir `participant.personId` ne suffit pas : on garde `tenantId`
 *    par cohérence avec toutes les autres queries multi-tenant Phase 8 RBAC).
 *  - Avoirs (status=CREDIT_NOTE) rendus avec badge "AVO" violet + lien vers
 *    facture originale (`originalInvoice.id`) — pattern Plan 11-08 dupliqué
 *    en local (duplication acceptée car composant compact, pas de factor).
 *
 * Status palette : reproduit la convention `invoices-list-table.tsx` Plan 11-08.
 */

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { prisma } from '@qualiof/db';

const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
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

export interface LearnerInvoicesBlockProps {
  personId: string;
  tenantId: string;
}

export async function LearnerInvoicesBlock({ personId, tenantId }: LearnerInvoicesBlockProps) {
  // Filtre defense-in-depth : tenantId + participant.personId scope.
  // `participant` est `SessionParticipant?` (cf schema.prisma:541) — donc
  // une relation Prisma "is null possible". On utilise le filtre relation
  // shorthand `participant: { personId }` (= INNER JOIN implicite).
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      participant: { personId },
    },
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      amountTTC: true,
      amountPaid: true,
      originalInvoiceId: true,
      originalInvoice: { select: { id: true, number: true } },
    },
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
  });

  return (
    <section
      id="learner-invoices"
      aria-labelledby="learner-invoices-heading"
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-600" aria-hidden="true" />
        <h2
          id="learner-invoices-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Factures
        </h2>
        <span className="text-xs text-slate-500">({invoices.length})</span>
      </div>

      {invoices.length === 0 ? (
        <div
          role="status"
          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500"
        >
          Aucune facture liée à cet apprenant
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
                >
                  Numéro
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
                >
                  Date
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600"
                >
                  TTC
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600"
                >
                  Reste
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
                >
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {invoices.map((inv) => {
                const isAvoir = inv.status === 'CREDIT_NOTE';
                const ttc = Number(inv.amountTTC);
                const paid = Number(inv.amountPaid);
                const reste = Math.max(0, ttc - paid);
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm">
                      <Link
                        href={`/app/factures/${inv.id}`}
                        className="font-mono text-primary-700 hover:underline"
                      >
                        {inv.number}
                      </Link>
                      {isAvoir && (
                        <span
                          title="Avoir (note de crédit)"
                          className="ml-2 inline-flex items-center rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800"
                        >
                          AVO
                        </span>
                      )}
                      {isAvoir && inv.originalInvoice && (
                        <Link
                          href={`/app/factures/${inv.originalInvoice.id}`}
                          className="ml-2 text-xs text-slate-500 hover:underline"
                          title={`Avoir lié à la facture ${inv.originalInvoice.number}`}
                        >
                          ← {inv.originalInvoice.number}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {inv.issueDate ? fmtDate.format(inv.issueDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {fmtEUR.format(ttc)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {isAvoir ? '—' : fmtEUR.format(reste)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_PALETTE[inv.status] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
