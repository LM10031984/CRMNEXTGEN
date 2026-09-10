'use client';

/**
 * En-tête de colonne cliquable, partagé par toutes les listes triables.
 *
 * Né dans `components/dossiers-opco/` (Phase 9), généralisé le 2026-09-10 quand
 * la liste des factures a demandé le même geste : deux tris qui ne se
 * comportent pas pareil dans la même application, c'est une friction gratuite.
 *
 * L'état vit dans l'URL (`?sort=&dir=`), pas dans un `useState` : le classement
 * survit à un rafraîchissement, se copie-colle et se partage.
 *
 * Cycle : asc → desc → retour au classement par défaut.
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

interface Props {
  /** Valeur posée dans `?sort=` — la page décide de ce qu'elle en fait. */
  sortKey: string;
  children: React.ReactNode;
  className?: string;
}

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
    // Changer de classement remet à la première page : rester page 3 après un
    // nouveau tri afficherait un extrait du milieu, sans rapport avec le clic.
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}` as never);
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
        aria-label={`Trier par ${typeof children === 'string' ? children : sortKey}`}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          isActive && 'text-primary',
        )}
      >
        {children}
        <Icon className="h-3 w-3" aria-hidden="true" />
      </button>
    </th>
  );
}
