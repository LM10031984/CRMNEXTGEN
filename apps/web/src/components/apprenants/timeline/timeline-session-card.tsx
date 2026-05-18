import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatFunderCode } from '@/lib/funder-codes';

/**
 * Phase 9.1 Plan 04 — Card session cliquable dans la timeline.
 *
 * UI-SPEC §"LearnerTimeline > TimelineSessionCard" + §"A11y" :
 *  - `<Link>` href vers `/app/sessions/{id}` (D-05 cross-nav).
 *  - aria-label : "Voir la session {productTitle} du {date}".
 *  - Title, date range FR, hours chip, funder chip (formatFunderCode),
 *    docs ratio `●●●○○ N/M docs Qualiopi`.
 *  - Hover lift : `hover:shadow-md hover:border-primary-200 transition-all`.
 *  - Session annulée : opacité + badge "Annulée".
 */

export interface TimelineSessionCardData {
  id: string;
  productTitle: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  durationHours: number;
  funderCode?: string | null;
  cancelled?: boolean;
  docsFilled: number;
  docsTotal: number;
}

interface Props {
  session: TimelineSessionCardData;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return dateFmt.format(date);
}

function fmtDateRange(start: Date | string, end?: Date | string | null): string {
  const sd = typeof start === 'string' ? new Date(start) : start;
  const ed = end ? (typeof end === 'string' ? new Date(end) : end) : null;
  const startStr = dateFmt.format(sd);
  if (!ed) return startStr;
  // Compare day+month+year — if same day, show one date only
  if (
    sd.getFullYear() === ed.getFullYear() &&
    sd.getMonth() === ed.getMonth() &&
    sd.getDate() === ed.getDate()
  ) {
    return startStr;
  }
  return `${startStr} – ${dateFmt.format(ed)}`;
}

export function TimelineSessionCard({ session }: Props) {
  const { id, productTitle, startDate, endDate, durationHours, funderCode, cancelled, docsFilled, docsTotal } =
    session;

  // 5-segment ratio (●●●○○) — count of filled circles out of 5
  const ratio = docsTotal > 0 ? docsFilled / docsTotal : 0;
  const filledCircles = Math.round(ratio * 5);

  return (
    <Link
      href={`/app/sessions/${id}` as any}
      aria-label={`Voir la session ${productTitle} du ${fmtDate(startDate)}`}
      className={cn(
        'block rounded-2xl border border-border bg-white p-4 hover:shadow-md hover:border-primary-200 transition-all max-w-2xl',
        cancelled && 'bg-muted/30 opacity-70',
      )}
      id={`session-${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate text-foreground">{productTitle}</p>
          <p className="text-xs text-muted-foreground">
            {fmtDateRange(startDate, endDate)} · {durationHours} h
          </p>
        </div>
        {funderCode && (
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
            {formatFunderCode(funderCode)}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              i < filledCircles ? 'bg-emerald-500' : 'bg-slate-300',
            )}
            aria-hidden
          />
        ))}
        <span className="ml-2 tabular-nums">
          {docsFilled}/{docsTotal} docs Qualiopi
        </span>
      </div>
      {cancelled && (
        <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Annulée
        </span>
      )}
    </Link>
  );
}
