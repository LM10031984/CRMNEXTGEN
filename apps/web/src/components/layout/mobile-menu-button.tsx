'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import type { UserRole } from '@qualiof/db';
import { MobileNavDrawer } from './mobile-nav-drawer';

interface MobileMenuButtonProps {
  /**
   * Rôle utilisateur (string sérialisable). Transmis au drawer qui filtre `NAV`
   * lui-même côté client. Évite de sérialiser `NavSection[]` (qui contient des
   * références de fonctions Lucide) à travers la frontière RSC→Client — cf.
   * debug `dashboard-rsc-icon-prop` 2026-05-16.
   */
  role: UserRole;
}

/**
 * Bouton hamburger affiché dans la TopBar, visible uniquement en < md.
 * Encapsule le state du drawer pour que la TopBar puisse rester un
 * Server Component (le state est interne à ce composant client).
 */
export function MobileMenuButton({ role }: MobileMenuButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden -ml-1 p-2 rounded-md hover:bg-muted text-foreground"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <MobileNavDrawer open={open} onOpenChange={setOpen} role={role} />
    </>
  );
}
