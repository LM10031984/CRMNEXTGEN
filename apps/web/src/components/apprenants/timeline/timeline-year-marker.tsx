/**
 * Phase 9.1 Plan 04 — Jalon année pour la timeline fiche apprenant.
 *
 * UI-SPEC §"LearnerTimeline" + §"A11y" :
 *  - `<h3 className="sr-only">Année {year}</h3>` pour l'a11y (heading semantic).
 *  - `<span aria-hidden>{year}</span>` pour le rendu visuel décoratif.
 *  - Compteur sessions de l'année + border-t pour séparateur visuel.
 */

interface Props {
  year: number;
  sessionsCount: number;
}

export function TimelineYearMarker({ year, sessionsCount }: Props) {
  const label = `${sessionsCount} session${sessionsCount > 1 ? 's' : ''}`;
  return (
    <div className="flex items-center gap-3 my-6">
      <h3 className="sr-only">Année {year}</h3>
      <span
        aria-hidden
        className="text-base font-semibold text-foreground"
      >
        {year}
      </span>
      <span
        className="text-xs text-muted-foreground"
        title={`${label} en ${year}`}
      >
        {label}
      </span>
      <div className="flex-1 border-t border-border" aria-hidden />
    </div>
  );
}
