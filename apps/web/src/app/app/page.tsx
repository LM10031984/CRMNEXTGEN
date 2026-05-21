import Link from 'next/link';
import {
  Users, Calendar, BookOpen, AlertCircle, AlertTriangle, Building2,
  Euro, TrendingUp, Banknote, Clock, Sparkles, FileCheck, Inbox,
  Megaphone, Target, Activity, BarChart3, Trophy, Wallet, ChevronRight,
  PieChart,
} from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { getDashboardStats } from '@/lib/dashboard-stats';
import { getAgeficeBudgetSummary } from '@/server/actions/budget-agefice';
import { Badge } from '@/components/ui/badge';
import { FilterChips } from '@/components/ui/filter-chips';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { MonthlyChart } from '@/components/dashboard/monthly-chart';
import { SatisfactionOverviewPanel } from '@/components/dashboard/satisfaction-overview-panel';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtNb = new Intl.NumberFormat('fr-FR');
const pct = (n: number) => `${n.toFixed(0)}%`;

interface SP {
  year?: string;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const sp = await searchParams;
  const yearParam = sp.year ? parseInt(sp.year, 10) : null;
  const year = Number.isFinite(yearParam) ? yearParam : null;

  const stats = await getDashboardStats(user.tenantId, year);
  const yearLabel = year != null ? String(year) : 'Toutes années';

  // Budget AGEFICE : on cible toujours l'année calendaire en cours pour
  // l'encart pipeline (le plafond 3000€ est annuel par apprenant).
  const ageficeYear = year ?? new Date().getFullYear();
  const ageficeSummary = await getAgeficeBudgetSummary(ageficeYear);

  // Filtre années
  const yearChips = [
    { label: 'Toutes années', href: '/app', active: year === null },
    ...stats.filters.availableYears.map((y) => ({
      label: String(y),
      href: `/app?year=${y}`,
      active: year === y,
    })),
  ];

  // Alertes total
  const totalAlerts =
    stats.alerts.pastWithoutInvoice +
    stats.alerts.sessionsToClose +
    stats.alerts.opcoMissingApproval +
    stats.counts.cleanupPersons +
    stats.counts.cleanupOrgs;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bonjour {user.firstName} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pilotage Start Academy · <strong>{yearLabel}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/sessions/nouvelle"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            <Calendar className="h-4 w-4" /> Nouvelle session
          </Link>
          <Link
            href="/app/preinscriptions"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors"
          >
            <Inbox className="h-4 w-4" /> Pré-inscription
          </Link>
        </div>
      </div>

      {/* Onglets dashboard : Pilotage (vue actuelle) / Bilan Qualiopi C1.i2 */}
      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px">
          <span className="inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 border-primary text-primary font-medium">
            <BarChart3 className="h-4 w-4" /> Pilotage
          </span>
          <Link
            href={`/app/qualiopi-bilan${year ? `?year=${year}` : ''}` as any}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            <PieChart className="h-4 w-4" /> Bilan Qualiopi
          </Link>
        </nav>
      </div>

      {/* Filtre année */}
      <FilterChips chips={yearChips} />

      {/* À l'essentiel — UX-11 : 4 KPI prioritaires en grand */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            À l'essentiel
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PrioCard
            icon={Euro}
            label="CA encaissé"
            value={fmtEUR.format(stats.ca.collected)}
            sub={`${pct((stats.ca.collected / Math.max(1, stats.ca.invoiced)) * 100)} du facturé`}
            accent="success"
            href="/app/factures?status=PAID"
          />
          <PrioCard
            icon={Wallet}
            label={`AGEFICE ${ageficeYear}`}
            value={fmtEUR.format(ageficeSummary.totalRemaining)}
            sub={`${ageficeSummary.withBudgetLeft} apprenant${ageficeSummary.withBudgetLeft > 1 ? 's' : ''} mobilisable${ageficeSummary.withBudgetLeft > 1 ? 's' : ''}`}
            accent="primary"
            href={`/app/budget-agefice?filter=has_budget_left&year=${ageficeYear}`}
          />
          <PrioCard
            icon={Calendar}
            label="Sessions à venir"
            value={fmtNb.format(stats.pipeline.upcomingSessions)}
            sub={`${fmtEUR.format(stats.pipeline.upcomingForecast)} CA prévu`}
            accent="default"
            href="/app/sessions?filter=upcoming"
          />
          <PrioCard
            icon={Target}
            label="Taux remplissage"
            value={pct(stats.performance.avgFillRate)}
            sub={`sur ${fmtNb.format(stats.performance.nbSessions)} session${stats.performance.nbSessions > 1 ? 's' : ''}`}
            accent={stats.performance.avgFillRate < 50 ? 'warning' : 'default'}
          />
        </div>
      </section>

      {/* Indicateurs détaillés — UX-11 : repliable, fermé par défaut */}
      <CollapsibleSection
        id="dashboard-detailed"
        title="Indicateurs détaillés"
        subtitle="CA, cashflow, volumes & moyennes"
        icon={<BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      >
        {/* Bandeau CA */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chiffre d'affaires {yearLabel.toLowerCase()}
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <CaCard icon={TrendingUp} label="CA prévu" value={stats.ca.total} accent="primary" href={`/app/inscriptions${year ? `?year=${year}` : ''}`} />
            <CaCard icon={FileCheck} label="CA signé" value={stats.ca.signed} hint="validé/en cours/clos" href={`/app/sessions?filter=signed`} />
            <CaCard icon={Clock} label="CA à venir" value={stats.ca.upcoming} hint={`${stats.counts.upcomingSessions} sessions`} href="/app/sessions?filter=upcoming" />
            <CaCard icon={Banknote} label="Facturé" value={stats.ca.invoiced} href="/app/factures" />
            <CaCard icon={Euro} label="Encaissé" value={stats.ca.collected} accent="success" href="/app/factures?status=PAID" />
            <CaCard icon={AlertCircle} label="Reste à encaisser" value={stats.ca.remaining} accent={stats.ca.remaining > 0 ? 'warning' : 'default'} href="/app/factures?onlyUnpaid=1" />
          </div>
        </div>

        {/* Cashflow : DSO + factures en attente */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cashflow
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
            <PerfCard
              icon={Clock}
              label={`DSO ${stats.cashflow.nbInvoicesPaid > 0 ? `(${stats.cashflow.nbInvoicesPaid} payées)` : ''}`}
              value={stats.cashflow.dso !== null ? `${stats.cashflow.dso} j` : '—'}
            />
            <PerfCard
              icon={AlertCircle}
              label="Factures en attente"
              value={fmtNb.format(stats.cashflow.nbInvoicesPending)}
            />
          </div>
        </div>

        {/* Performance */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Performance — moyennes & volumes
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <PerfCard icon={Calendar} label="Sessions" value={fmtNb.format(stats.performance.nbSessions)} />
            <PerfCard icon={Users} label="Apprenants" value={fmtNb.format(stats.performance.nbParticipants)} />
            <PerfCard icon={Activity} label="Heures formées" value={fmtNb.format(stats.performance.totalHours)} />
            <PerfCard icon={Target} label="Taux remplissage" value={pct(stats.performance.avgFillRate)} />
            <PerfCard icon={Euro} label="CA / session" value={fmtEUR.format(stats.performance.avgRevenuePerSession)} />
            <PerfCard icon={Euro} label="CA / apprenant" value={fmtEUR.format(stats.performance.avgRevenuePerLearner)} />
            <PerfCard icon={Clock} label="CA / heure" value={fmtEUR.format(stats.performance.revenuePerHour)} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Alertes + Pipeline */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold inline-flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-700" /> Sessions à risque
            {totalAlerts > 0 && <Badge variant="warning">{totalAlerts}</Badge>}
          </h2>
          {totalAlerts === 0 ? (
            <p className="text-sm text-amber-900">Aucune alerte. Tout est sous contrôle 🎯</p>
          ) : (
            <ul className="space-y-2 text-sm text-amber-900">
              <AlertRow label="Sessions passées non facturées" count={stats.alerts.pastWithoutInvoice} href="/app/factures" />
              <AlertRow label="Sessions passées non clôturées" count={stats.alerts.sessionsToClose} href="/app/sessions?filter=completed" />
              <AlertRow label="Dossiers OPCO sans validation" count={stats.alerts.opcoMissingApproval} href="/app/dossiers-opco" />
              <AlertRow label="Apprenants à corriger" count={stats.counts.cleanupPersons} href="/app/apprenants?filter=cleanup" />
              <AlertRow label="Organisations à corriger" count={stats.counts.cleanupOrgs} href="/app/organisations?filter=cleanup" />
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-5">
          <h2 className="font-semibold inline-flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary" /> Pipeline commercial
          </h2>
          <ul className="space-y-2 text-sm">
            <PipelineRow icon={Megaphone} label="Leads à relancer / qualifier" value={stats.pipeline.leadsToFollowup} href="/app/leads" />
            <PipelineRow icon={Inbox} label="Pré-inscriptions à valider" value={stats.pipeline.preEnrollmentsToValidate} href="/app/preinscriptions" />
            <PipelineRow icon={Calendar} label={`Sessions à venir (${fmtNb.format(stats.alerts.sessionsNext7Days)} dans 7 jours)`} value={stats.pipeline.upcomingSessions} href="/app/sessions" />
            <PipelineRow
              icon={Wallet}
              label={`Apprenants avec budget AGEFICE restant ${ageficeYear}`}
              value={ageficeSummary.withBudgetLeft}
              href={`/app/budget-agefice?filter=has_budget_left&year=${ageficeYear}`}
            />
            <li className="pt-3 border-t border-primary-200 mt-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">CA prévu sessions à venir</span>
              <strong className="text-primary-800 tabular-nums">{fmtEUR.format(stats.pipeline.upcomingForecast)}</strong>
            </li>
            <li className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Budget AGEFICE encore mobilisable</span>
              <strong className="text-emerald-700 tabular-nums">{fmtEUR.format(ageficeSummary.totalRemaining)}</strong>
            </li>
          </ul>
        </div>
      </section>

      {/* Top sessions / Top produits / Top sponsors */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <TopList
          title="Top 5 sessions rentables"
          icon={Trophy}
          rows={stats.topSessions.map((s) => ({
            href: `/app/sessions/${s.id}`,
            primary: s.name ?? s.code ?? 'Sans nom',
            secondary: `${s.nbParticipants} apprenant${s.nbParticipants > 1 ? 's' : ''} · ${new Date(s.startDate).toLocaleDateString('fr-FR')}`,
            value: fmtEUR.format(s.revenue),
          }))}
        />
        <TopList
          title="Top 5 produits CA"
          icon={BookOpen}
          rows={stats.topProducts.map((p) => ({
            href: `/app/produits/${p.productId}`,
            primary: p.title,
            secondary: `${p.participants} apprenants · ${p.sessions} sessions`,
            value: fmtEUR.format(p.revenue),
          }))}
        />
        <TopList
          title="Top 5 commanditaires"
          icon={Building2}
          rows={stats.topSponsors.map((s) => ({
            href: `/app/organisations/${s.orgId}`,
            primary: s.legalName,
            secondary: `${s.sessions} sessions`,
            value: fmtEUR.format(s.revenue),
          }))}
        />
      </section>

      {/* Chart mois */}
      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Sessions et CA par mois
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Survole les barres pour voir les valeurs exactes
            </p>
          </div>
        </div>
        <MonthlyChart data={stats.byMonth.map((m) => ({ month: m.month, sessions: m.sessions, revenue: m.revenue }))} />
      </section>

      {/* Satisfaction globale + par session — Qualiopi i30 */}
      <SatisfactionOverviewPanel tenantId={user.tenantId} />

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
                <div className="font-medium tabular-nums">{fmtEUR.format(s.revenue)}</div>
                <Badge variant="muted">{s.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * KPI prioritaire — format grand pour la section "À l'essentiel" (UX-11).
 * Plus visible que CaCard / PerfCard : icône bg colorée, valeur en text-2xl, sub.
 */
function PrioCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'default',
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: 'primary' | 'success' | 'warning' | 'default';
  href?: string;
}) {
  const palette = {
    primary: { card: 'border-primary-200 bg-primary-50/50', iconBox: 'bg-primary-100 text-primary-700' },
    success: { card: 'border-emerald-200 bg-emerald-50/50', iconBox: 'bg-emerald-100 text-emerald-700' },
    warning: { card: 'border-amber-200 bg-amber-50/50', iconBox: 'bg-amber-100 text-amber-800' },
    default: { card: 'border-border bg-white', iconBox: 'bg-muted text-foreground' },
  }[accent];
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-2">
        <span className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${palette.iconBox}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium leading-tight">
          {label}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href as any}
        className={`block rounded-2xl border p-5 transition-colors hover:border-primary/40 hover:shadow-sm ${palette.card}`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={`rounded-2xl border p-5 ${palette.card}`}>{inner}</div>;
}

function CaCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
  accent?: 'primary' | 'success' | 'warning' | 'default';
  href?: string;
}) {
  const cls =
    accent === 'primary'
      ? 'border-primary-200 bg-primary-50/50'
      : accent === 'success'
        ? 'border-emerald-200 bg-emerald-50/50'
        : accent === 'warning'
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-border bg-white';
  const iconCls =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'success'
        ? 'text-emerald-700'
        : accent === 'warning'
          ? 'text-amber-700'
          : 'text-muted-foreground';
  const inner = (
    <>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80 mb-2 ${iconCls}`}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{fmtEUR.format(value)}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href as any}
        className={`rounded-xl border p-4 ${cls} block hover:shadow-sm hover:scale-[1.01] transition-all cursor-pointer`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={`rounded-xl border p-4 ${cls}`}>{inner}</div>;
}

function PerfCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
    </div>
  );
}

function AlertRow({ label, count, href }: { label: string; count: number; href: string }) {
  if (count === 0) return null;
  return (
    <li>
      <Link href={href as any} className="flex items-center justify-between p-2 rounded hover:bg-amber-100/60 transition-colors">
        <span>{label}</span>
        <span className="inline-flex items-center gap-2">
          <Badge variant="warning">{count}</Badge>
          <ChevronRight className="h-3.5 w-3.5 text-amber-700" />
        </span>
      </Link>
    </li>
  );
}

function PipelineRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <li>
      <Link href={href as any} className="flex items-center justify-between p-2 rounded hover:bg-primary-100/60 transition-colors">
        <span className="inline-flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary-700" /> {label}
        </span>
        <span className="inline-flex items-center gap-2">
          <strong className="tabular-nums">{value}</strong>
          <ChevronRight className="h-3.5 w-3.5 text-primary-700" />
        </span>
      </Link>
    </li>
  );
}

function TopList({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: Array<{ href: string; primary: string; secondary: string; value: string }>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <h2 className="font-semibold mb-3 inline-flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucune donnée pour la période sélectionnée.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i}>
              <Link
                href={r.href as any}
                title={r.primary}
                className="flex gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="h-6 w-6 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center font-semibold text-[10px] shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug break-words">{r.primary}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{r.secondary}</span>
                    <span aria-hidden>·</span>
                    <span className="font-semibold text-foreground tabular-nums">{r.value}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
