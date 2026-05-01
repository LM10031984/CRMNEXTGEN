'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Info, GraduationCap, FileText } from 'lucide-react';

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function LearnerTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = sp.get('tab') ?? 'info';

  return (
    <div className="border-b border-border">
      <nav className="flex gap-1 -mb-px">
        {tabs.map((t) => {
          const isActive = active === t.key;
          const Icon = t.icon;
          const params = new URLSearchParams(sp.toString());
          if (t.key === 'info') params.delete('tab');
          else params.set('tab', t.key);
          const href = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
          return (
            <Link
              key={t.key}
              href={href as any}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold',
                    isActive ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export const LEARNER_TAB_ICONS = { Info, GraduationCap, FileText };
