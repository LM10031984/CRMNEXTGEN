'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, Settings, User as UserIcon } from 'lucide-react';
import type { User } from 'lucia';
import { logoutAction } from '@/app/login/actions';

/**
 * Bouton menu utilisateur dans la TopBar (style SaaS Premium).
 * Avatar avec initiales (gradient bleu marine), nom + chevron, dropdown radix.
 *
 * Le `logout` est un form action native — pas besoin de useTransition,
 * le browser navigue après le redirect côté serveur.
 */

interface UserMenuButtonProps {
  user: User;
}

function initials(firstName?: string, lastName?: string): string {
  const a = (firstName ?? '').trim().charAt(0).toUpperCase();
  const b = (lastName ?? '').trim().charAt(0).toUpperCase();
  return (a + b) || '?';
}

export function UserMenuButton({ user }: UserMenuButtonProps) {
  const fn = (user as User & { firstName?: string }).firstName ?? '';
  const ln = (user as User & { lastName?: string }).lastName ?? '';
  const email = (user as User & { email?: string }).email ?? '';
  const name = [fn, ln].filter(Boolean).join(' ') || email || 'Utilisateur';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="
            inline-flex items-center gap-2 h-10 pl-1.5 pr-2.5 rounded-xl
            text-slate-700
            transition-all duration-200 ease-in-out
            hover:bg-slate-100/80
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200
          "
          aria-label="Menu utilisateur"
        >
          <span
            className="
              inline-flex items-center justify-center h-7 w-7 rounded-full
              bg-gradient-to-br from-primary via-primary-600 to-primary-800 text-white
              text-[11px] font-bold shadow-soft ring-1 ring-white/20
            "
          >
            {initials(fn, ln)}
          </span>
          <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">{fn || name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="
            z-50 min-w-[240px] rounded-2xl bg-white p-1.5
            ring-1 ring-slate-200/70 shadow-card-hover
            animate-in fade-in zoom-in-95 duration-150
          "
        >
          {/* En-tête : nom + email */}
          <div className="px-3 py-2.5 mb-1 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
            {email && <div className="text-xs text-slate-500 truncate mt-0.5">{email}</div>}
          </div>

          <DropdownMenu.Item asChild>
            <Link
              href={'/app/parametres/profil' as any}
              className="
                flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700
                cursor-pointer outline-none
                data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900
                transition-colors
              "
            >
              <UserIcon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              Mon profil
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href={'/app/parametres' as any}
              className="
                flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700
                cursor-pointer outline-none
                data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900
                transition-colors
              "
            >
              <Settings className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              Paramètres
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />

          <form action={logoutAction}>
            <DropdownMenu.Item asChild>
              <button
                type="submit"
                className="
                  w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                  text-red-600 cursor-pointer outline-none
                  data-[highlighted]:bg-red-50
                  transition-colors
                "
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                Se déconnecter
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
