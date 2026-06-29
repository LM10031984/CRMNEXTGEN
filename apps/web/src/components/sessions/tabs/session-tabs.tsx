'use client';

import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Phase 15 Lot 1 (15-01) — Coquille à 5 onglets de la fiche session.
 *
 * Conteneur CLIENT (approche C, cf. 15-RESEARCH §Architecture Patterns) :
 *  - lit l'onglet actif dans l'URL via `useSearchParams().get('tab')` (deep-link
 *    partageable + survie au `router.refresh()` que déclenchent les générations
 *    de docs : l'onglet est relu depuis l'URL après le refresh) ;
 *  - reçoit les 5 sections PRÉ-RENDUES en props par la page RSC (qui garde toutes
 *    ses requêtes Prisma) — aucun recalcul d'état ici ;
 *  - navigue par `window.history.pushState` → 0 round-trip serveur, 0 refetch ;
 *  - panneaux MONTÉS mais `hidden` pour les inactifs (switch instantané ; pas de
 *    `{active && ...}` qui démonterait — cf. 15-RESEARCH §Anti-Patterns).
 *
 * PAS de `<Link>` (déclencherait un refetch RSC complet de la page lourde).
 *
 * A11y reprise de `ProductTabs` (UI-SPEC §A11y Contract — role=tablist/role=tab +
 * aria-selected + aria-controls).
 *
 * Lot 1 = structure seulement : les panneaux ENVELOPPENT les blocs EXISTANTS de
 * `page.tsx` sans en modifier le contenu (le réembarquement propre = Lot 2).
 */

export const SESSION_TABS = [
  { id: 'session', label: 'Session' },
  { id: 'avant', label: 'Avant la formation' },
  { id: 'apres', label: 'Après la formation' },
  { id: 'docs', label: 'Tous les documents' },
  { id: 'agenda', label: 'Agenda' },
] as const;

export type SessionTabId = (typeof SESSION_TABS)[number]['id'];

/** Valide `raw` contre les 5 ids connus ; fallback `'session'` (onglet par défaut). */
export function coerceTab(raw: string | undefined): SessionTabId {
  return SESSION_TABS.some((t) => t.id === raw) ? (raw as SessionTabId) : 'session';
}

interface Props {
  defaultTab: SessionTabId;
  session: React.ReactNode;
  avant: React.ReactNode;
  apres: React.ReactNode;
  docs: React.ReactNode;
  agenda: React.ReactNode;
}

export function SessionTabs({ defaultTab, session, avant, apres, docs, agenda }: Props) {
  const sp = useSearchParams();
  // Onglet actif = URL si présente/valide, sinon le défaut serveur (deep-link).
  const active = coerceTab(sp?.get('tab') ?? defaultTab);

  function go(id: SessionTabId) {
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (id === 'session') {
      params.delete('tab'); // défaut = URL propre, cohérent avec ProductTabs
    } else {
      params.set('tab', id);
    }
    const qs = params.toString();
    // pushState : met à jour l'URL SANS re-rendre le RSC (0 round-trip, 0 refetch).
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname);
  }

  const panels: Record<SessionTabId, React.ReactNode> = {
    session,
    avant,
    apres,
    docs,
    agenda,
  };

  return (
    <>
      <nav
        role="tablist"
        aria-label="Onglets fiche session"
        className="border-b border-border flex overflow-x-auto"
      >
        {SESSION_TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => go(t.id)}
              className={cn(
                'px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      {SESSION_TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`tab-panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
        >
          {panels[t.id]}
        </div>
      ))}
    </>
  );
}
