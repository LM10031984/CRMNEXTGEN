import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Badge SaaS Premium — pastilles statut style Stripe/Linear/Vercel.
 *
 *  - `rounded-full` (pill) pour identification rapide
 *  - Fond pastel `bg-{color}-50` + ring `ring-1 ring-{color}-200` pour profondeur
 *  - `text-xs font-semibold px-2.5 py-0.5` — lisible et marqué
 */

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary';

const variants: Record<Variant, string> = {
  default: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  info: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  muted: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  primary: 'bg-primary-50 text-primary-700 ring-1 ring-primary-100',
};

export function Badge({
  children,
  variant = 'default',
  className,
  title,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none whitespace-nowrap',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
