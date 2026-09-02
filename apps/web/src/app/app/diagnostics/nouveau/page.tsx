import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { NewDiagnosticForm } from '@/components/diagnostic-r1/new-diagnostic-form';

export const dynamic = 'force-dynamic';

export default async function NouveauDiagnosticPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  // Les leads sans diagnostic en cours : proposer deux fois la même agence
  // serait le meilleur moyen de créer deux dossiers concurrents.
  const leads = await prisma.lead.findMany({
    where: {
      tenantId: user.tenantId,
      status: { notIn: ['LOST', 'WON'] },
      diagnostics: { none: { status: 'EN_COURS' } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      organization: { select: { legalName: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <BackToListLink fallbackHref="/app/diagnostics" label="Diagnostics" />
      <PageHeader
        title="Nouveau diagnostic"
        subtitle="Rattachez le rendez-vous à un lead existant, ou saisissez l’agence rencontrée."
      />
      <NewDiagnosticForm
        leads={leads.map((l) => ({
          id: l.id,
          label:
            l.organization?.legalName ??
            [l.firstName, l.lastName].filter(Boolean).join(' ') ??
            l.email ??
            'Lead sans nom',
        }))}
      />
    </div>
  );
}
