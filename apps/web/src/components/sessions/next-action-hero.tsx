import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionStage } from '@/lib/sessions/session-stage';

/**
 * Carte "Prochaine action" — point focal de la fiche session V2.
 *
 * Lit depuis sessionStage() (source UNIQUE pour la cohérence header +
 * timeline + drawer). Le CTA principal affiché ici est le MÊME que celui
 * de la barre actions sticky du SessionHeaderBar : même action, juste
 * re-atteignable après scroll. Pas de duplication, juste un mirror.
 *
 * Fond plat teinté (pas de gradient) selon status :
 *   - blocked → ambre (bloqueur à lever)
 *   - active  → primary tint (action à lancer)
 *   - todo    → slate (en attente, pas de CTA)
 *   - done    → emerald (validé)
 */

interface Props {
  stage: SessionStage;
  /** L'utilisateur peut-il déclencher des actions ? Sinon CTA masqué. */
  canWrite: boolean;
  /**
   * Slot optionnel pour les CTA "vrai bouton" (kind='generate_pack' → vrai
   * <GenerateClosurePackButton> qui enqueue BullMQ). Si fourni ET que
   * stage.cta.kind === 'generate_pack', il est rendu à la place du lien anchor.
   * Garantie : même cta.label = même action quel que soit le rendu.
   */
  primaryActionSlot?: ReactNode;
}

const STATE_STYLES = {
  blocked: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />,
    iconBg: 'bg-amber-100',
    captionText: 'text-amber-700',
    captionLabel: 'À débloquer',
    btnClass: 'bg-amber-600 text-white hover:bg-amber-700',
  },
  active: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    icon: <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />,
    iconBg: 'bg-primary text-white',
    captionText: 'text-muted-foreground',
    captionLabel: 'Prochaine action',
    btnClass: 'bg-primary text-white hover:bg-primary-600',
  },
  todo: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: <Clock className="h-5 w-5 text-slate-500" aria-hidden="true" />,
    iconBg: 'bg-slate-100',
    captionText: 'text-muted-foreground',
    captionLabel: 'En attente',
    btnClass: 'bg-white border border-border text-foreground hover:bg-muted/40',
  },
  done: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />,
    iconBg: 'bg-emerald-100',
    captionText: 'text-emerald-700',
    captionLabel: 'Validée',
    btnClass: 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  },
} as const;

export function NextActionHero({ stage, canWrite, primaryActionSlot }: Props) {
  const style = STATE_STYLES[stage.status];

  return (
    <section
      aria-labelledby="next-action-hero-title"
      className={cn(
        'relative rounded-2xl border p-5 sm:p-6',
        style.bg,
        style.border,
      )}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div
          className={cn(
            'h-11 w-11 rounded-xl inline-flex items-center justify-center shrink-0',
            style.iconBg,
          )}
        >
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[11px] uppercase tracking-wider font-semibold mb-1', style.captionText)}>
            Étape {stage.current} · {style.captionLabel}
          </p>
          <h2 id="next-action-hero-title" className="text-lg sm:text-xl font-bold tracking-tight leading-tight">
            {stage.reason}
          </h2>
          {stage.blocker && (
            <p className="text-sm text-amber-800 mt-1 font-medium">{stage.blocker}</p>
          )}
        </div>
        {stage.cta && canWrite && (
          stage.cta.kind === 'generate_pack' && primaryActionSlot ? (
            // Vrai bouton fourni par la page (GenerateClosurePackButton).
            // Pas de styling forcé pour préserver l'apparence du bouton réel.
            <div className="shrink-0">{primaryActionSlot}</div>
          ) : (
            <a
              href={stage.cta.href}
              className={cn(
                'inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold shadow-sm transition-all hover:shadow-md shrink-0',
                style.btnClass,
              )}
            >
              {stage.cta.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )
        )}
      </div>
    </section>
  );
}
