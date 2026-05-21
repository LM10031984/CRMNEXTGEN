/**
 * Badge "Session prête / incomplète" affiché sur la fiche session.
 *
 * Phase 11 BUG-5 : indicateur visuel qui guide l'utilisateur vers les
 * éléments à corriger avant de pouvoir générer un pack fin de formation
 * conforme audit Qualiopi.
 *
 * - Vert "Prête à générer" si ready (tous les critères OK)
 * - Orange "Incomplète" + liste des blockers cliquables (chip par blocker)
 *
 * Server Component — pas de state, pas d'interactivité.
 */

import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { SessionCompleteness } from '@/lib/sessions/completeness';

interface Props {
  completeness: SessionCompleteness;
}

export function SessionCompletenessBadge({ completeness }: Props) {
  if (completeness.ready) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700"
        title="Session prête à générer le pack fin de formation"
        aria-label="Session prête"
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Prête à générer
      </div>
    );
  }

  const percentLabel = Math.round(completeness.ratio * 100);

  return (
    <details className="inline-block group" aria-label="Session incomplète">
      <summary
        className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-700 cursor-pointer hover:bg-orange-100 transition-colors select-none list-none [&::-webkit-details-marker]:hidden"
        title={`Session incomplète (${percentLabel}% prêt). Cliquer pour voir les éléments manquants.`}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Session incomplète ({completeness.blockers.length} élément
        {completeness.blockers.length > 1 ? 's' : ''} manquant
        {completeness.blockers.length > 1 ? 's' : ''})
      </summary>
      <div className="absolute z-10 mt-2 w-80 rounded-xl border border-border bg-white p-4 shadow-lg space-y-2">
        <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
          À compléter avant de générer le pack
        </p>
        <ul className="space-y-2">
          {completeness.blockers.map((b) => (
            <li key={b.key} className="flex items-start gap-2 text-xs">
              <span
                className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-orange-500 flex-none"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="font-medium text-foreground">{b.label}</div>
                <div className="text-muted-foreground mt-0.5">{b.hint}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
