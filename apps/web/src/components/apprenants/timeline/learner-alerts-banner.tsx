import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/**
 * Phase 9.1 Plan 04 — Bandeau alerte conditionnel fiche apprenant.
 *
 * UI-SPEC §"Surface 2 — Fiche apprenant" + §"LearnerAlertsBanner" :
 *  - Early return `null` si missingDocsCount === 0 && pendingPaymentsCount === 0
 *    (Phase 5 UX-09 convention — pas de bandeau "all OK").
 *  - Visuel : `border-amber-300 bg-amber-50 text-amber-900 rounded-2xl p-4`.
 *  - Icône : `AlertTriangle h-5 w-5 text-amber-600`.
 *  - Heading : "Action requise" (UI-SPEC §Copywriting Contract).
 *  - Body : count summary dynamique (singular/plural-aware).
 *  - CTA : Link vers `/app/sessions/{firstIncompleteSessionId}` (D-05 cross-nav).
 *  - role="alert" (UI-SPEC §A11y).
 */

interface Props {
  missingDocsCount: number;
  pendingPaymentsCount: number;
  firstIncompleteSessionId?: string;
}

export function LearnerAlertsBanner({
  missingDocsCount,
  pendingPaymentsCount,
  firstIncompleteSessionId,
}: Props) {
  if (missingDocsCount === 0 && pendingPaymentsCount === 0) return null;

  const parts: string[] = [];
  if (missingDocsCount > 0) {
    parts.push(
      `${missingDocsCount} document${missingDocsCount > 1 ? 's' : ''} Qualiopi manquant${
        missingDocsCount > 1 ? 's' : ''
      }`,
    );
  }
  if (pendingPaymentsCount > 0) {
    parts.push(
      `Paiement en attente sur ${pendingPaymentsCount} session${
        pendingPaymentsCount > 1 ? 's' : ''
      }`,
    );
  }

  return (
    <div
      role="alert"
      className="border border-amber-300 bg-amber-50 text-amber-900 rounded-2xl p-4 flex items-start gap-3"
    >
      <AlertTriangle
        className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">Action requise</p>
        <p className="text-sm">{parts.join(' · ')}</p>
        {firstIncompleteSessionId && (
          <Link
            href={`/app/sessions/${firstIncompleteSessionId}` as any}
            className="text-sm text-primary hover:underline mt-1 inline-block scroll-mt-20"
          >
            Voir les sessions concernées →
          </Link>
        )}
      </div>
    </div>
  );
}
