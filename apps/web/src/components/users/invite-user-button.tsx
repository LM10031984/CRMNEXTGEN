'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, UserPlus } from 'lucide-react';
import { inviteUserSchema, type InviteUserInput } from '@qualiof/shared';
import { inviteUser } from '@/server/actions/tenant-users';

/**
 * Bouton « Inviter un utilisateur » + modale formulaire (Phase 8 Plan 08-04).
 *
 * Pattern projet :
 *  - Radix Dialog (cohérent avec user-menu-button.tsx).
 *  - react-hook-form + zodResolver(inviteUserSchema) pour validation client +
 *    fieldErrors serveur remontés via setError.
 *  - useTransition pour ne pas bloquer l'UI pendant l'appel server action.
 *  - toast sonner success/error (cohérent Phase 7 — pas d'AlertDialog Radix
 *    qui n'est pas installé dans le projet).
 *
 * Server action consommée : `inviteUser` (Plan 08-02). Retourne
 * `{ ok, data?: { userId, dryRun? }, error?, fieldErrors? }`. Le flag `dryRun`
 * indique que le SMTP n'est pas configuré → on adapte le toast.
 */
const ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'FORMATEUR', 'COMPTABLE', 'LECTEUR'] as const;

export function InviteUserButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'LECTEUR',
    },
  });

  const onSubmit = (data: InviteUserInput) => {
    startTransition(async () => {
      const result = await inviteUser(data);
      if (result.ok) {
        toast.success(
          result.data?.dryRun
            ? `Invitation préparée pour ${data.email} (mode dev — email non envoyé)`
            : `Invitation envoyée à ${data.email}`,
        );
        reset();
        setOpen(false);
      } else {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages?.[0];
            if (msg) {
              setError(field as keyof InviteUserInput, { message: msg });
            }
          }
        }
        toast.error(result.error || 'Erreur lors de l\'envoi de l\'invitation');
      }
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Empêche la fermeture pendant le submit pour éviter de perdre l'état.
        if (pending && !next) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-white text-sm font-medium px-3 py-2 hover:bg-primary-600 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Inviter un utilisateur
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Inviter un utilisateur
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Un email contenant un lien d'activation (valable 7 jours) sera envoyé.
          </Dialog.Description>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="invite-email"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Email *
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  {...register('email')}
                  className="w-full rounded-md border border-border bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="prenom.nom@start-academy.fr"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="invite-firstName"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Prénom *
                </label>
                <input
                  id="invite-firstName"
                  type="text"
                  autoComplete="off"
                  {...register('firstName')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {errors.firstName && (
                  <p className="text-xs text-red-600">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="invite-lastName"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Nom *
                </label>
                <input
                  id="invite-lastName"
                  type="text"
                  autoComplete="off"
                  {...register('lastName')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {errors.lastName && (
                  <p className="text-xs text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="invite-role"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Rôle *
              </label>
              <select
                id="invite-role"
                {...register('role')}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {errors.role && (
                <p className="text-xs text-red-600">{errors.role.message}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Le rôle est modifiable ultérieurement dans le menu d'actions
                de la ligne utilisateur.
              </p>
            </div>

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
                {pending ? 'Envoi…' : 'Envoyer l\'invitation'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
