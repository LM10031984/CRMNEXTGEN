'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { SidebarNav } from './sidebar-nav';
import type { NavSection } from './nav-config';

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Sections de navigation déjà filtrées par rôle (D-07). Passées en prop par
   * `MobileMenuButton` qui les reçoit lui-même de `TopBar` (Server Component
   * qui calcule `filterNavForRole(NAV, user.role)` une seule fois dans le layout).
   */
  nav: NavSection[];
}

/**
 * Drawer mobile activé via le bouton hamburger dans la TopBar.
 * Caché >= md par construction (le bouton qui l'ouvre est md:hidden).
 * Réutilise <SidebarNav /> pour ne pas dupliquer la config NAV.
 */
export function MobileNavDrawer({ open, onOpenChange, nav }: MobileNavDrawerProps) {
  const pathname = usePathname();

  // Ferme le drawer automatiquement quand l'utilisateur navigue (clic sur item).
  // Sécurité : si pathname change pour une raison externe (Cmd+K, lien depuis
  // la TopBar, etc.), on ferme aussi.
  useEffect(() => {
    if (open) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex flex-col w-72 max-w-[85vw] bg-white border-r border-border shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Navigation principale</Dialog.Title>

          <div className="border-b border-border flex items-center justify-between px-6 py-5">
            <Link href="/app" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center shrink-0">
                Q
              </div>
              <div>
                <div className="font-semibold text-sm leading-tight">QualiOF</div>
                <div className="text-[11px] text-muted-foreground">Start Academy</div>
              </div>
            </Link>
            <Dialog.Close
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="Fermer le menu"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-hidden">
            <SidebarNav nav={nav} collapsed={false} onNavigate={() => onOpenChange(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
