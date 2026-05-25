'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY_PREFIX = 'qualiof-collapse-';

interface CollapsibleSectionProps {
  /** Identifiant utilisé pour persister l'état dans localStorage. */
  id: string;
  /** Titre affiché à gauche du toggle. */
  title: React.ReactNode;
  /** Sous-titre optionnel (ex: count "10 indicateurs"). */
  subtitle?: React.ReactNode;
  /**
   * Icône optionnelle à gauche du titre.
   *
   * IMPORTANT : doit être un ReactNode déjà instancié (`<MyIcon className="h-4 w-4 ..." />`),
   * pas une référence de composant (`MyIcon`). Ce composant est marqué `'use client'`,
   * et Next.js 14 refuse de sérialiser une fonction-composant à travers la frontière
   * RSC→Client à moins qu'elle ne soit marquée `'use server'`. Le caller (Server Component)
   * est responsable d'appliquer le sizing (`h-4 w-4`), la couleur (`text-muted-foreground`)
   * et `aria-hidden="true"`.
   */
  icon?: React.ReactNode;
  /** Affiché ouvert par défaut (sinon utilise localStorage). */
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Section collapsible avec persistance localStorage.
 * Audit UX-11 : utilisé pour replier les "Indicateurs détaillés" du dashboard
 * sans perdre le réglage de l'utilisateur entre les visites.
 */
export function CollapsibleSection({
  id,
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${id}`;
  const [open, setOpen] = useState(defaultOpen);

  // Hydrate depuis localStorage côté client
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === '1') setOpen(true);
      else if (stored === '0') setOpen(false);
    } catch {
      // ignore (Safari incognito etc.)
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const contentId = `collapsible-content-${id}`;
  const ariaLabel =
    typeof title === 'string'
      ? `${open ? 'Replier' : 'Déplier'} ${title}`
      : open
        ? 'Replier la section'
        : 'Déplier la section';

  return (
    <section className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 text-left mb-3 hover:text-foreground transition-colors group"
      >
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground">
          {title}
        </h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground font-normal normal-case">
            · {subtitle}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground ml-auto transition-transform',
            open ? 'rotate-180' : 'rotate-0',
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={contentId} className="space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}
