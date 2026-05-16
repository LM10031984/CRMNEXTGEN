import { redirect } from 'next/navigation';
import { Users, Trophy, TrendingUp, Clock } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { getCommercialsWithKpis } from '@/lib/lead-load-stats';
import { LeadLoadTable } from '@/components/leads/lead-load-table';
import { LeadDistributionPie } from '@/components/leads/lead-distribution-pie';
import { Breadcrumb } from '@/components/ui/breadcrumb';

/**
 * Vue de charge distribution leads (Phase 9 Plan 09-03 — LEAD-02 / D-04 CONTEXT.md).
 *
 * RBAC : ADMIN + MANAGER (hasRole guard — sinon redirect '/app').
 *
 * 4 KPI globaux (haut de page, PrioCardLocal) :
 *  1. totalLeadsActifs       = somme leadsActifs sur tous commerciaux
 *  2. totalWonThisMonth      = somme leadsWonThisMonth sur tous commerciaux
 *  3. conversionGlobale      = round((WON tous owners) / (total attribués tous owners) * 100)
 *  4. avgDaysGlobal          = moyenne des avgDaysToWin non-null (ou '—' si vide)
 *
 * Body :
 *  - À gauche (col-span-2 desktop) : `LeadLoadTable` (commercial × 4 KPI).
 *  - À droite : `LeadDistributionPie` (camembert répartition leads actifs).
 *
 * Pattern Server Component : `validateRequest` + `hasRole`, puis fetch + render.
 * `dynamic = 'force-dynamic'` car les KPI doivent être temps réel (et sécurité
 * admin) — pas de cache.
 */
export const dynamic = 'force-dynamic';

// Palette accessible : tons primary/emerald/amber/sky/red attestés Phase 6 audit a11y.
const PIE_COLORS = [
  '#00527A', // primary
  '#10B981', // emerald
  '#F59E0B', // amber
  '#0EA5E9', // sky
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
];

export default async function LeadsChargePage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (!hasRole(user, ['ADMIN', 'MANAGER'])) redirect('/app');

  const rows = await getCommercialsWithKpis(user.tenantId);

  // KPI globaux dérivés du helper.
  const totalLeadsActifs = rows.reduce((s, r) => s + r.kpis.leadsActifs, 0);
  const totalWonThisMonth = rows.reduce(
    (s, r) => s + r.kpis.leadsWonThisMonth,
    0,
  );

  // Conversion globale = WON tous owners / total attribués tous owners.
  // Calcul séparé du helper car le helper renvoie déjà des KPI par commercial,
  // pas les totaux brut nécessaires au calcul d'une moyenne pondérée.
  const [globalWon, globalAttributed] = await Promise.all([
    prisma.lead.count({
      where: {
        tenantId: user.tenantId,
        status: 'WON',
        ownerUserId: { not: null },
      },
    }),
    prisma.lead.count({
      where: { tenantId: user.tenantId, ownerUserId: { not: null } },
    }),
  ]);
  const conversionGlobale =
    globalAttributed > 0
      ? Math.round((globalWon / globalAttributed) * 100)
      : 0;

  const avgDaysVals = rows
    .map((r) => r.kpis.avgDaysToWin)
    .filter((v): v is number => v !== null);
  const avgDaysGlobal =
    avgDaysVals.length > 0
      ? Math.round(avgDaysVals.reduce((s, v) => s + v, 0) / avgDaysVals.length)
      : null;

  // Camembert : 1 slice par commercial actif (leadsActifs > 0). Couleurs cyclées
  // sur la palette pour rester déterministes (modulo).
  const slices = rows
    .filter((r) => r.kpis.leadsActifs > 0)
    .map((r, i) => ({
      label: r.name || `Commercial ${i + 1}`,
      value: r.kpis.leadsActifs,
      color: PIE_COLORS[i % PIE_COLORS.length]!,
    }));

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Leads', href: '/app/leads' },
          { label: 'Vue de charge' },
        ]}
      />
      <header>
        <h1 className="text-2xl font-semibold">
          Vue de charge — Distribution leads
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Charge active et performance commerciale (mise à jour temps réel).
        </p>
      </header>

      <section
        aria-label="Indicateurs globaux"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <PrioCardLocal
          icon={Users}
          label="Leads en cours"
          value={totalLeadsActifs.toString()}
          subtitle="tous commerciaux"
        />
        <PrioCardLocal
          icon={Trophy}
          label="Gagnés ce mois"
          value={totalWonThisMonth.toString()}
          subtitle="status = WON"
        />
        <PrioCardLocal
          icon={TrendingUp}
          label="Taux conversion"
          value={`${conversionGlobale}%`}
          subtitle="historique global"
        />
        <PrioCardLocal
          icon={Clock}
          label="Temps moyen lead → signature"
          value={avgDaysGlobal !== null ? `${avgDaysGlobal} j` : '—'}
          subtitle="moyenne des commerciaux avec WON"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Détail par commercial</h2>
          <LeadLoadTable rows={rows} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">Répartition leads actifs</h2>
          <LeadDistributionPie slices={slices} />
        </div>
      </section>
    </div>
  );
}

/**
 * Mini-clone local de `PrioCard` (dashboard Phase 6 `app/app/page.tsx`).
 * Volontairement local car PrioCard n'est pas exporté depuis `components/ui/`
 * (composant dashboard interne). Si refacto futur l'expose, bascule vers
 * `@/components/ui/prio-card`.
 */
function PrioCardLocal({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium leading-tight">
          {label}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-tight">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      )}
    </div>
  );
}
