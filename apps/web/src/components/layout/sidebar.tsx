'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Building2,
  GraduationCap,
  BookOpen,
  FileText,
  Calendar,
  Receipt,
  Megaphone,
  Settings,
  LayoutDashboard,
  ListChecks,
  Landmark,
  ClipboardCheck,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    items: [{ label: 'Tableau de bord', href: '/app', icon: LayoutDashboard }],
  },
  {
    title: 'Base contacts',
    items: [
      { label: 'Apprenants', href: '/app/apprenants', icon: Users },
      { label: 'Organisations', href: '/app/organisations', icon: Building2 },
      { label: 'Formateurs', href: '/app/formateurs', icon: GraduationCap },
    ],
  },
  {
    title: 'Bibliothèque',
    items: [
      { label: 'Produits de formation', href: '/app/produits', icon: BookOpen },
      { label: 'Modèles de documents', href: '/app/templates', icon: FileText },
    ],
  },
  {
    title: 'Référentiels',
    items: [
      { label: 'Financeurs', href: '/app/financeurs', icon: Landmark },
    ],
  },
  {
    title: 'Activité',
    items: [
      { label: 'Sessions', href: '/app/sessions', icon: Calendar },
      { label: 'Pré-inscriptions', href: '/app/preinscriptions', icon: Inbox },
      { label: 'Inscriptions', href: '/app/inscriptions', icon: ListChecks },
      { label: 'Dossiers OPCO', href: '/app/dossiers-opco', icon: ClipboardCheck },
      { label: 'Factures', href: '/app/factures', icon: Receipt },
      { label: 'Leads', href: '/app/leads', icon: Megaphone },
    ],
  },
  {
    items: [{ label: 'Paramètres', href: '/app/parametres', icon: Settings }],
  },
];

const STORAGE_KEY = 'qualiof-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate l'état depuis localStorage côté client (SSR ne le voit pas)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // ignore (Safari incognito etc.)
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
        'shrink-0 border-r border-border bg-white h-screen fixed top-0 left-0 z-30 flex flex-col transition-[width] duration-200',
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
        <nav className="h-full overflow-y-auto py-4 pb-10">
          {NAV.map((section, sIdx) => (
            <div key={sIdx} className="mb-6">
              {section.title && !collapsed && (
                <div className="px-6 mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {section.title}
                </div>
              )}
              <ul className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
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
            </div>
          ))}
        </nav>
        {/* Gradient bas — signale que la zone scrolle si contenu débordant */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>

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
