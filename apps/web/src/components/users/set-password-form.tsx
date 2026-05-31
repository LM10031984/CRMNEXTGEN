'use client';

/**
 * Phase 8 RBAC-02 — Formulaire client de définition du mot de passe.
 *
 * Pattern react-hook-form + zodResolver + useTransition (identique login-form.tsx),
 * avec gestion fine des fieldErrors retournés par la server action.
 *
 * Sur succès : la server action `acceptInvitation` redirige côté serveur vers /app
 *   (la fonction ne revient JAMAIS). L'UI ne traite ici que le cas d'erreur.
 *
 * Sur erreur :
 *   - Si `fieldErrors` présent → bind sur les champs via setError (RHF affiche le msg)
 *   - Toujours : `toast.error(result.error)` (visibilité globale)
 */

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { setPasswordSchema, type SetPasswordInput } from '@qualiof/shared';
import { acceptInvitation } from '@/server/actions/user-invitation-accept';
import type { UserRole } from '@qualiof/db';

interface SetPasswordFormProps {
  token: string;
  email: string;
  firstName: string | null;
  role: UserRole;
}

/**
 * Mapping français des rôles RBAC (cohérent avec la matrice D-02).
 * Affiché en clair à l'utilisateur invité pour qu'il sache ce qu'il accepte.
 */
const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
  FORMATEUR: 'Formateur',
  COMMERCIAL: 'Commercial',
  COMPTABLE: 'Comptable',
  LECTEUR: 'Lecteur',
};

export function SetPasswordForm({ token, email, firstName, role }: SetPasswordFormProps) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = (data: SetPasswordInput) => {
    startTransition(async () => {
      const result = await acceptInvitation({
        token,
        password: data.password,
        confirm: data.confirm,
      });
      // Sur succès : redirect /app (server side) → la fonction ne revient JAMAIS,
      // donc `result` n'est défini que dans les cas d'erreur.
      if (result && result.ok === false) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            if (messages && messages[0]) {
              setError(field as keyof SetPasswordInput, { message: messages[0] });
            }
          }
        }
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-8 max-w-md mx-auto shadow-sm">
      <h1 className="text-xl font-bold mb-1">
        Bienvenue{firstName ? ` ${firstName}` : ''} 👋
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vous avez été invité(e) à rejoindre QualiOF en tant que{' '}
        <strong>{ROLE_LABELS[role]}</strong>. Définissez un mot de passe pour activer
        votre compte (<span className="font-mono text-xs">{email}</span>).
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="password">
            Mot de passe (8 caractères minimum)
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            {...register('password')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="confirm">
            Confirmation du mot de passe
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...register('confirm')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.confirm && (
            <p className="text-xs text-red-600">{errors.confirm.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary text-white font-medium px-4 py-2.5 hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Activation…' : 'Activer mon compte'}
        </button>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Après activation, vous serez connecté(e) automatiquement.
        </p>
      </form>
    </div>
  );
}
