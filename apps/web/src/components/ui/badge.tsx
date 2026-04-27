import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary';

const variants: Record<Variant, string> = {
  default: 'bg-muted text-foreground border-border',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  muted: 'bg-slate-50 text-slate-600 border-slate-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-100',
};

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
