import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Phone, Mail, Building2, Users, FileCheck, AlertTriangle } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { formatAddress } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { EditOrganizationButton } from '@/components/forms/edit-organization-button';
import { AddPersonToOrgButton } from '@/components/editors/add-person-to-org-button';
import { Badge } from '@/components/ui/badge';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';

// Auto-entrepreneur = EI au régime micro depuis 2016, fusionnés dans l'UI
const FORM_LABEL: Record<string, string> = {
  EI: 'Auto-entrepreneur',
  AUTO_ENTREPRENEUR: 'Auto-entrepreneur',
  EIRL: 'EIRL',
  SAS: 'SAS',
  SARL: 'SARL',
  SASU: 'SASU',
  EURL: 'EURL',
  SA: 'SA',
  ASSOCIATION: 'Association',
  PARTICULIER: 'Particulier',
  AUTRE: 'Autre',
};

const ROLE_LABEL: Record<string, string> = {
  DIRIGEANT: 'Dirigeant',
  SALARIE: 'Salarié',
  EI_SELF: 'Auto-entrepreneur',
  ALTERNANT: 'Alternant',
  STAGIAIRE: 'Stagiaire',
  CONTACT: 'Contact',
  FINANCEUR_CONTACT: 'Contact financeur',
  FORMATEUR: 'Formateur',
};

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const org = await prisma.organization.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      ageficeProfile: true,
      opcoCatalog: true,
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: { person: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
  });
  if (!org) notFound();

  const address = (org.address ?? null) as null | {
    street?: string;
    street2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };

  const ageficeFields = (org.ageficeProfile?.paFields ?? null) as Record<string, string> | null;

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="org"
        id={org.id}
        title={org.legalName}
        subtitle={org.legalForm + (org.opcoCode ? ` · ${org.opcoCode}` : '')}
        href={`/app/organisations/${org.id}`}
      />
      <BackToListLink fallbackHref="/app/organisations" label="Retour à la liste" />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {org.legalName}
              <Badge variant="muted">{FORM_LABEL[org.legalForm] ?? org.legalForm}</Badge>
              {org.opcoCode && <Badge variant="info">OPCO {org.opcoCode}</Badge>}
              {org.requiresCleanup && (
                <Badge variant="warning">
                  <AlertTriangle className="h-3 w-3" /> à corriger
                </Badge>
              )}
            </span>
          }
          subtitle={
            [org.network, org.brandName, org.representative].filter(Boolean).join(' · ') || undefined
          }
        />
        <EditOrganizationButton
          organizationId={org.id}
          current={{
            legalName: org.legalName,
            legalForm: org.legalForm,
            siren: org.siren,
            siret: org.siret,
            naf: org.naf,
            vatNumber: org.vatNumber,
            email: org.email,
            phone: org.phone,
            opcoCode: org.opcoCode,
            network: org.network,
            activityDescription: org.activityDescription,
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Identité juridique
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <Field label="SIRET" value={org.siret ? <code className="font-mono">{org.siret}</code> : '—'} />
              <Field label="SIREN" value={org.siren ? <code className="font-mono">{org.siren}</code> : '—'} />
              <Field label="Code NAF" value={org.naf ?? '—'} />
              <Field label="N° TVA" value={org.vatNumber ?? '—'} />
              <Field label="RCS" value={org.rcs ?? '—'} />
              <Field label="Type" value={org.type ?? '—'} />
              <Field label="Activité" value={org.activityDescription ?? '—'} multiline />
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Coordonnées
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <FieldIcon icon={Mail} label="Email" value={org.email ?? '—'} />
              <FieldIcon icon={Phone} label="Téléphone" value={org.phone ?? '—'} />
              <FieldIcon
                icon={MapPin}
                label="Adresse"
                value={formatAddress(address) || '—'}
                multiline
              />
              {org.emailBilling && org.emailBilling !== org.email && (
                <FieldIcon icon={Mail} label="Email facturation" value={org.emailBilling} />
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-white p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Personnes rattachées ({org.legalLinks.length})
              </h2>
              <AddPersonToOrgButton
                organizationId={org.id}
                excludePersonIds={org.legalLinks.map((l) => l.person.id)}
              />
            </div>
            {org.legalLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucune personne rattachée.</p>
            ) : (
              <ul className="space-y-2">
                {org.legalLinks.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Link
                      href={`/app/apprenants/${link.person.id}`}
                      className="font-medium hover:text-primary transition-colors flex-1 min-w-0 truncate"
                    >
                      {link.person.lastName.toUpperCase()} {link.person.firstName}
                    </Link>
                    <Badge variant={link.role === 'EI_SELF' ? 'primary' : 'muted'}>
                      {ROLE_LABEL[link.role] ?? link.role}
                    </Badge>
                    {link.isPrimary && <Badge variant="info">Principal</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {org.ageficeProfile && (
            <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileCheck className="h-5 w-5 text-sky-700" />
                <h2 className="font-semibold text-sky-900">Profil AGEFICE</h2>
              </div>
              <p className="text-xs text-sky-800 mb-4">
                Cette organisation est éligible à un financement AGEFICE. Les champs PDF AGEFICE seront
                pré-remplis automatiquement (palier 3).
              </p>
              <dl className="text-sm space-y-2">
                <Field label="PA AGEFICE" value={org.ageficeProfile.paName ?? '—'} />
                <Field label="N° du PA" value={org.ageficeProfile.paNumber ?? '—'} />
                <Field label="Interlocuteur" value={org.ageficeProfile.paContact ?? '—'} />
                <Field label="Version PDF" value={org.ageficeProfile.pdfTemplateVersion} />
              </dl>
              {ageficeFields && (
                <details className="mt-4">
                  <summary className="text-xs text-sky-800 cursor-pointer hover:text-sky-900">
                    Voir les {Object.keys(ageficeFields).length} champs pré-remplis
                  </summary>
                  <dl className="mt-3 space-y-1 text-xs max-h-64 overflow-auto">
                    {Object.entries(ageficeFields).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-2 gap-2">
                        <dt className="text-sky-700 truncate">{k}</dt>
                        <dd className="text-sky-900 truncate">{v || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </section>
          )}

          {org.opcoCatalog && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
                {org.opcoCatalog.name}
              </h2>
              <dl className="space-y-2 text-sm">
                {org.opcoCatalog.averageDelayDays && (
                  <Field
                    label="Délai moyen"
                    value={`${org.opcoCatalog.averageDelayDays} jours`}
                  />
                )}
                {org.opcoCatalog.yearlyCapPerPerson && (
                  <Field
                    label="Plafond annuel"
                    value={`${org.opcoCatalog.yearlyCapPerPerson.toString()} €`}
                  />
                )}
                {org.opcoCatalog.website && (
                  <Field
                    label="Site"
                    value={
                      <a
                        href={org.opcoCatalog.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {org.opcoCatalog.website.replace(/^https?:\/\//, '')}
                      </a>
                    }
                  />
                )}
              </dl>
            </section>
          )}

          {org.requiresCleanup && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              <h3 className="font-semibold mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> À corriger
              </h3>
              <p>{org.cleanupNotes ?? "Cette fiche a été flaggée à l'import."}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</dt>
      <dd className={multiline ? 'whitespace-pre-line' : ''}>{value}</dd>
    </div>
  );
}

function FieldIcon({
  icon: Icon,
  label,
  value,
  multiline,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className={multiline ? 'whitespace-pre-line' : ''}>{value}</div>
      </div>
    </div>
  );
}
