'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Info, GraduationCap, FileText } from 'lucide-react';

const ICONS = { info: Info, activity: GraduationCap, documents: FileText } as const;
export type LearnerTabIcon = keyof typeof ICONS;

interface Tab {
  key: string;
  label: string;
  iconKey: LearnerTabIcon;
  badge?: number;
  /** Tooltip natif sur le badge — précise le sens du chiffre (audit UX-07). */
  badgeTitle?: string;
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
          const Icon = ICONS[t.iconKey];
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
                  title={t.badgeTitle}
                  aria-label={t.badgeTitle}
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

