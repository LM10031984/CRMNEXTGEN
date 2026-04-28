'use client';

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
      { label: 'Inscriptions', href: '/app/inscriptions', icon: ListChecks },
      { label: 'Factures', href: '/app/factures', icon: Receipt },
      { label: 'Leads', href: '/app/leads', icon: Megaphone },
    ],
  },
  {
    items: [{ label: 'Paramètres', href: '/app/parametres', icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-white min-h-screen sticky top-0 flex flex-col">
      <div className="px-6 py-5 border-b border-border">
        <Link href="/app" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            Q
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">QualiOF</div>
            <div className="text-[11px] text-muted-foreground">Start Academy</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV.map((section, sIdx) => (
          <div key={sIdx} className="mb-6">
            {section.title && (
              <div className="px-6 mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5 px-3">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                        active
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-6 py-3 border-t border-border text-[11px] text-muted-foreground">
        v0.1.0 — palier 1
      </div>
    </aside>
  );
}
