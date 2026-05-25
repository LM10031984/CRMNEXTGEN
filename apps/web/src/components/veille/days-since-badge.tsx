/**
 * Badge KPI veille "X jours depuis dernière revue" (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * 3 paliers couleur (cohérence RESEARCH §2.10 + JSDoc daysSince helper Plan 02) :
 *  - `null`           → gris neutre + Clock + "Aucune revue enregistrée"
 *  - `< 30j`          → emerald (vert)  + Clock + "X jour(s) depuis dernière revue"
 *  - `30 ≤ d < 90`    → amber (ambre)   + Clock + "X jour(s) ..."
 *  - `≥ 90j`          → red (rouge)     + AlertTriangle + "X jours ..."
 *
 * Composant pur (pas d'état, pas d'I/O) — props `days` déjà calculé serveur via
 * `daysSince(lastReview.dateLastReviewed)`. Pas de Math dans le rendu.
 *
 * Usage : `<DaysSinceBadge days={daysSince(...)} />` dans page.tsx.
 */

import { AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DaysSinceBadgeProps {
  days: number | null;
}

export function DaysSinceBadge({ days }: DaysSinceBadgeProps) {
  if (days === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-700">
        <Clock className="h-4 w-4" aria-hidden="true" />
        Aucune revue enregistrée
      </span>
    );
  }

  // 3 paliers de seuil (cf. days-since.ts JSDoc — Plan 02)
  const isAlert = days >= 90;
  const isWarn = days >= 30 && days < 90;

  const colorClass = isAlert
    ? 'bg-red-100 text-red-800'
    : isWarn
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';

  const Icon = isAlert ? AlertTriangle : Clock;

  // Gestion fr "0 jour" / "1 jour" / "2 jours" — pluriel à partir de 2.
  // La valeur `days` est calculée serveur via daysSince() (Plan 02 helper pur)
  // sur un dateLastReviewed qui est forcément ≤ now() côté BDD — pas besoin de
  // protéger contre des valeurs négatives ici.
  const plural = days >= 2 ? 's' : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-md',
        colorClass,
      )}
      title={`Seuil Qualiopi : vert < 30j · ambre 30-89j · rouge ≥ 90j`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {days} jour{plural} depuis dernière revue
    </span>
  );
}
