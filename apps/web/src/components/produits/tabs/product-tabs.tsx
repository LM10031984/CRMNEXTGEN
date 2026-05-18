'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Phase 9.1 Plan 09.1-05 Task 2 — Onglets fiche produit (compound).
 *
 * Pattern URL state cf. UI-SPEC §"Component Contracts > ProductTabs" :
 *  - 4 tabs Stats / Sessions / Apprenants formés / Programme
 *  - Navigation via `<Link href="?tab=…">` (pas de client state)
 *  - Active state lu via `useSearchParams().get('tab')` côté client (cohérence
 *    affichage instantané), mais le panel rendu reste piloté par le Server
 *    Component parent qui lit `searchParams?.tab` (Plan 09.1-05 Task 3).
 *
 * A11y (UI-SPEC §A11y Contract — role=tab + aria-selected + aria-controls) :
 *  - `<nav role="tablist" aria-label="Onglets fiche produit">`
 *  - Chaque tab : `role="tab" aria-selected aria-controls={tabpanel-id}`
 *
 * Pattern repris de `learner-tabs.tsx` (Phase 5 NAV-03 query param `?tab=`).
 */

export const PRODUCT_TABS = [
  { id: 'stats', label: 'Stats' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'apprenants', label: 'Apprenants formés' },
  { id: 'programme', label: 'Programme' },
] as const;

export type ProductTabId = (typeof PRODUCT_TABS)[number]['id'];

interface Props {
  activeTab: ProductTabId;
}

export function ProductTabs({ activeTab }: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();

  return (
    <nav
      className="border-b border-border flex overflow-x-auto"
      role="tablist"
      aria-label="Onglets fiche produit"
    >
      {PRODUCT_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        // Préserve les autres query params éventuels (ex: filtres futurs).
        const params = new URLSearchParams(sp?.toString() ?? '');
        if (tab.id === 'stats') {
          params.delete('tab'); // Stats = tab par défaut, URL plus propre sans ?tab=stats
        } else {
          params.set('tab', tab.id);
        }
        const qs = params.toString();
        const href = `${pathname}${qs ? `?${qs}` : ''}`;

        return (
          <Link
            key={tab.id}
            href={href as any}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tab-panel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={cn(
              'px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors',
              isActive
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
