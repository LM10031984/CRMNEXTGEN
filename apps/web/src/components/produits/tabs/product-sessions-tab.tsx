import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { ProductSessionRow } from '@/lib/product-stats';
import { Badge } from '@/components/ui/badge';

/**
 * Phase 9.1 Plan 09.1-05 Task 2 — Tab "Sessions" de la fiche produit (Server Component).
 *
 * Liste des sessions de ce produit, chaque row cliquable vers
 * `/app/sessions/{id}` (D-05 cross-nav).
 *
 * Empty state (UI-SPEC §Empty states) : message + CTA "+ Créer une session"
 * pré-rempli avec productId pour pré-sélection wizard.
 *
 * Wrapper `overflow-x-auto -mx-4 sm:mx-0` (pattern Phase 3 RESP-05).
 */

interface Props {
  sessions: ProductSessionRow[];
  productId: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  PLANNED: 'Planifiée',
  OPEN: 'Ouverte',
  VALIDATED: 'Validée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'muted'> = {
  COMPLETED: 'success',
  IN_PROGRESS: 'info',
  VALIDATED: 'info',
  PLANNED: 'info',
  OPEN: 'info',
  DRAFT: 'muted',
  CANCELLED: 'warning',
};

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDateRange(start: Date, end: Date | null): string {
  const s = fmtDate.format(start);
  if (!end) return s;
  const e = fmtDate.format(end);
  if (s === e) return s;
  return `${s} → ${e}`;
}

export function ProductSessionsTab({ sessions, productId }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
        <h3 className="text-base font-semibold mb-1">Aucune session pour ce produit</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Créez une session de formation pour démarrer.
        </p>
        <Link
          href={`/app/sessions/new?productId=${productId}` as any}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          + Créer une session
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-left">
            <th scope="col" className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Code
            </th>
            <th scope="col" className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Dates
            </th>
            <th scope="col" className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Statut
            </th>
            <th scope="col" className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground font-medium text-right">
              Participants
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-b border-border hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/app/sessions/${s.id}` as any}
                  className="font-mono text-xs font-semibold text-primary hover:underline"
                >
                  {s.code}
                </Link>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {formatDateRange(s.startDate, s.endDate)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[s.status] ?? 'muted'}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {s.participantsCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
