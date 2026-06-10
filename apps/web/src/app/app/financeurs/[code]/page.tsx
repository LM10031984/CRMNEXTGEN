import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Landmark,
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  Clock,
  Wallet,
  FileCheck,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { DataTableFolk as DataTable, type Column } from '@/components/ui/data-table-folk';
import { formatFunderCode } from '@/lib/funder-codes';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fmtNb = new Intl.NumberFormat('fr-FR');
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

interface OrgRow {
  id: string;
  legalName: string;
  legalForm: string;
  siret: string | null;
  hasAgeficeProfile: boolean;
  participantsCount: number;
  totalHT: number;
  collected: number;
}

interface ParticipantRow {
  id: string;
  sessionId: string;
  sessionName: string;
  sessionStartDate: Date;
  personName: string;
  sponsorOrgName: string;
  priceHT: number;
  financingStatus: string;
  paymentStatus: string;
  opcoApproved: boolean;
  opcoReimbursed: boolean;
}

// Auto-entrepreneur = EI au régime micro depuis 2016, fusionnés dans l'UI
const FORM_LABEL: Record<string, string> = {
  EI: 'Auto-entr.',
  AUTO_ENTREPRENEUR: 'Auto-entr.',
  EIRL: 'EIRL',
  SAS: 'SAS',
  SARL: 'SARL',
  SASU: 'SASU',
  EURL: 'EURL',
  SA: 'SA',
  ASSOCIATION: 'Asso',
  PARTICULIER: 'Particulier',
  AUTRE: 'Autre',
};

const STATUS_VARIANT: Record<string, 'default' | 'muted' | 'info' | 'warning' | 'success'> = {
  NOT_STARTED: 'muted',
  REQUESTED: 'info',
  PRE_APPROVED: 'info',
  APPROVED: 'success',
  REJECTED: 'warning',
  REIMBURSED: 'success',
};
const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Non démarré',
  REQUESTED: 'Déposé',
  PRE_APPROVED: 'Pré-accord',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
  REIMBURSED: 'Remboursé',
};

export default async function FinanceurDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();

  const opco = await prisma.opcoCatalog.findUnique({ where: { code } });
  if (!opco) notFound();

  const orgs = await prisma.organization.findMany({
    where: { tenantId: user.tenantId, archived: false, opcoCode: code },
    orderBy: { legalName: 'asc' },
    select: {
      id: true,
      legalName: true,
      legalForm: true,
      siret: true,
      ageficeProfile: { select: { id: true } },
      sponsoredParticipations: {
        where: { session: { tenantId: user.tenantId } },
        select: {
          priceHT: true,
          amountCollected: true,
        },
      },
    },
  });

  const orgRows: OrgRow[] = orgs.map((o) => {
    const totalHT = o.sponsoredParticipations.reduce((s, p) => s + Number(p.priceHT), 0);
    const collected = o.sponsoredParticipations.reduce((s, p) => s + Number(p.amountCollected), 0);
    return {
      id: o.id,
      legalName: o.legalName,
      legalForm: o.legalForm,
      siret: o.siret,
      hasAgeficeProfile: !!o.ageficeProfile,
      participantsCount: o.sponsoredParticipations.length,
      totalHT,
      collected,
    };
  });

  const participants = await prisma.sessionParticipant.findMany({
    where: {
      session: { tenantId: user.tenantId },
      sponsorOrg: { opcoCode: code },
    },
    orderBy: { session: { startDate: 'desc' } },
    take: 30,
    select: {
      id: true,
      priceHT: true,
      financingStatus: true,
      paymentStatus: true,
      opcoApproved: true,
      opcoReimbursed: true,
      session: { select: { id: true, name: true, startDate: true, code: true } },
      person: { select: { firstName: true, lastName: true } },
      sponsorOrg: { select: { legalName: true } },
    },
  });

  const participantRows: ParticipantRow[] = participants.map((p) => ({
    id: p.id,
    sessionId: p.session.id,
    sessionName: p.session.name ?? p.session.code ?? '(sans nom)',
    sessionStartDate: p.session.startDate,
    personName: `${p.person.firstName} ${p.person.lastName}`.trim(),
    sponsorOrgName: p.sponsorOrg.legalName,
    priceHT: Number(p.priceHT),
    financingStatus: p.financingStatus,
    paymentStatus: p.paymentStatus,
    opcoApproved: p.opcoApproved,
    opcoReimbursed: p.opcoReimbursed,
  }));

  const totals = orgRows.reduce(
    (acc, r) => ({
      orgs: acc.orgs + 1,
      orgsAgefice: acc.orgsAgefice + (r.hasAgeficeProfile ? 1 : 0),
      participants: acc.participants + r.participantsCount,
      totalHT: acc.totalHT + r.totalHT,
      collected: acc.collected + r.collected,
    }),
    { orgs: 0, orgsAgefice: 0, participants: 0, totalHT: 0, collected: 0 },
  );

  const requiredDocs = Array.isArray(opco.requiredDocs) ? (opco.requiredDocs as string[]) : [];

  const orgColumns: Column<OrgRow>[] = [
    {
      key: 'name',
      header: 'Organisation',
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.legalName}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            <Badge variant="muted" className="text-[10px]">{FORM_LABEL[row.legalForm] ?? row.legalForm}</Badge>
            {row.siret && <code className="font-mono">{row.siret}</code>}
          </div>
        </div>
      ),
    },
    {
      key: 'flags',
      header: '',
      width: '140px',
      cell: (row) =>
        row.hasAgeficeProfile ? (
          <Badge variant="info">
            <FileCheck className="h-3 w-3" /> Profil prêt
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground italic">profil à compléter</span>
        ),
    },
    {
      key: 'participants',
      header: 'Inscriptions',
      width: '110px',
      className: 'tabular-nums text-right',
      cell: (row) => fmtNb.format(row.participantsCount),
    },
    {
      key: 'totalHT',
      header: 'CA prév. HT',
      width: '130px',
      className: 'tabular-nums text-right',
      cell: (row) => fmtEUR.format(row.totalHT),
    },
    {
      key: 'collected',
      header: 'Encaissé',
      width: '130px',
      className: 'tabular-nums text-right',
      cell: (row) => (
        <span className={row.collected > 0 ? '' : 'text-muted-foreground'}>{fmtEUR.format(row.collected)}</span>
      ),
    },
  ];

  const partColumns: Column<ParticipantRow>[] = [
    {
      key: 'session',
      header: 'Session',
      cell: (row) => (
        <div>
          <div className="font-medium truncate">{row.sessionName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{fmtDate.format(row.sessionStartDate)}</div>
        </div>
      ),
    },
    {
      key: 'person',
      header: 'Apprenant',
      cell: (row) => (
        <div>
          <div className="font-medium">{row.personName}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">via {row.sponsorOrgName}</div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Montant HT',
      width: '110px',
      className: 'tabular-nums text-right',
      cell: (row) => fmtEUR.format(row.priceHT),
    },
    {
      key: 'workflow',
      header: 'Workflow OPCO',
      width: '180px',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={STATUS_VARIANT[row.financingStatus] ?? 'muted'}>
            {STATUS_LABEL[row.financingStatus] ?? row.financingStatus}
          </Badge>
          {row.opcoReimbursed && <Badge variant="success">remboursé</Badge>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/financeurs"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Tous les financeurs
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary-50 text-primary-700 inline-flex items-center justify-center shrink-0">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{formatFunderCode(opco.code)}</h1>
                <Badge variant="muted">{opco.type}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{opco.name}</p>
            </div>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Building2} label="Organisations affiliées" value={fmtNb.format(totals.orgs)} hint={opco.code === 'AGEFICE' ? `${totals.orgsAgefice} profils prêts` : undefined} />
        <KpiCard icon={Building2} label="Inscriptions cumulées" value={fmtNb.format(totals.participants)} />
        <KpiCard icon={Wallet} label="CA prévisionnel HT" value={fmtEUR.format(totals.totalHT)} />
        <KpiCard icon={FileCheck} label="Encaissé" value={fmtEUR.format(totals.collected)} hint="suivi par inscription" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5">
          <h2 className="font-semibold text-sm mb-3">Conditions de prise en charge</h2>
          <dl className="space-y-2.5 text-sm">
            <Row icon={Clock} label="Délai moyen" value={opco.averageDelayDays != null ? `${opco.averageDelayDays} jours` : null} />
            <Row icon={Wallet} label="Plafond par formation" value={opco.maxAmountPerTraining != null ? fmtEUR.format(Number(opco.maxAmountPerTraining)) : null} />
            <Row icon={Wallet} label="Plafond annuel par personne" value={opco.yearlyCapPerPerson != null ? fmtEUR.format(Number(opco.yearlyCapPerPerson)) : null} />
            {opco.conditions && (
              <div className="pt-2 border-t border-border">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Conditions</div>
                <p className="text-sm leading-relaxed whitespace-pre-line">{opco.conditions}</p>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5">
          <h2 className="font-semibold text-sm mb-3">Documents requis</h2>
          {requiredDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun document spécifique référencé.</p>
          ) : (
            <ul className="space-y-1.5">
              {requiredDocs.map((doc, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <FileCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
          )}

          {(opco.contactEmail || opco.contactPhone || opco.website) && (
            <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Contact</div>
              {opco.contactEmail && (
                <a href={`mailto:${opco.contactEmail}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {opco.contactEmail}
                </a>
              )}
              {opco.contactPhone && (
                <div className="flex items-center gap-2 text-foreground">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {opco.contactPhone}
                </div>
              )}
              {opco.website && (
                <a href={opco.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" /> {opco.website}
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Organisations affiliées ({orgRows.length})
        </h2>
        <DataTable<OrgRow>
          rows={orgRows}
          columns={orgColumns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/app/organisations/${r.id}`}
          empty={
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" /> Aucune organisation rattachée à ce financeur pour l'instant.
            </span>
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Dernières inscriptions financées ({participantRows.length})
        </h2>
        <DataTable<ParticipantRow>
          rows={participantRows}
          columns={partColumns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/app/sessions/${r.sessionId}`}
          empty="Aucune inscription liée à ce financeur."
        />
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">{value ?? <span className="text-muted-foreground italic">—</span>}</dd>
    </div>
  );
}
