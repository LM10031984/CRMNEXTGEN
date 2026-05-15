'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { MobileNavDrawer } from './mobile-nav-drawer';
import type { NavSection } from './nav-config';

interface MobileMenuButtonProps {
  /** Sections de navigation déjà filtrées par rôle (D-07), transmises au drawer. */
  nav: NavSection[];
}

/**
 * Bouton hamburger affiché dans la TopBar, visible uniquement en < md.
 * Encapsule le state du drawer pour que la TopBar puisse rester un
 * Server Component (le state est interne à ce composant client).
 */
export function MobileMenuButton({ nav }: MobileMenuButtonProps) {
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
      <MobileNavDrawer open={open} onOpenChange={setOpen} nav={nav} />
    </>
  );
}
