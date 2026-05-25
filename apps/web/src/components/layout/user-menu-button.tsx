'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Settings, LogOut } from 'lucide-react';
import type { User } from 'lucia';
import { logoutAction } from '@/app/login/actions';

/**
 * Avatar utilisateur en TopBar : trigger d'un DropdownMenu contenant
 * Paramètres + Déconnexion. La déconnexion est protégée par un
 * AlertDialog de confirmation (anti-clic accidentel — audit 2026-05-12 UX-02).
 *
 * TopBar reste un Server Component ; ce composant client encapsule tout
 * l'état interactif (state du dropdown + state du Dialog confirmation).
 */
export function UserMenuButton({ user }: { user: User }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 hover:bg-muted rounded-md px-2 py-1 -mr-2 transition-colors"
            aria-label="Menu utilisateur"
          >
            {/* En mobile (< sm), on cache le texte pour économiser de la place ;
                il est rappelé en tête du menu déroulant. */}
            <div className="hidden sm:block text-right text-xs">
              <div className="font-medium leading-tight">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-muted-foreground">{user.role}</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 font-semibold inline-flex items-center justify-center text-sm">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </div>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[220px] rounded-lg border border-border bg-white shadow-xl p-1 animate-in fade-in zoom-in-95"
          >
            <div className="px-3 py-2 border-b border-border sm:hidden">
              <div className="font-medium text-sm">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-muted-foreground">{user.role}</div>
            </div>

            <DropdownMenu.Item asChild>
              <Link
                href="/app/parametres"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm data-[highlighted]:bg-muted"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                Paramètres
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="my-1 h-px bg-border" />

            <DropdownMenu.Item
              onSelect={(e) => {
                // Empêche le DropdownMenu de fermer avant que le Dialog ne s'ouvre
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm text-red-700 data-[highlighted]:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
            <Dialog.Title className="text-lg font-semibold">
              Confirmer la déconnexion
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Tu seras redirigé(e) vers la page de connexion. Toute saisie non
              sauvegardée sera perdue.
            </Dialog.Description>
            <form action={logoutAction} className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Se déconnecter
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
