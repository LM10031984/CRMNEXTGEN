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
    <nav className="h-full overflow-y-auto py-3 pb-10">
      {nav.map((section, sIdx) => {
        const isCollapsibleSection = section.collapsible && section.id;
        const sectionExpanded = isCollapsibleSection
          ? sectionOpen[section.id!] !== false
          : true;
        const showItems = !isCollapsibleSection || sectionExpanded;
        return (
          <div key={sIdx} className="mb-5">
            {section.title && !collapsed && (
              isCollapsibleSection ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id!)}
                  className="w-full px-5 mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform duration-200',
                      sectionExpanded ? 'rotate-0' : '-rotate-90',
                    )}
                  />
                </button>
              ) : (
                <div className="px-5 mb-2 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
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
                          'group flex items-center gap-3 rounded-lg text-sm transition-all duration-200 ease-in-out relative',
                          collapsed ? 'justify-center p-2.5' : 'px-3 py-2',
                          active
                            // Active : carte blanche flottante + accent bleu marine + rail gauche.
                            ? 'bg-white text-primary font-semibold shadow-card ring-1 ring-slate-200/60'
                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-soft',
                        )}
                      >
                        {/* Pastille active discrète à gauche (sidebar non-collapsed seulement) */}
                        {active && !collapsed && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" aria-hidden />
                        )}
                        <Icon
                          className={cn(
                            'h-[18px] w-[18px] shrink-0 transition-colors',
                            active ? 'text-primary' : 'text-slate-400 group-hover:text-slate-700',
                          )}
                          strokeWidth={active ? 2.2 : 1.75}
                        />
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
