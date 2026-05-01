import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, MapPin, GraduationCap, Briefcase, Calendar, FileText, Clock, Wallet,
  ChevronRight,
} from 'lucide-react';
import { prisma } from '@qualiof/db';
import { formatAddress } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { EditPersonButton } from '@/components/forms/edit-person-button';
import { Badge } from '@/components/ui/badge';
import { LegalLinkEditor } from '@/components/editors/legal-link-editor';
import { LearnerTabs } from '@/components/apprenants/learner-tabs';
import { BudgetAgefice } from '@/components/apprenants/budget-agefice';
import { Info } from 'lucide-react';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export default async function ApprenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'info';

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
      participations: {
        include: {
          session: {
            include: {
              product: { select: { title: true, durationHours: true } },
            },
          },
          sponsorOrg: { select: { legalName: true, opcoCode: true } },
        },
        orderBy: { session: { startDate: 'desc' } },
      },
    },
  });
  if (!person) notFound();

  // Documents liés à cet apprenant via ses participations
  const participantIds = person.participations.map((p) => p.id);
  const documents = participantIds.length
    ? await prisma.document.findMany({
        where: { tenantId: user.tenantId, participantId: { in: participantIds } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, createdAt: true, sessionId: true },
      })
    : [];

  const address = (person.personalAddress ?? null) as null | {
    street?: string;
    street2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };

  const isEi = person.legalLinks.some((l) => l.role === 'EI_SELF');

  // Calculs activité
  const totalParticipations = person.participations.length;
  const totalHours = person.participations.reduce(
    (s, p) => s + (p.session.product?.durationHours ?? 0),
    0,
  );

  // Budget AGEFICE de l'année où le dossier a été monté (financingRequestDate),
  // PAS l'année de la session (cf mémoire feedback_budget_agefice_annee_dossier).
  // Tant que le dossier n'est pas monté (financingRequestDate null), on exclut
  // du calcul : le budget n'est pas encore consommé.
  const currentYear = new Date().getFullYear();
  const ageficeParticipations = person.participations.filter(
    (p) =>
      p.sponsorOrg?.opcoCode === 'AGEFICE' &&
      p.financingRequestDate != null &&
      new Date(p.financingRequestDate).getFullYear() === currentYear,
  );
  const ageficeConsumed = ageficeParticipations.reduce(
    (s, p) => s + Number(p.priceHT),
    0,
  );
  const ageficeSessions = ageficeParticipations.map((p) => ({
    participantId: p.id,
    sessionId: p.session.id,
    sessionCode: p.session.code,
    sessionName: p.session.name ?? p.session.product?.title ?? '',
    startDate: p.session.startDate,
    amountHT: Number(p.priceHT),
  }));

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

      <LearnerTabs
        tabs={[
          { key: 'info', label: 'Informations', icon: Info },
          { key: 'activity', label: 'Activité formation', icon: GraduationCap, badge: totalParticipations },
          { key: 'documents', label: 'Documents', icon: FileText, badge: documents.length },
        ]}
      />

      {tab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
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
                    person.birthDate ? new Date(person.birthDate).toLocaleDateString('fr-FR') : '—'
                  }
                  muted={!person.birthDate}
                />
              </dl>
            </section>

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
      )}

      {tab === 'activity' && (
        <div className="space-y-6">
          {/* KPIs activité */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Sessions" value={String(totalParticipations)} icon={Calendar} />
            <KPI label="Heures formées" value={`${totalHours} h`} icon={Clock} />
            <KPI
              label="CA généré"
              value={fmtEUR.format(person.participations.reduce((s, p) => s + Number(p.priceHT), 0))}
              icon={Wallet}
            />
            <KPI
              label={`AGEFICE ${currentYear}`}
              value={fmtEUR.format(ageficeConsumed)}
              icon={Wallet}
              accent={ageficeConsumed > 3000 ? 'red' : ageficeConsumed > 2700 ? 'orange' : 'default'}
            />
          </div>

          {/* Budget AGEFICE détaillé */}
          <BudgetAgefice
            year={currentYear}
            consomme={ageficeConsumed}
            sessions={ageficeSessions}
          />

          {/* Historique sessions */}
          <section className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Toutes les inscriptions ({totalParticipations})
              </h2>
            </div>
            {totalParticipations === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground italic">
                Aucune inscription enregistrée pour cet apprenant.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {person.participations.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/app/sessions/${p.session.id}`}
                      className="block p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="muted" className="font-mono text-xs">
                          {p.session.code}
                        </Badge>
                        <span className="font-medium flex-1 min-w-0 truncate">
                          {p.session.name ?? p.session.product?.title ?? '(sans nom)'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.session.startDate).toLocaleDateString('fr-FR')}
                        </span>
                        <Badge variant="muted" className="text-[10px]">
                          {p.session.product?.durationHours ?? 0}h
                        </Badge>
                        {p.sponsorOrg?.opcoCode && (
                          <Badge variant="info" className="text-[10px]">
                            {p.sponsorOrg.opcoCode}
                          </Badge>
                        )}
                        <span className="font-medium text-sm tabular-nums">
                          {fmtEUR.format(Number(p.priceHT))}
                        </span>
                        <Badge variant="muted" className="text-[10px]">
                          {p.enrollmentStatus}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'documents' && (
        <section className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Documents générés ({documents.length})
            </h2>
          </div>
          {documents.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground italic">
              Aucun document généré. Les documents apparaîtront ici dès qu'une fiche AGEFICE,
              programme ou facture sera produite pour cet apprenant.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 font-medium text-sm">{d.type}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
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

function KPI({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'default' | 'orange' | 'red';
}) {
  const cls =
    accent === 'red'
      ? 'border-red-200 bg-red-50/50'
      : accent === 'orange'
        ? 'border-orange-200 bg-orange-50/50'
        : 'border-border bg-white';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
