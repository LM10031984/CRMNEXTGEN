import Link from 'next/link';
import { ClipboardCheck, FileCheck, Wallet, AlertCircle, TrendingUp } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { FilterChips } from '@/components/ui/filter-chips';
import { ToggleCell } from '@/components/dossiers-opco/toggle-cell';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtNb = new Intl.NumberFormat('fr-FR');
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

type FilterStatus = 'all' | 'a-facturer' | 'attente-opco' | 'attente-client' | 'complet';

interface SP {
  year?: string;
  opco?: string;
  status?: FilterStatus;
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

  // Fetch
  const [rows, totalAll, kpiToInvoice, kpiToReimburse, kpiToCollect, kpiComplete] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where,
      orderBy: { session: { startDate: 'desc' } },
      take: 500,
      select: {
        id: true,
        priceHT: true,
        amountCollected: true,
        invoiceSent: true,
        opcoApproved: true,
        opcoReimbursed: true,
        paymentReceived: true,
        financingMode: true,
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

  // Aggrégations sur le résultat filtré pour la barre de stats
  const totalShown = rows.length;
  const sumHT = rows.reduce((s, r) => s + Number(r.priceHT), 0);
  const sumCollected = rows.reduce((s, r) => s + Number(r.amountCollected), 0);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dossiers OPCO"
        subtitle={`Suivi facturation & encaissement par inscription · ${fmtNb.format(totalShown)} dossier${totalShown > 1 ? 's' : ''} affiché${totalShown > 1 ? 's' : ''} sur ${fmtNb.format(totalAll)} au total`}
      />

      {/* KPI globaux */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Wallet}
          label="À facturer"
          value={fmtEUR.format(Number(kpiToInvoice._sum.priceHT ?? 0))}
          hint={`${fmtNb.format(kpiToInvoice._count.id)} dossier${kpiToInvoice._count.id > 1 ? 's' : ''}`}
          tone="warning"
        />
        <KpiCard
          icon={AlertCircle}
          label="Attente remboursement OPCO"
          value={fmtEUR.format(Number(kpiToReimburse._sum.priceHT ?? 0))}
          hint={`${fmtNb.format(kpiToReimburse._count.id)} dossier${kpiToReimburse._count.id > 1 ? 's' : ''}`}
          tone="info"
        />
        <KpiCard
          icon={TrendingUp}
          label="Attente paiement client"
          value={fmtEUR.format(Number(kpiToCollect._sum.priceHT ?? 0))}
          hint={`${fmtNb.format(kpiToCollect._count.id)} dossier${kpiToCollect._count.id > 1 ? 's' : ''}`}
          tone="info"
        />
        <KpiCard
          icon={FileCheck}
          label="Dossiers complets"
          value={fmtNb.format(kpiComplete)}
          hint="facturé + remboursé + payé"
          tone="success"
        />
      </section>

      {/* Filtres */}
      <div className="space-y-2.5">
        <FilterChips chips={yearChips} />
        <FilterChips chips={opcoChips} />
        <FilterChips chips={statusChips} />
      </div>

      {/* Tableau */}
      <section className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <Th>Date</Th>
                <Th>Apprenant</Th>
                <Th>Groupe / Sponsor</Th>
                <Th>Formation</Th>
                <Th className="text-right">Montant HT</Th>
                <Th>OPCO</Th>
                <Th className="text-center">Facture</Th>
                <Th className="text-center">Validation</Th>
                <Th className="text-center">Remb. OPCO</Th>
                <Th className="text-center">Paiement</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Aucun dossier ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      <Link href={`/app/sessions/${r.session.id}`} className="text-foreground hover:text-primary">
                        {fmtDate.format(r.session.startDate)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.person.firstName} {r.person.lastName}</div>
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
                        <Badge variant="muted" className="text-[10px]">
                          {r.sponsorOrg.opcoCode}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ToggleCell participantId={r.id} field="invoiceSent" initial={r.invoiceSent} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ToggleCell participantId={r.id} field="opcoApproved" initial={r.opcoApproved} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ToggleCell participantId={r.id} field="opcoReimbursed" initial={r.opcoReimbursed} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ToggleCell participantId={r.id} field="paymentReceived" initial={r.paymentReceived} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-medium">
                  <td colSpan={4} className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Total filtré ({totalShown})
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEUR.format(sumHT)}</td>
                  <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground">
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
    </div>
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: 'success' | 'warning' | 'info' | 'default';
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
  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}

function hrefWith(current: SP, patch: Partial<SP> & { year?: string; opco?: string; status?: string }): string {
  const merged: SP = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.year && merged.year !== 'all') params.set('year', merged.year);
  if (merged.opco && merged.opco !== 'all') params.set('opco', merged.opco);
  if (merged.status && merged.status !== 'all') params.set('status', merged.status);
  const qs = params.toString();
  return `/app/dossiers-opco${qs ? `?${qs}` : ''}`;
}
