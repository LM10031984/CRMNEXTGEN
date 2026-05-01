'use client';

import { useState } from 'react';
import { ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompletenessField, CompletenessResult } from '@/lib/learner-completeness';

const CATEGORY_LABELS: Record<CompletenessField['category'], string> = {
  identite: 'Identité',
  contact: 'Contact',
  adresse: 'Adresse',
  pro: 'Profil professionnel',
  agefice: 'AGEFICE / OPCO',
};

export function LearnerCompletenessBadge({ result }: { result: CompletenessResult }) {
  const [open, setOpen] = useState(false);
  const { percent, missing } = result;

  const tone =
    percent >= 90
      ? { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 }
      : percent >= 60
      ? { bar: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle }
      : { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle };

  const Icon = tone.icon;

  // Regroupe les champs manquants par catégorie pour un affichage plus lisible
  const missingByCat = missing.reduce<Record<string, CompletenessField[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <section className={cn('rounded-2xl border p-4', tone.bg, tone.border)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 w-full text-left"
        aria-expanded={open}
      >
        <Icon className={cn('h-5 w-5 shrink-0', tone.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-semibold tabular-nums', tone.text)}>
              {percent}% complète
            </span>
            {missing.length > 0 && (
              <span className="text-xs text-muted-foreground">
                · {missing.length} champ{missing.length > 1 ? 's' : ''} à renseigner
              </span>
            )}
            {missing.length === 0 && (
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
        {missing.length > 0 && (
          <ChevronDown
            className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', open && 'rotate-180')}
          />
        )}
      </button>

      {open && missing.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/60 space-y-3">
          {(Object.entries(missingByCat) as Array<[CompletenessField['category'], CompletenessField[]]>).map(([cat, fields]) => (
            <div key={cat}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {CATEGORY_LABELS[cat]}
              </div>
              <ul className="space-y-1">
                {fields.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-sm">
                    <span className="h-1 w-1 rounded-full bg-current opacity-40" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
