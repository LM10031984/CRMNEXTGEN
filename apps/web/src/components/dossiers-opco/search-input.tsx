'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';

/**
 * Recherche full-text avec debounce 300ms — push dans l'URL ?q=...
 * Cumule avec les autres filtres existants (year, opco, status, sort).
 */
export function DossiersOpcoSearchInput({
  placeholder = 'Rechercher apprenant, sponsor, formation…',
}: {
  placeholder?: string;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const initial = sp.get('q') ?? '';
  const [value, setValue] = useState(initial);

  // Sync URL→state si navigation arrière
  useEffect(() => {
    setValue(sp.get('q') ?? '');
  }, [sp]);

  // Debounce 300ms : push URL
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === (sp.get('q') ?? '')) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      router.replace(`${pathname}?${params.toString()}` as any);
    }, 300);
    return () => clearTimeout(t);
  }, [value, sp, pathname, router]);

  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-9 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
          aria-label="Effacer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
