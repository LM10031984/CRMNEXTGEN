import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone, MapPin, GraduationCap, Briefcase, Calendar, FileText } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { formatAddress } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { EditPersonButton } from '@/components/forms/edit-person-button';
import { Badge } from '@/components/ui/badge';
import { LegalLinkEditor } from '@/components/editors/legal-link-editor';

const ROLE_LABEL: Record<string, string> = {
  DIRIGEANT: 'Dirigeant',
  SALARIE: 'Salarié',
  EI_SELF: 'Auto-entrepreneur (EI)',
  AGENT_COMMERCIAL: 'Agent commercial',
  ALTERNANT: 'Alternant',
  STAGIAIRE: 'Stagiaire',
  CONTACT: 'Contact',
  FINANCEUR_CONTACT: 'Contact financeur',
  FORMATEUR: 'Formateur',
};

export default async function ApprenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const person = await prisma.person.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: {
          organization: { select: { id: true, legalName: true, siret: true, opcoCode: true } },
        },
      },
      sensitiveData: true,
    },
  });
  if (!person) notFound();

  const address = (person.personalAddress ?? null) as null | {
    street?: string;
    street2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };

  const isEi = person.legalLinks.some((l) => l.role === 'EI_SELF');

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/app/apprenants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à la liste
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {person.lastName.toUpperCase()} {person.firstName}
              {isEi && <Badge variant="primary">EI / multi-casquettes</Badge>}
              {person.requiresCleanup && <Badge variant="warning">à corriger</Badge>}
            </span>
          }
          subtitle={person.professionalStatus ?? undefined}
        />
        <EditPersonButton
          personId={person.id}
          current={{
            civility: person.civility,
            firstName: person.firstName,
            lastName: person.lastName,
            birthName: person.birthName,
            birthDate: person.birthDate,
            email: person.email,
            phone: person.phone,
            educationLevel: person.educationLevel,
            diplomas: person.diplomas,
            professionalExperience: person.professionalExperience,
            professionalStatus: person.professionalStatus,
            bpfDefaultStatus: person.bpfDefaultStatus,
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Coordonnées */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Coordonnées
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <Field icon={Mail} label="Email" value={person.email ?? '—'} muted={!person.email} />
              <Field icon={Phone} label="Téléphone" value={person.phone ?? '—'} muted={!person.phone} />
              <Field
                icon={MapPin}
                label="Adresse"
                value={formatAddress(address) || '—'}
                muted={!address?.street}
                multiline
              />
              <Field
                icon={Calendar}
                label="Date de naissance"
                value={
                  person.birthDate
                    ? new Date(person.birthDate).toLocaleDateString('fr-FR')
                    : '—'
                }
                muted={!person.birthDate}
              />
            </dl>
          </section>

          {/* Liens juridiques (éditeur interactif) */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Liens juridiques ({person.legalLinks.length})
              </h2>
              {person.legalLinks.length >= 2 && (
                <Badge variant="primary">Cas multi-casquettes</Badge>
              )}
            </div>
            <LegalLinkEditor personId={person.id} links={person.legalLinks} />
          </section>
        </div>

        {/* Sidebar : profil pédagogique + cleanup */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Profil pédagogique
            </h2>
            <dl className="space-y-3 text-sm">
              <Field
                icon={GraduationCap}
                label="Niveau d'étude"
                value={person.educationLevel ?? '—'}
                muted={!person.educationLevel}
              />
              <Field icon={FileText} label="Diplômes" value={person.diplomas ?? '—'} multiline muted={!person.diplomas} />
              <Field
                icon={Calendar}
                label="Expérience pro"
                value={person.professionalExperience ?? '—'}
                muted={!person.professionalExperience}
              />
              <Field
                icon={FileText}
                label="Statut BPF"
                value={person.bpfDefaultStatus ?? '—'}
                muted={!person.bpfDefaultStatus}
              />
            </dl>
          </section>

          {person.requiresCleanup && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              <h3 className="font-semibold mb-1">À corriger</h3>
              <p>{person.cleanupNotes ?? "Cette fiche a été flaggée à l'import SmartOF."}</p>
            </section>
          )}

          {person.sensitiveData?.socialSecurityNb && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
                Données sensibles (RGPD)
              </h2>
              <p className="text-xs text-muted-foreground">
                Stockées séparément. Visibles uniquement par les administrateurs.
              </p>
              <div className="mt-3 text-sm">
                <span className="text-muted-foreground">N° sécurité sociale : </span>
                <code className="font-mono text-xs">{person.sensitiveData.socialSecurityNb}</code>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  muted,
  multiline,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
        <div className={muted ? 'text-muted-foreground italic' : multiline ? 'whitespace-pre-line' : ''}>
          {value}
        </div>
      </div>
    </div>
  );
}
