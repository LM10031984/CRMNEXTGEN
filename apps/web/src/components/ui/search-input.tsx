'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { Search, X } from 'lucide-react';

export function SearchInput({ placeholder = 'Rechercher…' }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get('q') ?? '');

  // Debounce 250ms
  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (value) params.set('q', value);
      else params.delete('q');
      params.delete('page');
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}` as Route);
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full max-w-xs">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
        strokeWidth={1.75}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="
          w-full h-10 pl-9 pr-9 rounded-xl
          bg-white text-sm text-slate-900 placeholder:text-slate-400
          ring-1 ring-slate-200 shadow-soft
          transition-all duration-200
          hover:ring-slate-300 hover:shadow-card
          focus:outline-none focus:ring-2 focus:ring-primary-200 focus:shadow-card
        "
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="
            absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md
            inline-flex items-center justify-center
            text-slate-400 hover:text-slate-700 hover:bg-slate-100
            transition-colors
          "
          aria-label="Effacer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
