import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Chip {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

export function FilterChips({ chips }: { chips: Chip[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href as never}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-medium transition-colors',
            chip.active
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-foreground border-border hover:bg-muted/40',
          )}
        >
          {chip.label}
          {chip.count !== undefined && (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-semibold',
                chip.active ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
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
