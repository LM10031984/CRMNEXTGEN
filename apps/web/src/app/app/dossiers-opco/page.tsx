import Link from 'next/link';
import { ClipboardCheck, FileCheck, Wallet, AlertCircle, TrendingUp, Briefcase, Download } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { FilterChips } from '@/components/ui/filter-chips';
import { formatFunderCode } from '@/lib/funder-codes';
import { DossierTimeline } from '@/components/dossiers-opco/dossier-timeline';
import { DossiersOpcoSearchInput } from '@/components/dossiers-opco/search-input';
import { SortableTh, type SortKey, type SortDir } from '@/components/dossiers-opco/sortable-th';
import { BudgetAgeficeBar } from '@/components/dossiers-opco/budget-agefice-bar';
import { DossierReminderButton } from '@/components/dossiers-opco/reminder-button';
import { EmitInvoiceButton } from '@/components/dossiers-opco/emit-invoice-button';
import { DossierSelectionProvider } from '@/components/dossiers-opco/selection-context';
import { DossierRowCheckbox } from '@/components/dossiers-opco/row-checkbox';
import { DossierSelectAllCheckbox } from '@/components/dossiers-opco/select-all-checkbox';
import { DossierSelectionBar } from '@/components/dossiers-opco/selection-bar';
import { GroupModeToggle } from '@/components/dossiers-opco/group-mode-toggle';
import { GroupRowExpander, type GroupAggregate } from '@/components/dossiers-opco/group-row';
import { ComposeOpcoButton } from '@/components/dossiers-opco/compose-opco-button';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtNb = new Intl.NumberFormat('fr-FR');
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

type FilterStatus = 'all' | 'a-facturer' | 'attente-opco' | 'attente-client' | 'complet';
type FilterType = 'all' | 'formation' | 'preinscription_budget';

interface SP {
  year?: string;
  opco?: string;
  status?: FilterStatus;
  q?: string;
  sort?: SortKey;
  dir?: SortDir;
  /** US-006 : si '1', regroupe les rows par sponsor + session */
  group?: string;
  /** US-008 : filtre type de dossier (formation | preinscription_budget) */
  type?: FilterType;
}

export default async function DossiersOpcoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const sp = await searchParams;

  // Construit le where
  const where: Prisma.SessionParticipantWhereInput = {
    session: { tenantId: user.tenantId },
  };
  if (sp.year && sp.year !== 'all') {
    const y = parseInt(sp.year, 10);
    if (Number.isFinite(y)) {
      where.session = {
        tenantId: user.tenantId,
        startDate: {
          gte: new Date(Date.UTC(y, 0, 1)),
          lt: new Date(Date.UTC(y + 1, 0, 1)),
        },
      };
    }
  }
  if (sp.opco && sp.opco !== 'all') {
    where.sponsorOrg = { opcoCode: sp.opco };
  }
  if (sp.status === 'a-facturer') where.invoiceSent = false;
  if (sp.status === 'attente-opco') {
    where.invoiceSent = true;
    where.opcoReimbursed = false;
  }
  if (sp.status === 'attente-client') {
    where.invoiceSent = true;
    where.paymentReceived = false;
  }
  if (sp.status === 'complet') {
    where.invoiceSent = true;
    where.opcoReimbursed = true;
    where.paymentReceived = true;
  }
  // US-008 : filtre type de dossier
  if (sp.type === 'formation') where.dossierType = 'FORMATION';
  if (sp.type === 'preinscription_budget') where.dossierType = 'PREINSCRIPTION_BUDGET';
  // Recherche full-text (US-003) : nom apprenant, sponsor, formation
  const q = sp.q?.trim();
  if (q) {
    where.OR = [
      { person: { firstName: { contains: q, mode: 'insensitive' } } },
      { person: { lastName: { contains: q, mode: 'insensitive' } } },
      { person: { email: { contains: q, mode: 'insensitive' } } },
      { sponsorOrg: { legalName: { contains: q, mode: 'insensitive' } } },
      { session: { code: { contains: q, mode: 'insensitive' } } },
      { session: { name: { contains: q, mode: 'insensitive' } } },
      { session: { product: { title: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  // Tri (US-004) : par défaut date desc. Cycle asc → desc → reset.
  const sortKey: SortKey | null =
    sp.sort && ['date', 'apprenant', 'montant', 'opco'].includes(sp.sort)
      ? sp.sort
      : null;
  const sortDir: SortDir = sp.dir === 'asc' ? 'asc' : 'desc';
  let orderBy: Prisma.SessionParticipantOrderByWithRelationInput | Prisma.SessionParticipantOrderByWithRelationInput[];
  switch (sortKey) {
    case 'apprenant':
      orderBy = [{ person: { lastName: sortDir } }, { person: { firstName: sortDir } }];
      break;
    case 'montant':
      orderBy = { priceHT: sortDir };
      break;
    case 'opco':
      orderBy = { sponsorOrg: { opcoCode: sortDir } };
      break;
    case 'date':
      orderBy = { session: { startDate: sortDir } };
      break;
    default:
      orderBy = { session: { startDate: 'desc' } };
  }

  // Fetch
  const [rows, totalAll, kpiToInvoice, kpiToReimburse, kpiToCollect, kpiComplete] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where,
      orderBy,
      take: 500,
      select: {
        id: true,
        personId: true,
        priceHT: true,
        amountCollected: true,
        invoiceSent: true,
        opcoApproved: true,
        opcoReimbursed: true,
        paymentReceived: true,
        invoiceSentAt: true,
        opcoApprovedAt: true,
        opcoReimbursedAt: true,
        paymentReceivedAt: true,
        financingMode: true,
        financingRequestDate: true,
        dossierType: true,
        person: { select: { firstName: true, lastName: true } },
        sponsorOrg: {
          select: { id: true, legalName: true, opcoCode: true, network: true },
        },
        session: {
          select: { id: true, code: true, name: true, startDate: true, endDate: true },
        },
      },
    }),
    prisma.sessionParticipant.count({ where: { session: { tenantId: user.tenantId } } }),
    prisma.sessionParticipant.aggregate({
      where: { session: { tenantId: user.tenantId }, invoiceSent: false },
      _sum: { priceHT: true },
      _count: { id: true },
    }),
    prisma.sessionParticipant.aggregate({
      where: { session: { tenantId: user.tenantId }, invoiceSent: true, opcoReimbursed: false },
      _sum: { priceHT: true },
      _count: { id: true },
    }),
    prisma.sessionParticipant.aggregate({
      where: { session: { tenantId: user.tenantId }, invoiceSent: true, paymentReceived: false },
      _sum: { priceHT: true },
      _count: { id: true },
    }),
    prisma.sessionParticipant.count({
      where: {
        session: { tenantId: user.tenantId },
        invoiceSent: true,
        opcoReimbursed: true,
        paymentReceived: true,
      },
    }),
  ]);

  // US-008 : nombre de dossiers de pré-inscription budget pour la chip filtre
  const preinscriptionBudgetCount = await prisma.sessionParticipant.count({
    where: {
      session: { tenantId: user.tenantId },
      dossierType: 'PREINSCRIPTION_BUDGET',
    },
  });

  // Aggrégations sur le résultat filtré pour la barre de stats
  const totalShown = rows.length;
  const sumHT = rows.reduce((s, r) => s + Number(r.priceHT), 0);
  const sumCollected = rows.reduce((s, r) => s + Number(r.amountCollected), 0);

  // US-014 : objectif CA mensuel + barre progression. CA encaissé du mois courant
  // = somme priceHT des SessionParticipant dont opcoReimbursedAt OR paymentReceivedAt
  // est dans le mois courant. Configurable via MONTHLY_REVENUE_TARGET.
  const monthlyTarget = Number(process.env.MONTHLY_REVENUE_TARGET ?? '0');
  let monthlyCollected = 0;
  if (monthlyTarget > 0) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthlyAgg = await prisma.sessionParticipant.aggregate({
      where: {
        session: { tenantId: user.tenantId },
        OR: [
          { opcoReimbursedAt: { gte: monthStart, lt: monthEnd } },
          { paymentReceivedAt: { gte: monthStart, lt: monthEnd } },
        ],
      },
      _sum: { priceHT: true },
    });
    monthlyCollected = Number(monthlyAgg._sum.priceHT ?? 0);
  }
  const monthlyPct =
    monthlyTarget > 0 ? Math.min(100, Math.round((monthlyCollected / monthlyTarget) * 100)) : 0;

  // US-007 : budget AGEFICE consommé par apprenant sur l'année courante.
  // Pour chaque person AGEFICE de la liste, agrège tous les SessionParticipant
  // AGEFICE dont financingRequestDate (ou session.startDate fallback) est en
  // {currentYear}. La barre de progression dans la cellule OPCO l'utilise.
  const currentYear = new Date().getFullYear();
  const ageficePersonIds = Array.from(
    new Set(rows.filter((r) => r.sponsorOrg?.opcoCode === 'AGEFICE').map((r) => r.personId)),
  );
  const ageficeYearStart = new Date(Date.UTC(currentYear, 0, 1));
  const ageficeYearEnd = new Date(Date.UTC(currentYear + 1, 0, 1));
  const budgetByPerson = new Map<string, number>();
  if (ageficePersonIds.length > 0) {
    const allAgeficeParticipations = await prisma.sessionParticipant.findMany({
      where: {
        personId: { in: ageficePersonIds },
        sponsorOrg: { opcoCode: 'AGEFICE' },
        OR: [
          { financingRequestDate: { gte: ageficeYearStart, lt: ageficeYearEnd } },
          {
            financingRequestDate: null,
            session: { startDate: { gte: ageficeYearStart, lt: ageficeYearEnd } },
          },
        ],
      },
      select: { personId: true, priceHT: true },
    });
    for (const p of allAgeficeParticipations) {
      budgetByPerson.set(p.personId, (budgetByPerson.get(p.personId) ?? 0) + Number(p.priceHT));
    }
  }

  // Liste des années disponibles (basée sur les sessions du tenant)
  const yearsRaw = await prisma.trainingSession.findMany({
    where: { tenantId: user.tenantId, startDate: { not: undefined } },
    select: { startDate: true },
    distinct: ['startDate'],
  });
  const years = Array.from(new Set(yearsRaw.map((s) => s.startDate.getUTCFullYear()))).sort((a, b) => b - a);

  const opcos = ['AGEFICE', 'OPCO_EP', 'ATLAS', 'CPF', 'FI-FPL', 'OPCOMMERCE'];

  const yearChips = [
    { label: 'Toutes années', href: hrefWith(sp, { year: 'all' }), active: !sp.year || sp.year === 'all' },
    ...years.map((y) => ({
      label: String(y),
      href: hrefWith(sp, { year: String(y) }),
      active: sp.year === String(y),
    })),
  ];

  const opcoChips = [
    { label: 'Tous OPCO', href: hrefWith(sp, { opco: 'all' }), active: !sp.opco || sp.opco === 'all' },
    ...opcos.map((o) => ({
      label: o,
      href: hrefWith(sp, { opco: o }),
      active: sp.opco === o,
    })),
  ];

  const statusChips = [
    { label: 'Tous statuts', href: hrefWith(sp, { status: 'all' }), active: !sp.status || sp.status === 'all' },
    { label: 'À facturer', href: hrefWith(sp, { status: 'a-facturer' }), active: sp.status === 'a-facturer' },
    { label: 'Attente OPCO', href: hrefWith(sp, { status: 'attente-opco' }), active: sp.status === 'attente-opco' },
    { label: 'Attente client', href: hrefWith(sp, { status: 'attente-client' }), active: sp.status === 'attente-client' },
    { label: 'Complets', href: hrefWith(sp, { status: 'complet' }), active: sp.status === 'complet' },
  ];

  // US-008 : chips type de dossier (n'apparaît que si au moins 1 pré-inscription budget existe)
  const typeChips =
    preinscriptionBudgetCount > 0
      ? [
          { label: 'Tous types', href: hrefWith(sp, { type: 'all' }), active: !sp.type || sp.type === 'all' },
          { label: 'Formations', href: hrefWith(sp, { type: 'formation' }), active: sp.type === 'formation' },
          {
            label: `Pré-inscription budget (${preinscriptionBudgetCount})`,
            href: hrefWith(sp, { type: 'preinscription_budget' }),
            active: sp.type === 'preinscription_budget',
          },
        ]
      : null;

  // KPI trésorerie globale (US-002) : SUM(à_facturer + attente_opco + attente_client)
  const treso =
    Number(kpiToInvoice._sum.priceHT ?? 0) +
    Number(kpiToReimburse._sum.priceHT ?? 0) +
    Number(kpiToCollect._sum.priceHT ?? 0);
  const tresoDossiers = kpiToInvoice._count.id + kpiToReimburse._count.id + kpiToCollect._count.id;

  // URL de l'export CSV — reprend les filtres courants
  const exportUrl = (() => {
    const params = new URLSearchParams();
    if (sp.year) params.set('year', sp.year);
    if (sp.opco) params.set('opco', sp.opco);
    if (sp.status) params.set('status', sp.status);
    if (q) params.set('q', q);
    return `/api/dossiers-opco/export${params.toString() ? `?${params.toString()}` : ''}`;
  })();

  const allRowIds = rows.map((r) => r.id);
  const groupedView = sp.group === '1';

  // US-006 : regroupement par (sessionId + sponsorOrgId). On groupe à
  // partir des rows déjà filtrées/triées. Les groupes sans sponsor (pas
  // d'opcoCode ni d'org) restent affichés en mode plat à la fin.
  type RowItem = (typeof rows)[number];
  const groupsMap = new Map<string, { agg: GroupAggregate; rows: RowItem[] }>();
  const ungrouped: RowItem[] = [];
  if (groupedView) {
    for (const r of rows) {
      if (!r.sponsorOrg?.id) {
        ungrouped.push(r);
        continue;
      }
      const key = `${r.session.id}::${r.sponsorOrg.id}`;
      let g = groupsMap.get(key);
      if (!g) {
        g = {
          agg: {
            sessionId: r.session.id,
            sessionStartDate: r.session.startDate,
            sessionName: r.session.name ?? r.session.code ?? '(sans nom)',
            sponsorOrgId: r.sponsorOrg.id,
            sponsorName: r.sponsorOrg.legalName,
            sponsorOpcoCode: r.sponsorOrg.opcoCode ?? null,
            participantCount: 0,
            totalHT: 0,
            allInvoiced: true,
            allReimbursed: true,
            allPaid: true,
          },
          rows: [],
        };
        groupsMap.set(key, g);
      }
      g.rows.push(r);
      g.agg.participantCount++;
      g.agg.totalHT += Number(r.priceHT);
      if (!r.invoiceSent) g.agg.allInvoiced = false;
      if (!r.opcoReimbursed) g.agg.allReimbursed = false;
      if (!r.paymentReceived) g.agg.allPaid = false;
    }
  }
  const groupsArr = Array.from(groupsMap.values());

  // Helper de rendu d'une row "détail" — utilisé en mode plat ET en
  // mode groupé (pour les rows enfants d'un groupe).
  function renderRow(r: RowItem, idx: number) {
    const isComplete =
      r.invoiceSent && r.opcoApproved && r.opcoReimbursed && r.paymentReceived;
    let daysWaiting = 0;
    if (!isComplete) {
      const refDate =
        r.opcoReimbursedAt ?? r.opcoApprovedAt ?? r.invoiceSentAt ?? r.session.endDate;
      daysWaiting = Math.max(
        0,
        Math.floor((Date.now() - refDate.getTime()) / 86400000),
      );
    }
    const lateLevel: 'none' | 'warn' | 'alert' = isComplete
      ? 'none'
      : daysWaiting > 60
        ? 'alert'
        : daysWaiting > 30
          ? 'warn'
          : 'none';
    const rowBg =
      lateLevel === 'alert'
        ? 'bg-red-50 hover:bg-red-100'
        : lateLevel === 'warn'
          ? 'bg-amber-50 hover:bg-amber-100'
          : `hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`;
    const ageficeBudget = budgetByPerson.get(r.personId);
    return (
      <tr
        key={r.id}
        className={`border-b border-border last:border-0 transition-colors ${rowBg}`}
      >
        <td className="px-3 py-2"><DossierRowCheckbox id={r.id} /></td>
        <td className="px-3 py-2 whitespace-nowrap text-xs">
          <Link href={`/app/sessions/${r.session.id}`} className="text-foreground hover:text-primary">
            {fmtDate.format(r.session.startDate)}
          </Link>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{r.person.firstName} {r.person.lastName}</span>
            {r.dossierType === 'PREINSCRIPTION_BUDGET' && (
              <Badge variant="warning" className="text-[10px] inline-flex items-center gap-1">
                <Wallet className="h-2.5 w-2.5" />
                Pré-inscription budget
              </Badge>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="text-sm">{r.sponsorOrg?.legalName ?? '—'}</div>
          {r.sponsorOrg?.network && r.sponsorOrg.network !== r.sponsorOrg.legalName && (
            <div className="text-[10px] text-muted-foreground">via {r.sponsorOrg.network}</div>
          )}
        </td>
        <td className="px-3 py-2">
          <Link
            href={`/app/sessions/${r.session.id}`}
            className="text-sm hover:text-primary line-clamp-1"
          >
            {r.session.name ?? r.session.code ?? '(sans nom)'}
          </Link>
        </td>
        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
          {fmtEUR.format(Number(r.priceHT))}
        </td>
        <td className="px-3 py-2">
          {r.sponsorOrg?.opcoCode ? (
            <>
              <Badge variant="muted" className="text-[10px]">
                {formatFunderCode(r.sponsorOrg.opcoCode)}
              </Badge>
              {r.sponsorOrg.opcoCode === 'AGEFICE' && ageficeBudget != null && (
                <BudgetAgeficeBar consumed={ageficeBudget} year={currentYear} />
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="inline-flex items-center gap-1">
            <DossierTimeline
              participantId={r.id}
              initial={{
                invoiceSent: r.invoiceSent,
                opcoApproved: r.opcoApproved,
                opcoReimbursed: r.opcoReimbursed,
                paymentReceived: r.paymentReceived,
                invoiceSentAt: r.invoiceSentAt,
                opcoApprovedAt: r.opcoApprovedAt,
                opcoReimbursedAt: r.opcoReimbursedAt,
                paymentReceivedAt: r.paymentReceivedAt,
              }}
            />
            {!r.invoiceSent && (
              <EmitInvoiceButton
                participantId={r.id}
                apprenantName={`${r.person.firstName} ${r.person.lastName}`}
                formationTitre={r.session.name ?? r.session.code ?? ''}
                amountHT={Number(r.priceHT)}
              />
            )}
            <ComposeOpcoButton
              participantId={r.id}
              disabled={!r.invoiceSent || isComplete}
            />
            <DossierReminderButton
              participantId={r.id}
              disabled={!r.invoiceSent || isComplete}
            />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <DossierSelectionProvider>
    <div className="space-y-6">
      <PageHeader
        title="Dossiers OPCO"
        subtitle={`Suivi facturation & encaissement par inscription · ${fmtNb.format(totalShown)} dossier${totalShown > 1 ? 's' : ''} affiché${totalShown > 1 ? 's' : ''} sur ${fmtNb.format(totalAll)} au total`}
      />

      {/* US-002 : Trésorerie globale en attente */}
      <section className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50/80 to-white p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary text-white p-2.5">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Trésorerie en attente
              </div>
              <div className="text-3xl font-bold tabular-nums text-primary-900 mt-0.5">
                {fmtEUR.format(treso)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {fmtNb.format(tresoDossiers)} dossier{tresoDossiers > 1 ? 's' : ''} · à facturer + attente OPCO + attente client
              </div>
            </div>
          </div>
          {/* grid-cols-3 OK même mobile : 3 KPI compacts (libellé court + montant tabular-nums) */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-right">
              <div className="text-muted-foreground">À facturer</div>
              <div className="font-semibold tabular-nums">{fmtEUR.format(Number(kpiToInvoice._sum.priceHT ?? 0))}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Attente OPCO</div>
              <div className="font-semibold tabular-nums">{fmtEUR.format(Number(kpiToReimburse._sum.priceHT ?? 0))}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Attente client</div>
              <div className="font-semibold tabular-nums">{fmtEUR.format(Number(kpiToCollect._sum.priceHT ?? 0))}</div>
            </div>
          </div>
        </div>

        {/* US-014 : objectif CA mensuel + barre progression */}
        {monthlyTarget > 0 && (
          <div className="mt-4 pt-4 border-t border-primary-200/50">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="text-muted-foreground">
                <strong className="text-foreground">Objectif {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
                {' · '}encaissé ce mois
              </div>
              <div className="tabular-nums">
                <strong className="text-foreground">{fmtEUR.format(monthlyCollected)}</strong>
                <span className="text-muted-foreground"> / {fmtEUR.format(monthlyTarget)}</span>
                <span className={`ml-2 font-semibold ${monthlyPct >= 100 ? 'text-emerald-700' : monthlyPct >= 70 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  {monthlyPct}%
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all ${monthlyPct >= 100 ? 'bg-emerald-500' : monthlyPct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
                style={{ width: `${monthlyPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* KPI globaux */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Wallet}
          label="À facturer"
          value={fmtEUR.format(Number(kpiToInvoice._sum.priceHT ?? 0))}
          hint={`${fmtNb.format(kpiToInvoice._count.id)} dossier${kpiToInvoice._count.id > 1 ? 's' : ''}`}
          tone="warning"
          href={hrefWith(sp, { status: 'a-facturer' })}
          active={sp.status === 'a-facturer'}
        />
        <KpiCard
          icon={AlertCircle}
          label="Attente remboursement OPCO"
          value={fmtEUR.format(Number(kpiToReimburse._sum.priceHT ?? 0))}
          hint={`${fmtNb.format(kpiToReimburse._count.id)} dossier${kpiToReimburse._count.id > 1 ? 's' : ''}`}
          tone="info"
          href={hrefWith(sp, { status: 'attente-opco' })}
          active={sp.status === 'attente-opco'}
        />
        <KpiCard
          icon={TrendingUp}
          label="Attente paiement client"
          value={fmtEUR.format(Number(kpiToCollect._sum.priceHT ?? 0))}
          hint={`${fmtNb.format(kpiToCollect._count.id)} dossier${kpiToCollect._count.id > 1 ? 's' : ''}`}
          tone="info"
          href={hrefWith(sp, { status: 'attente-client' })}
          active={sp.status === 'attente-client'}
        />
        <KpiCard
          icon={FileCheck}
          label="Dossiers complets"
          value={fmtNb.format(kpiComplete)}
          hint="facturé + remboursé + payé"
          tone="success"
          href={hrefWith(sp, { status: 'complet' })}
          active={sp.status === 'complet'}
        />
      </section>

      {/* Recherche full-text + Toggle mode + Export CSV */}
      <div className="flex items-center gap-3 flex-wrap">
        <DossiersOpcoSearchInput />
        <GroupModeToggle />
        <a
          href={exportUrl}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors"
          title="Télécharger la vue filtrée en CSV (Excel)"
        >
          <Download className="h-4 w-4" /> Exporter CSV
        </a>
      </div>

      {/* Filtres */}
      <div className="space-y-2.5">
        <FilterChips chips={yearChips} />
        <FilterChips chips={opcoChips} />
        <FilterChips chips={statusChips} />
        {typeChips && <FilterChips chips={typeChips} />}
      </div>

      {/* Tableau */}
      <section className="rounded-2xl border border-border bg-white overflow-hidden -mx-4 sm:mx-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2"><DossierSelectAllCheckbox allIds={allRowIds} /></th>
                <SortableTh sortKey="date">Date</SortableTh>
                <SortableTh sortKey="apprenant">Apprenant</SortableTh>
                <Th>Groupe / Sponsor</Th>
                <Th>Formation</Th>
                <SortableTh sortKey="montant" className="text-right">Montant HT</SortableTh>
                <SortableTh sortKey="opco">OPCO</SortableTh>
                <Th className="text-center">
                  <span className="inline-flex items-center gap-1">
                    Pipeline
                    <span className="text-[9px] font-normal normal-case text-muted-foreground">
                      facture · valid. · remb. · paie.
                    </span>
                  </span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Aucun dossier ne correspond aux filtres.
                  </td>
                </tr>
              ) : groupedView ? (
                <>
                  {groupsArr.map((g) => (
                    <GroupRowExpander key={`${g.agg.sessionId}-${g.agg.sponsorOrgId}`} group={g.agg} colSpan={8}>
                      {g.rows.map((r, idx) => renderRow(r, idx))}
                    </GroupRowExpander>
                  ))}
                  {ungrouped.length > 0 && (
                    <>
                      <tr className="bg-muted/20 border-t-2 border-border">
                        <td colSpan={8} className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Dossiers sans sponsor (non groupés)
                        </td>
                      </tr>
                      {ungrouped.map((r, idx) => renderRow(r, idx))}
                    </>
                  )}
                </>
              ) : (
                rows.map((r, idx) => renderRow(r, idx))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-medium">
                  <td colSpan={5} className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Total filtré ({totalShown})
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEUR.format(sumHT)}</td>
                  <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                    Encaissé&nbsp;: {fmtEUR.format(sumCollected)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {totalShown >= 500 && (
        <p className="text-xs text-muted-foreground italic">
          Affichage limité à 500 dossiers. Affine les filtres (année, OPCO, statut) pour voir les autres.
        </p>
      )}
      <DossierSelectionBar />
    </div>
    </DossierSelectionProvider>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: 'success' | 'warning' | 'info' | 'default';
  /** US-013 : si défini, rend la carte cliquable et applique le filtre */
  href?: string;
  active?: boolean;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/50'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50/50'
          : 'border-border bg-white';
  const iconClass =
    tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : tone === 'info' ? 'text-sky-700' : 'text-primary';
  const interactive = href ? 'cursor-pointer hover:shadow-sm hover:border-primary/40 transition-all' : '';
  const activeRing = active ? 'ring-2 ring-primary' : '';
  const inner = (
    <div className={`rounded-2xl border p-5 ${toneClass} ${interactive} ${activeRing}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
  return href ? <Link href={href as any}>{inner}</Link> : inner;
}

function hrefWith(current: SP, patch: Partial<SP> & { year?: string; opco?: string; status?: string; type?: string }): string {
  const merged: SP = { ...current, ...patch } as SP;
  const params = new URLSearchParams();
  if (merged.year && merged.year !== 'all') params.set('year', merged.year);
  if (merged.opco && merged.opco !== 'all') params.set('opco', merged.opco);
  if (merged.status && merged.status !== 'all') params.set('status', merged.status);
  if (merged.type && merged.type !== 'all') params.set('type', merged.type);
  // Préserve q + tri + mode groupé lors d'un changement de chip filtre
  if (merged.q) params.set('q', merged.q);
  if (merged.sort) params.set('sort', merged.sort);
  if (merged.dir) params.set('dir', merged.dir);
  if (merged.group) params.set('group', merged.group);
  const qs = params.toString();
  return `/app/dossiers-opco${qs ? `?${qs}` : ''}`;
}
