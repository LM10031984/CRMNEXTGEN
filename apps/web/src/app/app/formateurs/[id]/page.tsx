import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Calendar, GraduationCap, Award,
} from 'lucide-react';
import { prisma } from '@qualiof/db';
import { formatAddress } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { DeleteTrainerButton } from '@/components/forms/delete-trainer-button';

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'muted' | 'danger' | 'primary' }> = {
  DRAFT: { label: 'Brouillon', variant: 'muted' },
  PLANNED: { label: 'Planifiée', variant: 'info' },
  OPEN: { label: 'Ouverte', variant: 'info' },
  VALIDATED: { label: 'Validée', variant: 'success' },
  IN_PROGRESS: { label: 'En cours', variant: 'primary' },
  COMPLETED: { label: 'Terminée', variant: 'success' },
  CANCELLED: { label: 'Annulée', variant: 'danger' },
};

export default async function FormateurDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const trainer = await prisma.person.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      legalLinks: {
        where: { role: 'FORMATEUR' },
        include: { organization: { select: { id: true, legalName: true, siret: true, opcoCode: true } } },
      },
      trainerSessions: {
        orderBy: { session: { startDate: 'desc' } },
        include: {
          session: {
            select: {
              id: true, code: true, name: true, status: true,
              startDate: true, endDate: true, pricePerLearner: true,
              product: { select: { theme: true, durationHours: true } },
              _count: { select: { participants: true } },
            },
          },
        },
      },
      trainerAvailabilities: {
        where: { startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 5,
      },
    },
  });

  if (!trainer) notFound();

  const now = new Date();
  const subOrg = trainer.legalLinks[0]?.organization;
  const address = (trainer.personalAddress ?? null) as null | { street?: string; postalCode?: string; city?: string };
  const totalSessions = trainer.trainerSessions.length;
  const completedSessions = trainer.trainerSessions.filter((s) => s.session.status === 'COMPLETED').length;
  const upcomingSessions = trainer.trainerSessions.filter((s) => s.session.startDate > now).length;
  const totalHoursAnimated = trainer.trainerSessions
    .filter((s) => s.session.status === 'COMPLETED')
    .reduce((sum, s) => sum + (s.session.product?.durationHours ?? 0), 0);

  // Expertise par thème : on regroupe les sessions animées (terminées + en cours)
  // par thème du produit et on compte les heures cumulees pour ressortir le top 3.
  const themeMap = new Map<string, { sessions: number; hours: number }>();
  for (const ts of trainer.trainerSessions) {
    if (ts.session.status === 'CANCELLED' || ts.session.status === 'DRAFT') continue;
    const theme = ts.session.product?.theme?.trim();
    if (!theme) continue;
    const cur = themeMap.get(theme) ?? { sessions: 0, hours: 0 };
    cur.sessions += 1;
    cur.hours += ts.session.product?.durationHours ?? 0;
    themeMap.set(theme, cur);
  }
  const topThemes = [...themeMap.entries()]
    .map(([theme, stats]) => ({ theme, ...stats }))
    .sort((a, b) => b.hours - a.hours || b.sessions - a.sessions)
    .slice(0, 5);
  const maxThemeHours = topThemes[0]?.hours ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <BackToListLink fallbackHref="/app/formateurs" label="Retour aux formateurs" />
        <DeleteTrainerButton
          personId={trainer.id}
          fullName={`${trainer.firstName} ${trainer.lastName}`}
        />
      </div>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {trainer.firstName} {trainer.lastName.toUpperCase()}
            <Badge variant="primary">
              <Award className="h-3 w-3" /> Formateur
            </Badge>
            {subOrg && <Badge variant="muted">Sous-traitant</Badge>}
          </span>
        }
        subtitle={trainer.civility ?? undefined}
      />

      {/* Stats activité */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBlock label="Sessions animées" value={totalSessions} hint={`dont ${completedSessions} terminées`} />
        <StatBlock label="Heures dispensées" value={totalHoursAnimated} suffix="h" hint="cumulé sur sessions terminées" />
        <StatBlock label="Sessions à venir" value={upcomingSessions} />
        <StatBlock label="Disponibilités" value={trainer.trainerAvailabilities.length} hint="à venir, déclarées" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Coordonnées */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Coordonnées
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <FieldIcon icon={Mail} label="Email" value={trainer.email ?? '—'} />
              <FieldIcon icon={Phone} label="Téléphone" value={trainer.phone ?? '—'} />
              <FieldIcon
                icon={MapPin}
                label="Adresse"
                value={formatAddress(address) || '—'}
                multiline
              />
              <FieldIcon
                icon={Calendar}
                label="Date de naissance"
                value={trainer.birthDate ? new Date(trainer.birthDate).toLocaleDateString('fr-FR') : '—'}
              />
            </dl>
          </section>

          {/* Sessions animées */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Sessions animées ({totalSessions})
            </h2>
            {trainer.trainerSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Pas encore d'affectation à une session.</p>
            ) : (
              <ul className="space-y-2">
                {trainer.trainerSessions.slice(0, 12).map((ts) => {
                  const statusInfo = STATUS_LABELS[ts.session.status] ?? { label: ts.session.status, variant: 'muted' as const };
                  return (
                    <li
                      key={ts.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                    >
                      <Badge variant="muted" className="font-mono shrink-0">{ts.session.code}</Badge>
                      <Link
                        href={`/app/sessions/${ts.session.id}`}
                        className="flex-1 min-w-0 text-sm hover:text-primary transition-colors"
                      >
                        <div className="font-medium truncate">{ts.session.name ?? '(sans nom)'}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(ts.session.startDate).toLocaleDateString('fr-FR')}
                          {ts.session.product?.theme ? ` · ${ts.session.product.theme}` : ''}
                          {ts.session.product?.durationHours ? ` · ${ts.session.product.durationHours}h` : ''}
                          {' · '}{ts.session._count.participants} apprenant{ts.session._count.participants > 1 ? 's' : ''}
                          {ts.dailyRate && Number(ts.dailyRate) > 0 ? ` · ${Number(ts.dailyRate).toFixed(0)} €/j` : ''}
                        </div>
                      </Link>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            {trainer.trainerSessions.length > 12 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                + {trainer.trainerSessions.length - 12} autre(s) session(s)
              </p>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {topThemes.length > 0 && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                <Award className="h-4 w-4" /> Expertise
              </h2>
              <ul className="space-y-3">
                {topThemes.map((t) => {
                  const pct = maxThemeHours > 0 ? Math.round((t.hours / maxThemeHours) * 100) : 0;
                  return (
                    <li key={t.theme}>
                      <div className="flex items-center justify-between gap-2 text-sm mb-1">
                        <span className="font-medium truncate">{t.theme}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {t.sessions} session{t.sessions > 1 ? 's' : ''} · {t.hours}h
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-muted-foreground mt-3">
                Top thèmes par volume horaire animé (sessions terminées + en cours).
              </p>
            </section>
          )}

          {subOrg && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                <Briefcase className="h-4 w-4" /> Structure de sous-traitance
              </h2>
              <Link
                href={`/app/organisations/${subOrg.id}`}
                className="block p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium">{subOrg.legalName}</div>
                {subOrg.siret && (
                  <div className="text-xs text-muted-foreground mt-1">
                    SIRET <code className="font-mono">{subOrg.siret}</code>
                  </div>
                )}
                {subOrg.opcoCode && (
                  <Badge variant="info" className="mt-2">OPCO {subOrg.opcoCode}</Badge>
                )}
              </Link>
            </section>
          )}

          {/* Profil pédagogique */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Profil pédagogique
            </h2>
            <dl className="space-y-3 text-sm">
              <FieldIcon
                icon={GraduationCap}
                label="Niveau d'étude"
                value={trainer.educationLevel ?? '—'}
              />
              <FieldIcon
                icon={Award}
                label="Diplômes"
                value={trainer.diplomas ?? '—'}
                multiline
              />
              <FieldIcon
                icon={Calendar}
                label="Statut BPF"
                value={trainer.bpfDefaultStatus ?? '—'}
              />
            </dl>
          </section>

          {/* Disponibilités */}
          {trainer.trainerAvailabilities.length > 0 && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
                Prochaines disponibilités
              </h2>
              <ul className="space-y-2 text-sm">
                {trainer.trainerAvailabilities.map((a) => (
                  <li key={a.id} className="text-xs">
                    <span className="font-medium">{new Date(a.startsAt).toLocaleDateString('fr-FR')}</span>
                    <span className="text-muted-foreground"> · {a.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1.5">Bientôt disponible :</p>
            <ul className="space-y-0.5 list-disc pl-4">
              <li>Édition des coordonnées et tarif (palier 2.2)</li>
              <li>Calendrier de disponibilités cliquable (palier 3)</li>
              <li>Récap CA généré et factures sous-traitant (lot 2)</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatBlock({ label, value, hint, suffix }: { label: string; value: number; hint?: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-3xl font-semibold mt-1.5 tabular-nums">
        {value}
        {suffix && <span className="text-base text-muted-foreground ml-1">{suffix}</span>}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function FieldIcon({
  icon: Icon, label, value, multiline,
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
