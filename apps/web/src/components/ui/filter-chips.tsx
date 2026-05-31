import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Chip {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

/**
 * FilterChips SaaS Premium — pills style Stripe/Linear/Vercel.
 *
 *  - Inactif : `bg-white ring-1 ring-slate-200 text-slate-700` avec shadow-soft
 *  - Actif : `bg-slate-900 text-white shadow-card` — élévation + ring slate-700
 *  - Hover : translate-y léger pour la sensation de bouton
 *  - Compteur : ring-1 ring-white/20 quand actif, tabular-nums dans tous les cas
 */
export function FilterChips({ chips }: { chips: Chip[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href as never}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold transition-all duration-200',
            chip.active
              ? 'bg-slate-900 text-white shadow-card ring-1 ring-slate-700'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-soft hover:shadow-card hover:ring-slate-300 hover:text-slate-900 hover:-translate-y-0.5',
          )}
        >
          {chip.label}
          {chip.count !== undefined && (
            <span
              className={cn(
                'tabular-nums text-[10px] font-bold rounded-full px-1.5 py-0.5',
                chip.active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              {chip.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
