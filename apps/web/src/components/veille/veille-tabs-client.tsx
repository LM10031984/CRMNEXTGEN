'use client';

/**
 * Onglets URL state veille (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * 4 onglets thématiques (INDIC_23/24/25/26) + 1 onglet inbox conditionnel.
 *
 * D-03 (CONTEXT) — LECTEUR strictement masqué pour l'inbox :
 *  - Le bouton inbox n'est PAS RENDU si `canSeeInbox=false` (pas juste `disabled`).
 *  - Le prop est piloté côté serveur via `shouldShowInbox(user)` — defense-in-depth.
 *
 * Pattern URL state cohérent Phase 9.1 `product-tabs.tsx` (sans Link — useRouter
 * pour reset filtres quand on change de thème).
 *
 * A11y (UI-SPEC §A11y) :
 *  - `<nav role="tablist" aria-label="Onglets veille Qualiopi">`
 *  - Chaque tab : `role="tab" aria-selected aria-controls={tabpanel-id}`
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  activeTab: string;
  canSeeInbox: boolean;
  inboxCount: number;
}

const THEME_TABS = [
  { id: 'indic_23', label: '23 — Formation pro' },
  { id: 'indic_24', label: '24 — Secteur immobilier' },
  { id: 'indic_25', label: '25 — Innovations péda' },
  { id: 'indic_26', label: '26 — Handicap & DREETS' },
] as const;

export function VeilleTabsClient({
  activeTab,
  canSeeInbox,
  inboxCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const setTab = (id: string) => {
    const params = new URLSearchParams(sp?.toString() ?? '');
    params.set('tab', id);
    // Reset filtres thématiques quand on change d'onglet (preserve uniquement ?q)
    if (id !== activeTab) {
      params.delete('responsable');
      params.delete('freq');
    }
    router.push(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <nav
      className="flex items-center gap-1 border-b border-border overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0"
      role="tablist"
      aria-label="Onglets veille Qualiopi"
    >
      {THEME_TABS.map((t) => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`veille-panel-${t.id}`}
            id={`veille-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors',
              isActive
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        );
      })}

      {/* D-03 : Strictement NON RENDU pour LECTEUR — server filtre via prop canSeeInbox */}
      {canSeeInbox && (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inbox'}
          aria-controls="veille-panel-inbox"
          id="veille-tab-inbox"
          onClick={() => setTab('inbox')}
          className={cn(
            'px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ml-auto flex items-center gap-1.5',
            activeTab === 'inbox'
              ? 'border-amber-500 text-amber-700 font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Inbox className="h-4 w-4" aria-hidden="true" />
          Inbox
          {inboxCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-1.5 py-0.5 font-medium">
              {inboxCount}
            </span>
          )}
        </button>
      )}
    </nav>
  );
}
