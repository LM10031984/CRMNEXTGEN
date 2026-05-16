import { redirect } from 'next/navigation';
import { Sliders } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { DistributionLeadsForm } from '@/components/parametres/distribution-leads-form';

/**
 * Page Distribution leads (Phase 9 Plan 09-04 Task 3 — LEAD-01 D-06).
 *
 * Server Component ADMIN-only :
 *  - Garde via `validateRequest` + `hasRole(user, ['ADMIN'])` → redirect '/app'
 *    si non-admin (pattern Phase 8 user-friendly vs throw ForbiddenError).
 *  - Lit les 3 toggles tenant qui pilotent la distribution automatique :
 *    `autoAssignLeads`, `notifyOnLeadAssignEmail`, `notifyOnLeadAssignBell`.
 *  - Rend `<DistributionLeadsForm initial={...} />` (client) qui appelle
 *    `updateLeadDistributionConfig` (Plan 09-02) au submit + toast sonner.
 *
 * Décision UX (D-Phase9-O) : page ADMIN-only via `hasRole` + `redirect('/app')`
 * plutôt que `requireRole(['ADMIN'])` qui throw → tombe sur l'error boundary.
 * Pattern coherent avec Phase 7 (parametres/page.tsx).
 *
 * `dynamic = 'force-dynamic'` pour ne pas cacher les toggles (donnees admin
 * sensibles temps reel).
 */
export const dynamic = 'force-dynamic';

export default async function DistributionLeadsConfigPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (!hasRole(user, ['ADMIN'])) redirect('/app');

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: true,
    },
  });

  if (!tenant) redirect('/app');

  return (
    <div className="space-y-6 max-w-3xl">
      <Breadcrumb
        items={[
          { label: 'Paramètres', href: '/app/parametres' },
          { label: 'Distribution leads' },
        ]}
      />
      <header className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Sliders className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">Distribution des leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paramètres de l&apos;auto-assignation Lead → Commercial et des notifications associées.
          </p>
        </div>
      </header>
      <DistributionLeadsForm
        initial={{
          autoAssignLeads: tenant.autoAssignLeads,
          notifyOnLeadAssignEmail: tenant.notifyOnLeadAssignEmail,
          notifyOnLeadAssignBell: tenant.notifyOnLeadAssignBell,
        }}
      />
    </div>
  );
}
