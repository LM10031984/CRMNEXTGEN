'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Wrapper visuel d'une étape du process Qualiopi sur la fiche session.
 *
 * Commit ui-c 2026-06-05 / A4 2026-06-09 — collapse/expand :
 *   - `expanded` (default **false** depuis A4) — valeur INITIALE, dérivée par
 *     la page depuis sessionStage().stagesState[N] === 'active' (jamais
 *     d'index en dur). Le default `false` est l'invariant A4 : seule l'étape
 *     active s'ouvre, les passées/futures restent repliées. Si un consumer
 *     oublie la prop, on retombe sur "replié" — plus safe qu'un opening en
 *     cascade.
 *   - L'utilisateur peut toggler manuellement en cliquant le header. Cette
 *     interaction "open" est distincte de l'état "active" du helper :
 *     ouvrir l'étape 1 ne la fait PAS paraître active (le visuel state
 *     reste 'done'/'todo' selon stagesState).
 *
 *   - `blockerMessage` (optionnel) — rendu en encart rouge sur l'étape
 *     concernée pour expliquer pourquoi ça coince. Forcé visible même quand
 *     le step est replié (l'utilisateur doit voir le pourquoi).
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
  /** Indicateur Qualiopi affiché en petit (titre hover, plus dans le flux). */
  qualiopi?: string;
  /** État initial d'expansion (true = body visible). Dérivé par la page. */
  expanded?: boolean;
  /** Message bloqueur remonté par sessionStage().blocker — visible même replié. */
  blockerMessage?: string;
  children: ReactNode;
}

const STATE_STYLES: Record<
  StepState,
  { ring: string; circle: string; bg: string; titleClass: string; captionClass: string }
> = {
  done: {
    ring: 'border-emerald-200',
    circle: 'bg-emerald-500 text-white',
    bg: 'bg-white',
    titleClass: 'text-foreground',
    captionClass: 'text-emerald-700',
  },
  active: {
    ring: 'border-primary-300 ring-2 ring-primary-100',
    circle: 'bg-primary text-white',
    bg: 'bg-primary-50/30',
    titleClass: 'text-foreground',
    captionClass: 'text-primary-700',
  },
  todo: {
    ring: 'border-border',
    circle: 'bg-white text-foreground border border-border',
    bg: 'bg-white/60',
    titleClass: 'text-muted-foreground',
    captionClass: 'text-muted-foreground',
  },
  inactive: {
    ring: 'border-border',
    circle: 'bg-muted text-muted-foreground border border-border',
    bg: 'bg-white/60',
    titleClass: 'text-muted-foreground',
    captionClass: 'text-muted-foreground',
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
  expanded = false,
  blockerMessage,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(expanded);

  // Resync si la prop change (re-rendu après mutation server).
  // L'état utilisateur est écrasé — acceptable car la page boot prime sur le clic.
  useEffect(() => {
    setIsOpen(expanded);
  }, [expanded]);

  const s = STATE_STYLES[state];
  const headerId = `step-${number}-title`;
  const bodyId = `step-${number}-body`;

  return (
    <section
      className={cn(
        'rounded-2xl border transition-colors overflow-hidden',
        s.ring,
        s.bg,
      )}
      aria-labelledby={headerId}
    >
      {/* Header cliquable (toggle expand/collapse). Le visuel state vient
          de la prop `state` (dérivée du helper), PAS de isOpen. */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="w-full p-5 sm:p-6 flex items-start gap-4 text-left hover:bg-muted/10 transition-colors"
      >
        <div
          className={cn(
            'h-10 w-10 sm:h-11 sm:w-11 rounded-full inline-flex items-center justify-center shrink-0 font-semibold text-sm',
            s.circle,
          )}
          aria-hidden="true"
          title={qualiopi}
        >
          {state === 'done' ? <Check className="h-5 w-5" /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id={headerId}
              className={cn('font-semibold text-base sm:text-lg leading-tight', s.titleClass)}
            >
              Étape {number} · {title}
            </h2>
            {badge}
          </div>
          {caption && (
            <p className={cn('text-xs mt-1', s.captionClass)}>{caption}</p>
          )}
        </div>
        {action && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{action}</div>}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Encart bloqueur — visible MÊME quand replié (l'utilisateur doit
          voir pourquoi ça coince sans avoir à cliquer). */}
      {blockerMessage && (
        <div className="mx-5 sm:mx-6 mb-4 -mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-amber-900 font-medium">{blockerMessage}</p>
        </div>
      )}

      {/* Body — replié si !isOpen */}
      {isOpen && (
        <div id={bodyId} className="px-5 sm:px-6 pb-5 sm:pb-6 ml-0 sm:ml-[3.75rem]">
          {children}
        </div>
      )}
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
  pdfHref,
}: {
  done?: boolean;
  pending?: boolean;
  label: string;
  count?: number;
  total?: number;
  indic?: string;
  /**
   * A8 2026-06-09 — Lien PDF du doc. Si fourni ET le row est `done`,
   * la ligne devient un anchor cliquable « Ouvrir le PDF » (target=_blank).
   * Si absent ou pas done, la ligne reste non-interactive (affordance honnête).
   * Bug Laurent runtime SES-0093 : « dans les onglets étape 1/2 je ne peux pas
   * cliquer et ouvrir les docs ». StepDocRow ressemblait à un lien sans en
   * être un. Pour les rows agrégés par stagiaire (count/total partiel), on
   * laisse non-cliquable — un lien aggrégé serait trompeur, le DocDockDrawer
   * reste le hub per-stagiaire.
   */
  pdfHref?: string;
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

  const inner = (
    <>
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
        <span
          className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wide shrink-0"
          title={indic}
        >
          {indic}
        </span>
      )}
    </>
  );

  if (allDone && pdfHref) {
    return (
      <li>
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          title={`Ouvrir ${label}`}
          className="group flex items-center gap-2 text-sm rounded-md -mx-1.5 px-1.5 py-1 hover:bg-emerald-50/50 transition-colors"
        >
          {inner}
          <ExternalLink
            className="h-3 w-3 shrink-0 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        </a>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      {inner}
    </li>
  );
}
