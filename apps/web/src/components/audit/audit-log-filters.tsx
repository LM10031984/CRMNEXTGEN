'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Filter, RotateCcw } from 'lucide-react';

/**
 * Filtres URL state pour la page Historique (Phase 8 Plan 08-05 Task 2).
 *
 * Pourquoi URL state plutôt que React state local ?
 *  - URLs partageables (lien "tous les login failed de mai" → copiable).
 *  - Back/forward navigateur préserve les filtres naturellement.
 *  - Server Component peut lire `searchParams` et re-rendre côté serveur → SSR friendly.
 *
 * Actions presets pour `action` (au lieu d'un input libre) car on connaît
 * les namespaces depuis D-10 CONTEXT.md : parameters.* / users.* / auth.*.
 * L'URL state utilise le préfixe (trailing dot) → backend fait `startsWith`.
 */
export interface AuditLogFiltersProps {
  users: { id: string; firstName: string; lastName: string }[];
  initial: {
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
  };
}

export function AuditLogFilters({ users, initial }: AuditLogFiltersProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string>(initial.userId ?? '');
  const [action, setAction] = useState<string>(initial.action ?? '');
  const [from, setFrom] = useState<string>(initial.from ?? '');
  const [to, setTo] = useState<string>(initial.to ?? '');

  const apply = () => {
    const qs = new URLSearchParams();
    if (userId) qs.set('userId', userId);
    if (action) qs.set('action', action);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    qs.set('page', '0');
    router.push(
      `/app/parametres/historique?${qs.toString()}` as Route,
    );
  };

  const reset = () => {
    setUserId('');
    setAction('');
    setFrom('');
    setTo('');
    router.push('/app/parametres/historique' as Route);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="audit-filter-user"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Utilisateur
          </label>
          <select
            id="audit-filter-user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Tous les utilisateurs</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="audit-filter-action"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Type d'action
          </label>
          <select
            id="audit-filter-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Toutes les actions</option>
            <option value="parameters.">parameters.* (paramètres OF)</option>
            <option value="users.">users.* (gestion utilisateurs)</option>
            <option value="auth.">auth.* (connexions)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="audit-filter-from"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Du
          </label>
          <input
            id="audit-filter-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="audit-filter-to"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Au
          </label>
          <input
            id="audit-filter-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={apply}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white text-sm font-medium px-3 py-1.5 hover:bg-primary-600 transition-colors"
        >
          <Filter className="h-3.5 w-3.5" />
          Filtrer
        </button>
      </div>
    </div>
  );
}
