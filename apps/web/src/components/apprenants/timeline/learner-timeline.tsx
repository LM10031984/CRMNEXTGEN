import Link from 'next/link';
import { TimelineYearMarker } from './timeline-year-marker';
import { TimelineSessionCard, type TimelineSessionCardData } from './timeline-session-card';

/**
 * Phase 9.1 Plan 04 — Timeline verticale par année (fiche apprenant).
 *
 * UI-SPEC §"LearnerTimeline" :
 *  - Itère sur `groups` (Map ordonnée desc — fourni par caller via groupParticipationsByYear).
 *  - Chaque groupe : TimelineYearMarker + N × TimelineSessionCard.
 *  - Empty state : "Aucune session suivie" + CTA "Inscrire à une session →".
 *  - Sticky-left rail desktop : ici on délègue le styling responsive aux sous-composants
 *    pour rester Server Component (cf. wireframe UI-SPEC).
 */

export interface LearnerTimelineGroup {
  year: number;
  sessions: TimelineSessionCardData[];
}

interface Props {
  groups: LearnerTimelineGroup[];
  /** ID de l'apprenant pour le CTA Empty state (lien vers inscription). */
  personHrefForEmpty?: string;
}

export function LearnerTimeline({ groups, personHrefForEmpty }: Props) {
  if (groups.length === 0) {
    return (
      <section
        id="timeline"
        className="rounded-2xl border border-dashed border-border bg-white p-8 text-center"
      >
        <p className="font-semibold text-foreground mb-1">Aucune session suivie</p>
        <p className="text-sm text-muted-foreground mb-4">
          Cet apprenant n&apos;est inscrit dans aucune session formée.
        </p>
        {personHrefForEmpty && (
          <Link
            href={personHrefForEmpty as any}
            className="inline-block text-sm text-primary hover:underline"
          >
            Inscrire à une session →
          </Link>
        )}
      </section>
    );
  }

  return (
    <section id="timeline" className="space-y-2">
      {groups.map((g) => (
        <div key={g.year}>
          <TimelineYearMarker year={g.year} sessionsCount={g.sessions.length} />
          <div className="space-y-3 sm:pl-8 sm:border-l-2 sm:border-primary/30 sm:ml-3">
            {g.sessions.map((s) => (
              <TimelineSessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
