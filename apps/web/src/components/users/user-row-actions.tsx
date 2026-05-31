'use client';

import { useState, useTransition } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import {
  MoreVertical,
  ShieldCheck,
  KeyRound,
  Power,
  PowerOff,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import type { UserRole } from '@qualiof/db';
import {
  disableUser,
  enableUser,
  resetUserPassword,
  resendInvitation,
} from '@/server/actions/tenant-users';
import { ChangeRoleDialog } from './change-role-dialog';

interface UserRowActionsProps {
  userId: string;
  userEmail: string;
  userRole: UserRole;
  /** True si `user.disabledAt != null`. */
  disabled: boolean;
  /** True si c'est l'admin courant (interdit de se désactiver soi-même). */
  isSelf: boolean;
  /** True si l'user n'a jamais connecté → propose "Renvoyer l'invitation". */
  hasNeverLoggedIn: boolean;
}

/**
 * Menu d'actions par ligne utilisateur (Phase 8 Plan 08-04). Pattern projet :
 *  - Radix DropdownMenu pour le menu kebab (3 points verticaux).
 *  - Pour les actions DESTRUCTIVES (disable, reset) → Radix Dialog confirmation
 *    avant l'appel server action (cohérent user-menu-button.tsx).
 *  - Pour les actions NON destructives (enable, resend, change role) → exécution
 *    directe ou Dialog dédié (ChangeRoleDialog).
 *  - useTransition pour ne pas bloquer l'UI pendant l'appel.
 *  - toast sonner success/error.
 *
 * Garde lock-out : si `isSelf && !disabled`, on grise "Désactiver" (le serveur
 * refuse aussi via `disableUser` → `disableUser self-disable refusé`).
 *
 * Server actions consommées (Plan 08-02) :
 *  - disableUser / enableUser / resetUserPassword / resendInvitation
 *  - changeUserRole via le sous-dialog ChangeRoleDialog
 */
export function UserRowActions({
  userId,
  userEmail,
  userRole,
  disabled,
  isSelf,
  hasNeverLoggedIn,
}: UserRowActionsProps) {
  const [pending, startTransition] = useTransition();
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  const handleEnable = () => {
    startTransition(async () => {
      const result = await enableUser(userId);
      if (result.ok) {
        toast.success(`${userEmail} réactivé`);
      } else {
        toast.error(result.error || 'Erreur lors de la réactivation');
      }
    });
  };

  const handleDisableConfirmed = () => {
    startTransition(async () => {
      const result = await disableUser(userId);
      if (result.ok) {
        toast.success(`${userEmail} désactivé`);
        setDisableConfirmOpen(false);
      } else {
        toast.error(result.error || 'Erreur lors de la désactivation');
      }
    });
  };

  const handleResetConfirmed = () => {
    startTransition(async () => {
      const result = await resetUserPassword(userId);
      if (result.ok) {
        toast.success(
          result.data?.dryRun
            ? `Email de réinitialisation préparé (mode dev — non envoyé)`
            : `Email de réinitialisation envoyé à ${userEmail}`,
        );
        setResetConfirmOpen(false);
      } else {
        toast.error(result.error || 'Erreur lors de la réinitialisation');
      }
    });
  };

  const handleResend = () => {
    startTransition(async () => {
      const result = await resendInvitation(userId);
      if (result.ok) {
        toast.success(
          result.data?.dryRun
            ? `Invitation préparée (mode dev — email non envoyé)`
            : `Invitation renvoyée à ${userEmail}`,
        );
      } else {
        toast.error(result.error || 'Erreur lors du renvoi de l\'invitation');
      }
    });
  };

  // Garde lock-out visuelle (le serveur refuse aussi)
  const canDisable = !isSelf;

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-50"
            aria-label={`Actions pour ${userEmail}`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[220px] rounded-lg border border-border bg-white shadow-xl p-1 animate-in fade-in zoom-in-95"
          >
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                setRoleDialogOpen(true);
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm data-[highlighted]:bg-muted"
            >
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Modifier le rôle
            </DropdownMenu.Item>

            {hasNeverLoggedIn && !disabled && (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  handleResend();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm data-[highlighted]:bg-muted"
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
                Renvoyer l'invitation
              </DropdownMenu.Item>
            )}

            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                setResetConfirmOpen(true);
              }}
              disabled={disabled}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm data-[highlighted]:bg-muted data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Réinitialiser le mot de passe
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="my-1 h-px bg-border" />

            {disabled ? (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  handleEnable();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm text-emerald-700 data-[highlighted]:bg-emerald-50"
              >
                <Power className="h-4 w-4" />
                Réactiver
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  if (!canDisable) return;
                  setDisableConfirmOpen(true);
                }}
                disabled={!canDisable}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer outline-none text-sm text-red-700 data-[highlighted]:bg-red-50 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground"
              >
                <PowerOff className="h-4 w-4" />
                Désactiver
                {isSelf && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    (vous)
                  </span>
                )}
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Sub-dialog : Modifier le rôle */}
      <ChangeRoleDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        userId={userId}
        userEmail={userEmail}
        currentRole={userRole}
      />

      {/* Dialog confirmation : Réinitialiser mot de passe */}
      <Dialog.Root
        open={resetConfirmOpen}
        onOpenChange={(next) => {
          if (pending && !next) return;
          setResetConfirmOpen(next);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
            <Dialog.Title className="text-lg font-semibold">
              Réinitialiser le mot de passe
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Un email contenant un lien pour redéfinir le mot de passe sera
              envoyé à <span className="font-medium">{userEmail}</span>. Le lien
              sera valable 7 jours.
            </Dialog.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-50"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleResetConfirmed}
                disabled={pending}
                className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Envoi…' : 'Envoyer l\'email'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Dialog confirmation : Désactiver */}
      <Dialog.Root
        open={disableConfirmOpen}
        onOpenChange={(next) => {
          if (pending && !next) return;
          setDisableConfirmOpen(next);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[440px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
            <Dialog.Title className="text-lg font-semibold">
              Désactiver l'utilisateur
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium">{userEmail}</span> ne pourra plus se
              connecter et ses sessions actives seront immédiatement fermées.
              L'historique (AuditLog, leads assignés, etc.) est conservé. Cette
              action est réversible via « Réactiver ».
            </Dialog.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-50"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleDisableConfirmed}
                disabled={pending}
                className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Désactivation…' : 'Désactiver'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
