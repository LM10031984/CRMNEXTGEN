import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompletenessField, CompletenessResult } from '@/lib/learner-completeness';

const CATEGORY_LABELS: Record<CompletenessField['category'], string> = {
  identite: 'Identité',
  contact: 'Contact',
  adresse: 'Adresse',
  pro: 'Profil professionnel',
  agefice: 'AGEFICE / OPCO',
};

/**
 * Badge complétude apprenant. Audit 2026-05-12 UX-09 :
 * la liste des champs manquants est visible DIRECTEMENT (chips inline),
 * sans clic d'expansion supplémentaire (auparavant cachée derrière un toggle).
 */
export function LearnerCompletenessBadge({ result }: { result: CompletenessResult }) {
  const { percent, missing } = result;

  const tone =
    percent >= 90
      ? { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2, chip: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
      : percent >= 60
      ? { bar: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle, chip: 'bg-amber-100 text-amber-900 border-amber-300' }
      : { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle, chip: 'bg-red-100 text-red-800 border-red-300' };

  const Icon = tone.icon;

  // Regroupe les champs manquants par catégorie pour un affichage compact lisible
  const missingByCat = missing.reduce<Record<string, CompletenessField[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
  const categoriesOrdered = (Object.keys(missingByCat) as CompletenessField['category'][]).sort();

  return (
    <section className={cn('rounded-2xl border p-4', tone.bg, tone.border)}>
      <div className="flex items-center gap-3">
        <Icon className={cn('h-5 w-5 shrink-0', tone.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-semibold tabular-nums', tone.text)}>
              {percent}% complète
            </span>
            {missing.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                · {missing.length} champ{missing.length > 1 ? 's' : ''} à renseigner
              </span>
            ) : (
              <span className="text-xs text-emerald-700">· Toutes les infos sont là</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/60 overflow-hidden mt-1.5">
            <div
              className={cn('h-full rounded-full transition-all', tone.bar)}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {categoriesOrdered.flatMap((cat) =>
            missingByCat[cat]!.map((f) => (
              <span
                key={f.key}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border',
                  tone.chip,
                )}
                title={`${CATEGORY_LABELS[cat]} — ${f.label}`}
              >
                <span className="opacity-60 text-[9px] uppercase tracking-wider">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="font-medium">{f.label}</span>
              </span>
            )),
          )}
        </div>
      )}
    </section>
  );
}
