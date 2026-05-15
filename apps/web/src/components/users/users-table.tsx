import type { UserRole } from '@qualiof/db';
import { UserRowActions } from './user-row-actions';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  disabledAt: Date | null;
  lastLoginAt: Date | null;
  invitedAt: Date | null;
}

interface UsersTableProps {
  users: UserRow[];
  /** ID de l'admin courant — sert à griser les actions "se désactiver soi-même". */
  currentUserId: string;
}

/**
 * Tableau utilisateurs (Phase 8 Plan 08-04). Rendu côté serveur (Server Component),
 * la colonne "Actions" embarque le client component `<UserRowActions>` pour
 * l'interactivité (DropdownMenu + Dialogs confirmation).
 *
 * Colonnes : Email · Nom · Rôle · Statut · Dernière connexion · Actions
 *
 * UX :
 *  - Rang `opacity-60` si désactivé (visuel "fantôme").
 *  - Badge "vous" sur la ligne de l'admin courant (auto-identification).
 *  - Date formatée en `fr-FR` avec heure courte (fallback "—" si jamais connecté).
 *  - `overflow-x-auto` pour les mobiles (table > viewport sm).
 */
export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const fmtDate = (d: Date | null): string =>
    d
      ? new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(d)
      : '—';

  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun utilisateur enregistré. Cliquez sur « Inviter un utilisateur »
          pour commencer.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Email</th>
            <th className="px-3 py-2 font-semibold">Nom</th>
            <th className="px-3 py-2 font-semibold">Rôle</th>
            <th className="px-3 py-2 font-semibold">Statut</th>
            <th className="px-3 py-2 font-semibold">Dernière connexion</th>
            <th className="px-3 py-2 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const isDisabled = u.disabledAt !== null;
            const hasNeverLoggedIn = u.lastLoginAt === null;
            return (
              <tr
                key={u.id}
                className={
                  isDisabled
                    ? 'border-t border-border opacity-60'
                    : 'border-t border-border'
                }
              >
                <td className="px-3 py-2.5 font-medium">
                  <span>{u.email}</span>
                  {isSelf && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-50 text-primary-700">
                      vous
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {isDisabled ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                      Désactivé
                    </span>
                  ) : hasNeverLoggedIn && u.invitedAt ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                      Invité
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                      Actif
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {fmtDate(u.lastLoginAt)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <UserRowActions
                    userId={u.id}
                    userEmail={u.email}
                    userRole={u.role}
                    disabled={isDisabled}
                    isSelf={isSelf}
                    hasNeverLoggedIn={hasNeverLoggedIn}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
