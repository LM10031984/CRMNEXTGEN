'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { MobileNavDrawer } from './mobile-nav-drawer';
import type { UserRole } from '@qualiof/db';

interface MobileMenuButtonProps {
  /** Rôle utilisateur — transmis au drawer qui filtre NAV côté client. */
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
        className="
          md:hidden -ml-1 inline-flex items-center justify-center h-10 w-10 rounded-xl
          text-slate-500 hover:text-slate-900 hover:bg-slate-100/80
          transition-all duration-200 ease-in-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200
        "
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <MobileNavDrawer open={open} onOpenChange={setOpen} role={role} />
    </>
  );
}
