import type { ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Wrapper visuel d'une étape du process Qualiopi sur la fiche session.
 *
 * Présente UN process linéaire en 5 étapes (Création → Préparation →
 * Pendant → Pack fin → Facturation). Chaque step a son numéro, titre,
 * état (done / active / todo / inactive), badge de progression, et CTA.
 *
 * Pas de timeline réelle reliée par un trait — on garde des cards
 * juxtaposées avec un grand numéro à gauche pour lisibilité audit.
 */

export type StepState = 'done' | 'active' | 'todo' | 'inactive';

interface Props {
  number: number;
  title: string;
  state: StepState;
  /** Petit libellé sous le titre (ex: "Process automatique") */
  caption?: string;
  /** Badge à droite du header — état/compteurs. */
  badge?: ReactNode;
  /** CTA principal à droite. */
  action?: ReactNode;
  /** Indicateur Qualiopi affiché en petit. */
  qualiopi?: string;
  children: ReactNode;
}

const STATE_STYLES: Record<
  StepState,
  { ring: string; circle: string; bg: string; titleClass: string }
> = {
  done: {
    ring: 'border-emerald-200',
    circle: 'bg-emerald-500 text-white',
    bg: 'bg-white',
    titleClass: 'text-foreground',
  },
  active: {
    ring: 'border-primary-300 ring-2 ring-primary-100',
    circle: 'bg-primary text-white',
    bg: 'bg-primary-50/30',
    titleClass: 'text-foreground',
  },
  todo: {
    ring: 'border-border',
    circle: 'bg-white text-foreground border border-border',
    bg: 'bg-white',
    titleClass: 'text-foreground',
  },
  inactive: {
    ring: 'border-border',
    circle: 'bg-muted text-muted-foreground border border-border',
    bg: 'bg-white',
    titleClass: 'text-muted-foreground',
  },
};

export function TimelineStep({
  number,
  title,
  state,
  caption,
  badge,
  action,
  qualiopi,
  children,
}: Props) {
  const s = STATE_STYLES[state];
  return (
    <section
      className={cn(
        'rounded-2xl border p-5 sm:p-6 transition-colors',
        s.ring,
        s.bg,
      )}
      aria-labelledby={`step-${number}-title`}
    >
      <header className="flex items-start gap-4 mb-5">
        <div
          className={cn(
            'h-10 w-10 sm:h-11 sm:w-11 rounded-full inline-flex items-center justify-center shrink-0 font-semibold text-sm',
            s.circle,
          )}
          aria-hidden="true"
        >
          {state === 'done' ? <Check className="h-5 w-5" /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id={`step-${number}-title`}
              className={cn('font-semibold text-base sm:text-lg leading-tight', s.titleClass)}
            >
              Étape {number} · {title}
            </h2>
            {badge}
          </div>
          {(caption || qualiopi) && (
            <p className="text-xs text-muted-foreground mt-1">
              {caption}
              {caption && qualiopi ? ' · ' : ''}
              {qualiopi && <span className="font-mono">{qualiopi}</span>}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="ml-0 sm:ml-[3.75rem]">{children}</div>
    </section>
  );
}

/* ── Helpers réutilisables pour les step bodies ─────────────────────── */

export function StepDocRow({
  done,
  pending,
  label,
  count,
  total,
  indic,
}: {
  done?: boolean;
  pending?: boolean;
  label: string;
  count?: number;
  total?: number;
  indic?: string;
}) {
  const showCounter = typeof count === 'number' && typeof total === 'number';
  const allDone = showCounter ? total > 0 && count >= total : Boolean(done);
  const stateNode = pending ? (
    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
  ) : allDone ? (
    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
  ) : (
    <span
      className="h-4 w-4 rounded-full border border-slate-300 shrink-0"
      aria-hidden="true"
    />
  );
  return (
    <li className="flex items-center gap-2 text-sm">
      {stateNode}
      <span className={cn('flex-1 min-w-0', allDone ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        {showCounter && (
          <span className="tabular-nums text-xs ml-1.5">
            ({count}/{total})
          </span>
        )}
      </span>
      {indic && (
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide shrink-0">
          {indic}
        </span>
      )}
    </li>
  );
}
