import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'warning' | 'success';
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'default' }: Props) {
  const toneClasses = {
    default: 'bg-white border-border',
    warning: 'bg-amber-50 border-amber-200',
    success: 'bg-emerald-50 border-emerald-200',
  };
  const iconBg = {
    default: 'bg-primary-50 text-primary-700',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className={cn('rounded-2xl border p-5 transition-shadow hover:shadow-sm', toneClasses[tone])}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
          <div className="text-3xl font-semibold mt-1.5 tabular-nums">{value}</div>
        </div>
        <div className={cn('h-9 w-9 rounded-lg inline-flex items-center justify-center', iconBg[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-3">{hint}</div>}
    </div>
  );
}
