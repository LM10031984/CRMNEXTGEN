import { CreditCard, Building2, FileText, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocsCompletionBadgeProps {
  cni: boolean;
  rib: boolean;
  cfp: boolean;
  /** "compact" pour les tableaux/listes, "full" pour les fiches détail */
  variant?: 'compact' | 'full';
}

/**
 * Badge visuel "X/3 docs reçus" — 3 icônes colorées + compteur.
 *
 * Vert si toutes présentes, ambre si partiel, gris si rien.
 * Mode compact = inline pour listes (40px de haut), mode full pour fiches
 * détail (plus aéré, label + 3 chips).
 */
export function DocsCompletionBadge({
  cni,
  rib,
  cfp,
  variant = 'compact',
}: DocsCompletionBadgeProps) {
  const count = [cni, rib, cfp].filter(Boolean).length;
  const total = 3;
  const tone =
    count === 0
      ? 'muted'
      : count < total
        ? 'partial'
        : 'complete';

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <DocChip kind="CNI" present={cni} icon={CreditCard} />
        <DocChip kind="RIB" present={rib} icon={Building2} />
        <DocChip kind="CFP" present={cfp} icon={FileText} />
        <span
          className={cn(
            'text-[11px] font-semibold tabular-nums ml-1',
            tone === 'complete' && 'text-emerald-700',
            tone === 'partial' && 'text-amber-700',
            tone === 'muted' && 'text-muted-foreground',
          )}
        >
          {count}/{total}
        </span>
      </div>
    );
  }

  // variant === 'full'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            tone === 'complete' && 'text-emerald-700',
            tone === 'partial' && 'text-amber-700',
            tone === 'muted' && 'text-muted-foreground',
          )}
        >
          {count}/{total} pièces reçues
        </span>
        {tone === 'complete' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
            <Check className="h-3 w-3" /> Complet
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <DocPill kind="Pièce d'identité" present={cni} icon={CreditCard} />
        <DocPill kind="RIB" present={rib} icon={Building2} />
        <DocPill kind="Attestation CFP" present={cfp} icon={FileText} />
      </div>
    </div>
  );
}

function DocChip({
  kind,
  present,
  icon: Icon,
}: {
  kind: string;
  present: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
}) {
  return (
    <span
      title={`${kind} : ${present ? 'reçue' : 'absente'}`}
      className={cn(
        'inline-flex items-center justify-center h-5 w-5 rounded-md',
        present
          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-slate-100 text-slate-300',
      )}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

function DocPill({
  kind,
  present,
  icon: Icon,
}: {
  kind: string;
  present: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
        present
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-slate-50 text-slate-400 border-slate-200',
      )}
    >
      <Icon className="h-3 w-3" />
      {kind}
      {present && <Check className="h-3 w-3" />}
    </span>
  );
}
