import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { LeadCreateForm } from '@/components/leads/lead-create-form';

/**
 * Page création Lead (Phase 9 Plan 09-03 — LEAD-01).
 *
 * RBAC : ADMIN + MANAGER + COMMERCIAL (les 3 rôles qui peuvent créer un lead,
 * cohérent avec `createLead` server action Plan 09-02). Sinon redirect '/app/leads'.
 *
 * Le commercial le moins chargé sera automatiquement assigné si le toggle
 * `tenant.autoAssignLeads` est ON (défaut true) — flag documenté dans la
 * sous-ligne du header pour informer l'utilisateur.
 */
export const dynamic = 'force-dynamic';

export default async function NewLeadPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (!hasRole(user, ['ADMIN', 'MANAGER', 'COMMERCIAL'])) {
    redirect('/app/leads');
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Leads', href: '/app/leads' },
          { label: 'Nouveau' },
        ]}
      />
      <header>
        <h1 className="text-2xl font-semibold">Nouveau lead</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Le commercial le moins chargé sera automatiquement assigné (si
          l'auto-distribution est active).
        </p>
      </header>
      <LeadCreateForm />
    </div>
  );
}
