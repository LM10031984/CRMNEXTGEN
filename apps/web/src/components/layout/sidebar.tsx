'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActiveBatchesBadge } from './active-batches-badge';
import { SidebarNav } from './sidebar-nav';
import { NAV, filterNavForRole } from './nav-config';
import type { UserRole } from '@qualiof/db';

const STORAGE_KEY = 'qualiof-sidebar-collapsed';

interface SidebarProps {
  /**
   * Rôle de l'utilisateur — la sidebar filtre NAV elle-même côté client.
   * On ne peut PAS passer un tableau d'items contenant des `icon` (React
   * components Lucide) à travers la frontière Server→Client : les fonctions
   * ne sont pas sérialisables. Donc on passe juste le rôle (string).
   */
  role: UserRole;
}

/**
 * Sidebar desktop (hidden < md, visible >= md). Pour mobile, voir <MobileNavDrawer>
 * activé par <MobileMenuButton> dans la TopBar.
 *
 * État `collapsed` (largeur 256/64 px) persiste dans localStorage.
 * Le rendu de la nav est délégué à <SidebarNav> qui consomme la prop `nav`.
 */
export function Sidebar({ role }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const nav = filterNavForRole(NAV, role);

  // Hydrate l'état depuis localStorage côté client (SSR ne le voit pas)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // ignore
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'hidden md:flex shrink-0 bg-slate-50/80 h-screen fixed top-0 left-0 z-30 flex-col transition-[width] duration-200 ease-in-out',
        // Bordure 1px gris très clair côté droit — invisible mais sépare net du contenu.
        'border-r border-slate-200/60',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* Header logo — pas de border-bottom, l'aération suffit */}
      <div
        className={cn(
          'flex items-center',
          collapsed ? 'px-3 py-5 justify-center' : 'px-5 py-5',
        )}
      >
        <Link href="/app" className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary via-primary-600 to-primary-800 text-white font-bold inline-flex items-center justify-center shrink-0 shadow-card ring-1 ring-white/20 transition-all duration-200 group-hover:scale-105 group-hover:shadow-card-hover">
            Q
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight text-slate-900">QualiOF</div>
              <div className="text-[11px] text-slate-500">Start Academy</div>
            </div>
          )}
        </Link>
      </div>

      {/* Zone scrollable avec gradient en bas pour signaler le contenu coupé */}
      <div className="flex-1 relative overflow-hidden">
        <SidebarNav nav={nav} collapsed={collapsed} />
        {/* Gradient bas — signale que la zone scrolle si contenu débordant */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50/80 to-transparent" />
      </div>

      {/* Badge "génération de pack en cours" — affiché uniquement si batch actif */}
      <ActiveBatchesBadge collapsed={collapsed} />

      {/* Footer collapse toggle — pas de border, séparation via espacement */}
      <div
        className={cn(
          'flex items-center',
          collapsed ? 'p-2 justify-center' : 'px-5 py-3 justify-between',
        )}
      >
        {!collapsed && (
          <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400">v0.1.0</span>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white hover:shadow-soft transition-all duration-200"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
