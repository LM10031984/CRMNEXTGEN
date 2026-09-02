import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Mail, Phone, Building2, User } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { prisma } from '@qualiof/db';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { ReassignLeadButton } from '@/components/leads/reassign-lead-button';
import { LeadStatusSelect } from '@/components/leads/lead-status-select';
import { LeadDiagnosticSection } from '@/components/diagnostic/lead-diagnostic-section';

/**
 * Fiche détail Lead (Phase 9 Plan 09-03 — LEAD-01).
 *
 * Server Component, lecture pour tout user authentifié (scope tenantId obligatoire).
 *  - Header : prospectName + breadcrumb + bouton "Réassigner" (Task 1 / Plan 09-02 action).
 *  - Section commercial assigné (badge ou "Non assigné") + select statut inline.
 *  - Section détails : source, priorité, email, téléphone, organisation (avec lien),
 *    formation d'intérêt, notes.
 *
 * Pattern Phase 5 réutilisé : Breadcrumb + grid responsive sm:grid-cols-2.
 * Si lead introuvable dans le tenant → notFound() (404).
 */
export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      person: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, legalName: true, brandName: true } },
      interestedProduct: { select: { id: true, title: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
      // Diagnostic du stand : ce que le prospect a réellement reçu, et si
      // l'envoi est parti. C'est ce qui manque quand on décroche pour rappeler.
      diagnosticSubmissions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          dominante: true,
          secondaire: true,
          scores: true,
          programmeStatus: true,
          programmeSentAt: true,
          lastError: true,
          attempts: true,
          personnalisation: true,
        },
      },
    },
  });
  if (!lead) notFound();

  // Résolution prospectName : Person canonique (CRM) prioritaire, puis fallback saisie libre, puis "Prospect".
  const prospectName =
    (lead.person
      ? `${lead.person.firstName} ${lead.person.lastName}`.trim()
      : '') ||
    `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() ||
    'Prospect';
  const ownerName = lead.owner
    ? `${lead.owner.firstName} ${lead.owner.lastName}`.trim()
    : null;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Leads', href: '/app/leads' },
          { label: prospectName },
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{prospectName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créé le{' '}
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
              lead.createdAt,
            )}
          </p>
        </div>
        <ReassignLeadButton leadId={lead.id} />
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Commercial assigné
          </div>
          <div className="text-base font-medium">
            {ownerName ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-50 text-primary-700">
                <User className="h-3.5 w-3.5" />
                {ownerName}
              </span>
            ) : (
              <span className="text-muted-foreground italic">Non assigné</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Statut
          </div>
          <LeadStatusSelect leadId={lead.id} current={lead.status} />
          {lead.wonAt && (
            <div className="text-xs text-emerald-700 mt-1">
              Gagné le{' '}
              {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                lead.wonAt,
              )}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-border pt-6">
        <DetailRow label="Source" value={lead.source ?? '—'} />
        <DetailRow label="Priorité" value={lead.priority} />
        <DetailRow
          label="Email"
          value={
            lead.email ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <a
                  href={`mailto:${lead.email}`}
                  className="text-primary hover:underline"
                >
                  {lead.email}
                </a>
              </span>
            ) : (
              '—'
            )
          }
        />
        <DetailRow
          label="Téléphone"
          value={
            lead.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <a
                  href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
                  className="text-primary hover:underline"
                >
                  {lead.phone}
                </a>
              </span>
            ) : (
              '—'
            )
          }
        />
        {lead.organization && (
          <DetailRow
            label="Organisation"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <Link
                  href={`/app/organisations/${lead.organization.id}` as any}
                  className="text-primary hover:underline"
                >
                  {lead.organization.brandName ?? lead.organization.legalName}
                </Link>
              </span>
            }
          />
        )}
        {lead.interestedProduct && (
          <DetailRow
            label="Formation d'intérêt"
            value={lead.interestedProduct.title}
          />
        )}
      </section>

      <LeadDiagnosticSection soumissions={lead.diagnosticSubmissions} />

      {lead.notes && (
        <section className="border-t border-border pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Notes
          </div>
          <div className="text-sm whitespace-pre-wrap">{lead.notes}</div>
        </section>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
