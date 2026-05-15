import { UserPlus } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { PageHeader } from '@/components/ui/page-header';
import { UsersTable } from '@/components/users/users-table';
import { InviteUserButton } from '@/components/users/invite-user-button';

/**
 * Page Utilisateurs (Phase 8 Plan 08-04 — RBAC-01 + RBAC-03).
 *
 * Server Component ADMIN-only :
 *  - Garde d'accès via `requireRole(['ADMIN'])` qui throw `ForbiddenError`
 *    si le user n'est pas ADMIN → tombe sur `app/app/error.tsx`.
 *  - Liste tous les utilisateurs du tenant courant (multi-tenant scope obligatoire
 *    via `tenantId: admin.tenantId`).
 *  - Rend `<InviteUserButton>` (CTA + modale) + `<UsersTable>` (tableau + actions).
 *
 * Les 6 server actions consommées (inviteUser, disableUser, enableUser,
 * resetUserPassword, changeUserRole, resendInvitation) sont définies dans
 * `apps/web/src/server/actions/tenant-users.ts` (Plan 08-02).
 *
 * Décisions UX :
 *  - Tri : utilisateurs actifs en premier (disabledAt: 'asc' → null avant date),
 *    puis par nom de famille alphabétique.
 *  - Pas de pagination : Start Academy = 1 à 5 users (D-01 CONTEXT.md).
 *  - `dynamic = 'force-dynamic'` pour ne jamais cache cette page (sécurité +
 *    données admin temps réel).
 */
export const dynamic = 'force-dynamic';

export default async function UsersAdminPage() {
  const admin = await requireRole(['ADMIN']);

  const users = await prisma.user.findMany({
    where: { tenantId: admin.tenantId },
    orderBy: [{ disabledAt: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      disabledAt: true,
      lastLoginAt: true,
      invitedAt: true,
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Utilisateurs"
          subtitle={`${users.length} utilisateur${users.length > 1 ? 's' : ''} enregistré${users.length > 1 ? 's' : ''}`}
        />
        <div className="flex items-center gap-2 shrink-0">
          <InviteUserButton />
        </div>
      </div>
      <UsersTable users={users} currentUserId={admin.id} />
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
        L'invitation envoie un email contenant un lien d'activation valable 7 jours.
        Les comptes désactivés conservent leur historique (AuditLog, leads assignés,
        etc.) mais ne peuvent plus se connecter.
      </p>
    </div>
  );
}
