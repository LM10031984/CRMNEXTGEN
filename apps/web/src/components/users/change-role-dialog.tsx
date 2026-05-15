'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import type { UserRole } from '@qualiof/db';
import {
  changeUserRoleSchema,
  type ChangeUserRoleInput,
} from '@qualiof/shared';
import { changeUserRole } from '@/server/actions/tenant-users';

/**
 * Dialog "Modifier le rôle" d'un utilisateur (Phase 8 Plan 08-04).
 *
 * Controlled dialog (open/onOpenChange en props) — ouvert depuis le menu
 * d'actions `UserRowActions`. Pattern Radix Dialog + react-hook-form +
 * zodResolver(changeUserRoleSchema) cohérent avec invite-user-button.
 *
 * Le rôle ADMIN est sélectionnable pour tous, mais le serveur refuse de
 * retirer ADMIN à soi-même (lock-out protection — cf. changeUserRole action).
 */
const ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'FORMATEUR', 'COMPTABLE', 'LECTEUR'] as const;

interface ChangeRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentRole: UserRole;
}

export function ChangeRoleDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentRole,
}: ChangeRoleDialogProps) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChangeUserRoleInput>({
    resolver: zodResolver(changeUserRoleSchema),
    defaultValues: { userId, role: currentRole },
  });

  const onSubmit = (data: ChangeUserRoleInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changeUserRole(data);
      if (result.ok) {
        toast.success(`Rôle mis à jour pour ${userEmail}`);
        onOpenChange(false);
        reset({ userId, role: data.role });
      } else {
        setServerError(result.error || 'Erreur lors du changement de rôle');
        toast.error(result.error || 'Erreur lors du changement de rôle');
      }
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
        if (!next) {
          setServerError(null);
          reset({ userId, role: currentRole });
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-md bg-primary-50 p-2 text-primary-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Modifier le rôle
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground break-words">
                Utilisateur : <span className="font-medium">{userEmail}</span>
              </Dialog.Description>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            {/* userId est en hidden input via register */}
            <input type="hidden" {...register('userId')} />

            <div className="space-y-1.5">
              <label
                htmlFor="change-role"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Nouveau rôle
              </label>
              <select
                id="change-role"
                {...register('role')}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {r === currentRole ? ' (actuel)' : ''}
                  </option>
                ))}
              </select>
              {errors.role && (
                <p className="text-xs text-red-600">{errors.role.message}</p>
              )}
            </div>

            {serverError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-md p-2">
                {serverError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
