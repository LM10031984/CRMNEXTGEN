import Link from 'next/link';
import {
  Users, Calendar, AlertCircle, AlertTriangle,
  Euro, TrendingUp, Banknote, Clock, Building2, BookOpen,
} from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { getDashboardStats } from '@/lib/dashboard-stats';
import { StatCard } from '@/components/dashboard/stat-card';
import { CleanupCard } from '@/components/dashboard/cleanup-card';
import { RevenueCard } from '@/components/dashboard/revenue-card';
import { MonthlyChart } from '@/components/dashboard/monthly-chart';
import { Badge } from '@/components/ui/badge';

export default async function DashboardPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const stats = await getDashboardStats(user.tenantId);
  const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour {user.firstName} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pilotage Start Academy — données importées depuis SmartOF.
        </p>
      </div>

      {/* Bloc CA pilotage */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pilotage commercial
          </h2>
          <Link href="/app/sessions" className="text-xs text-primary hover:underline">
            Voir toutes les sessions →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <RevenueCard
            icon={TrendingUp}
            label="CA prévisionnel"
            amount={stats.ca.forecast}
            hint={`${stats.counts.upcomingSessions} sessions à venir`}
            tone="primary"
          />
          <RevenueCard
            icon={Clock}
            label="CA 30 prochains jours"
            amount={stats.ca.upcoming30days}
            hint="sessions qui démarrent bientôt"
          />
          <RevenueCard
            icon={Banknote}
            label="À facturer"
            amount={stats.ca.pastNotInvoiced}
            hint={`${stats.counts.sessionsToClose} sessions à clore`}
            tone={stats.counts.sessionsToClose > 0 ? 'warning' : 'default'}
          />
          <RevenueCard
            icon={Euro}
            label="Encaissé (lot 2)"
            amount={stats.ca.collected}
            hint="Module Factures à venir"
          />
        </div>
      </section>

      {/* Bloc activité */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Activité
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Apprenants"
            value={stats.counts.persons}
            hint={`${stats.counts.eiOrganizations} EI / Auto-entr.`}
          />
          <StatCard
            icon={Calendar}
            label="Sessions"
            value={stats.counts.sessions}
            hint={`${stats.counts.upcomingSessions} à venir`}
          />
          <StatCard
            icon={Building2}
            label="Organisations"
            value={stats.counts.orgs}
            hint={`${stats.counts.ageficeProfiles} profils AGEFICE prêts`}
          />
          <StatCard
            icon={AlertCircle}
            label="À nettoyer"
            value={stats.counts.cleanupPersons + stats.counts.cleanupOrgs}
            hint={`${stats.counts.cleanupPersons} apprenants · ${stats.counts.cleanupOrgs} organisations`}
            tone={stats.counts.cleanupPersons + stats.counts.cleanupOrgs > 0 ? 'warning' : 'default'}
          />
        </div>
      </section>

      {(stats.counts.cleanupPersons + stats.counts.cleanupOrgs) > 0 && (
        <CleanupCard nbPersons={stats.counts.cleanupPersons} nbOrgs={stats.counts.cleanupOrgs} />
      )}

      {/* Sessions par mois */}
      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold">Sessions et CA par mois</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Survole les barres pour voir le CA exact
            </p>
          </div>
        </div>
        <MonthlyChart data={stats.byMonth} />
      </section>

      {/* Top entreprises + produits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Top 5 commanditaires
          </h2>
          {stats.topSponsors.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Pas encore de commanditaires.</p>
          ) : (
            <ul className="space-y-2">
              {stats.topSponsors.map((s, i) => (
                <li key={s.orgId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                  <div className="h-7 w-7 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center font-semibold text-xs shrink-0">
                    {i + 1}
                  </div>
                  <Link
                    href={`/app/organisations/${s.orgId}`}
                    className="flex-1 min-w-0 truncate text-sm font-medium hover:text-primary"
                  >
                    {s.legalName}
                  </Link>
                  <div className="text-right text-xs">
                    <div className="font-semibold tabular-nums">{fmt.format(s.revenue)} €</div>
                    <div className="text-muted-foreground">{s.sessions} session{s.sessions > 1 ? 's' : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Top 5 formations
          </h2>
          {stats.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Pas encore de formations.</p>
          ) : (
            <ul className="space-y-2">
              {stats.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                  <div className="h-7 w-7 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center font-semibold text-xs shrink-0">
                    {i + 1}
                  </div>
                  <Link
                    href={`/app/produits/${p.productId}`}
                    className="flex-1 min-w-0 truncate text-sm font-medium hover:text-primary"
                  >
                    {p.title}
                  </Link>
                  <div className="text-right text-xs">
                    <div className="font-semibold tabular-nums">{p.participants}</div>
                    <div className="text-muted-foreground">apprenants · {p.sessions} sess.</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sessions récentes */}
      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Dernières sessions
          </h2>
          <Link href="/app/sessions" className="text-xs text-primary hover:underline">
            Toutes →
          </Link>
        </div>
        <div className="space-y-2">
          {stats.recentSessions.map((s) => (
            <Link
              key={s.id}
              href={`/app/sessions/${s.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              <Badge variant="muted" className="font-mono shrink-0">{s.code}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{s.name ?? '(sans nom)'}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(s.startDate).toLocaleDateString('fr-FR')} · {s.nbParticipants} inscrit{s.nbParticipants > 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-right text-sm shrink-0">
                <div className="font-medium tabular-nums">{fmt.format(s.revenue)} €</div>
                <Badge variant="muted">{s.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold mb-2">Prochaines étapes</h2>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>
            <code className="font-mono">PersonOrOrgPicker</code> + wizard de création de session (palier 2.2)
          </li>
          <li>Module Factures avec numérotation continue + suivi encaissement (lot 2)</li>
          <li>Bouton magique "Pack fin de formation" en 1 clic (palier 4)</li>
          <li>Pré-remplissage AGEFICE pour les inscrits EI éligibles (palier 3)</li>
        </ul>
      </div>
    </div>
  );
}
