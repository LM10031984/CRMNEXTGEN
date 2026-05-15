'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_STORAGE_PREFIX, type NavSection } from './nav-config';

interface SidebarNavProps {
  /**
   * Sections de navigation à rendre. Plan 08-04 (D-07) : passée filtrée par
   * rôle depuis `app/app/layout.tsx` via `filterNavForRole(NAV, user.role)`.
   * Ne plus importer `NAV` directement ici — passer par la prop garantit que
   * tous les renderers (desktop + mobile drawer) partagent la même vue filtrée.
   */
  nav: NavSection[];
  /** True = mode sidebar repliée (icônes seules). False (mobile drawer) = toujours full. */
  collapsed: boolean;
  /** Callback optionnel appelé après clic sur un item (utilisé par mobile drawer pour fermer). */
  onNavigate?: () => void;
}

export function SidebarNav({ nav, collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const next: Record<string, boolean> = {};
      for (const s of nav) {
        if (s.collapsible && s.id) {
          // Auto-déplie si la page courante est dans cette section (sinon l'utilisateur
          // ne verrait pas son emplacement actif).
          const hasActive = s.items.some(
            (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
          );
          const stored = localStorage.getItem(SECTION_STORAGE_PREFIX + s.id);
          next[s.id] = hasActive ? true : stored === '1';
        }
      }
      setSectionOpen(next);
    } catch {
      // ignore (Safari incognito etc.)
    }
  }, [pathname, nav]);

  const toggleSection = (id: string) => {
    setSectionOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(SECTION_STORAGE_PREFIX + id, next[id] ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <nav className="h-full overflow-y-auto py-4 pb-10">
      {nav.map((section, sIdx) => {
        const isCollapsibleSection = section.collapsible && section.id;
        const sectionExpanded = isCollapsibleSection
          ? sectionOpen[section.id!] !== false
          : true;
        const showItems = !isCollapsibleSection || sectionExpanded;
        return (
          <div key={sIdx} className="mb-6">
            {section.title && !collapsed && (
              isCollapsibleSection ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id!)}
                  className="w-full px-6 mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform',
                      sectionExpanded ? 'rotate-0' : '-rotate-90',
                    )}
                  />
                </button>
              ) : (
                <div className="px-6 mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {section.title}
                </div>
              )
            )}
            {showItems && (
              <ul className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
                {section.items.map((item) => {
                  // Pour la racine /app (Tableau de bord), match strict —
                  // sinon startsWith('/app/') activerait Dashboard sur toutes
                  // les pages enfants. Pour les autres, on autorise le prefixe
                  // pour highlighter une fiche detail (/app/sessions/[id]).
                  const active =
                    item.href === '/app'
                      ? pathname === '/app'
                      : pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href as Route}
                        title={collapsed ? item.label : undefined}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg text-sm transition-colors',
                          collapsed ? 'justify-center p-2' : 'px-3 py-2',
                          active
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
