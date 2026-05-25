'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortKey = 'date' | 'apprenant' | 'montant' | 'opco';
export type SortDir = 'asc' | 'desc';

interface Props {
  sortKey: SortKey;
  children: React.ReactNode;
  className?: string;
}

/**
 * Header de colonne cliquable. Cycle : asc → desc → reset.
 * Persisté dans URL ?sort=key&dir=asc|desc.
 */
export function SortableTh({ sortKey, children, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const currentSort = sp.get('sort');
  const currentDir = (sp.get('dir') as SortDir | null) ?? null;
  const isActive = currentSort === sortKey;

  function next() {
    const params = new URLSearchParams(sp.toString());
    if (!isActive) {
      params.set('sort', sortKey);
      params.set('dir', 'asc');
    } else if (currentDir === 'asc') {
      params.set('dir', 'desc');
    } else {
      // desc → reset (suppression sort/dir)
      params.delete('sort');
      params.delete('dir');
    }
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  const Icon = !isActive ? ArrowUpDown : currentDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      className={cn(
        'px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground',
        className,
      )}
    >
      <button
        type="button"
        onClick={next}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          isActive && 'text-primary',
        )}
      >
        {children}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}
