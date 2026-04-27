import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}

export function Pagination({ total, page, pageSize, basePath, searchParams = {} }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages === 1) return null;

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v) params.set(k, v);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-1">
      <div className="text-xs text-muted-foreground">
        Affichage <span className="font-medium text-foreground">{start}–{end}</span> sur{' '}
        <span className="font-medium text-foreground">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={buildHref(Math.max(1, page - 1)) as never}
          aria-disabled={page === 1}
          className={cn(
            'inline-flex h-8 items-center gap-1 px-2.5 rounded-md text-xs font-medium border border-border bg-white hover:bg-muted/40 transition-colors',
            page === 1 && 'opacity-50 pointer-events-none',
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Préc.
        </Link>
        <span className="text-xs text-muted-foreground px-2">
          page {page} / {totalPages}
        </span>
        <Link
          href={buildHref(Math.min(totalPages, page + 1)) as never}
          aria-disabled={page === totalPages}
          className={cn(
            'inline-flex h-8 items-center gap-1 px-2.5 rounded-md text-xs font-medium border border-border bg-white hover:bg-muted/40 transition-colors',
            page === totalPages && 'opacity-50 pointer-events-none',
          )}
        >
          Suiv. <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
