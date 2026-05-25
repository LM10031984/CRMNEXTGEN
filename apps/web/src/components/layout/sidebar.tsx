'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UserRole } from '@qualiof/db';
import { cn } from '@/lib/utils';
import { ActiveBatchesBadge } from './active-batches-badge';
import { SidebarNav } from './sidebar-nav';
import { NAV, filterNavForRole } from './nav-config';

const STORAGE_KEY = 'qualiof-sidebar-collapsed';

interface SidebarProps {
  /**
   * Rôle de l'utilisateur courant. Reçu en prop (string sérialisable) plutôt que
   * la nav pré-filtrée, pour ne PAS traverser la frontière RSC→Client avec les
   * références de fonctions Lucide contenues dans `NavItem.icon` (cf. debug
   * `dashboard-rsc-icon-prop` 2026-05-16). `NAV` est importé localement (bundle
   * client) puis filtré ici via `filterNavForRole`.
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
  const nav = useMemo(() => filterNavForRole(NAV, role), [role]);
  const [collapsed, setCollapsed] = useState(false);

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
        'hidden md:flex shrink-0 border-r border-border bg-white h-screen fixed top-0 left-0 z-30 flex-col transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'border-b border-border flex items-center',
          collapsed ? 'px-3 py-5 justify-center' : 'px-6 py-5',
        )}
      >
        <Link href="/app" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center shrink-0">
            Q
          </div>
          {!collapsed && (
            <div>
              <div className="font-semibold text-sm leading-tight">QualiOF</div>
              <div className="text-[11px] text-muted-foreground">Start Academy</div>
            </div>
          )}
        </Link>
      </div>

      {/* Zone scrollable avec gradient en bas pour signaler le contenu coupé */}
      <div className="flex-1 relative overflow-hidden">
        <SidebarNav nav={nav} collapsed={collapsed} />
        {/* Gradient bas — signale que la zone scrolle si contenu débordant */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>

      {/* Badge "génération de pack en cours" — affiché uniquement si batch actif */}
      <ActiveBatchesBadge collapsed={collapsed} />

      <div
        className={cn(
          'border-t border-border flex items-center',
          collapsed ? 'p-2 justify-center' : 'px-6 py-3 justify-between',
        )}
      >
        {!collapsed && (
          <span className="text-[11px] text-muted-foreground">v0.1.0</span>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
