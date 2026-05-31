import Link from 'next/link';
import { Plus, AlertTriangle, Users, FileCheck, List, LayoutGrid } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { FilterChips } from '@/components/ui/filter-chips';
import { Pagination } from '@/components/ui/pagination';
import { DataTableFolk as DataTable, type Column } from '@/components/ui/data-table-folk';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { CreateOrganizationButton } from '@/components/forms/create-organization-button';

const PAGE_SIZE = 25;

interface OrgRow {
  id: string;
  legalName: string;
  legalForm: string;
  siret: string | null;
  opcoCode: string | null;
  requiresCleanup: boolean;
  cleanupNotes: string | null;
  network: string | null;
  representative: string | null;
  ageficeProfile: { id: string } | null;
  _count: { legalLinks: number };
}

interface SP {
  q?: string;
  filter?: 'cleanup' | 'agefice' | 'ei';
  page?: string;
  all?: string;
}

// Auto-entrepreneur et EI sont juridiquement la même chose (un AE = une EI
// au régime micro depuis 2016). On les fusionne en un seul libellé pour
// éviter la confusion dans l'UI. La distinction reste en base si besoin.
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

export default async function OrganisationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { q, filter, page: pageStr, all: allParam } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const showAll = allParam === '1';

  // Les financeurs (PA AGEFICE, OPCO_EP, ATLAS, etc.) ne sont PAS des
  // organisations clientes/employeurs. Ils vivent dans AgeficePointAccueil
  // ou OpcoCatalog et apparaissent dans /app/financeurs. On les exclut
  // d'ici pour que la liste reste celle des entreprises clientes (EI,
  // SARL, agences, enseignes).
  // Note Prisma : `mode: 'insensitive'` n'est pas autorisé dans un `not`,
  // on s'appuie donc sur les variantes courantes en MAJUSCULES (cohérent
  // avec les imports SmartOF / Airtable / référentiels OPCO).
  const FINANCER_NAME_PREFIXES = [
    'AGEFICE',
    'Agefice',
    'agefice',
    'OPCO_EP',
    'OPCO EP',
    'Opco_EP',
    'ATLAS',
    'Atlas',
    'CPF',
    'FI-FPL',
    'FIF-PL',
    'OPCOMMERCE',
    'Opcommerce',
  ];

  const where: Prisma.OrganizationWhereInput = {
    tenantId: user.tenantId,
    archived: false,
    AND: FINANCER_NAME_PREFIXES.map((p) => ({
      legalName: { not: { startsWith: p } },
    })),
  };
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { legalName: { contains: term, mode: 'insensitive' } },
      { siret: { contains: term } },
      { naf: { contains: term } },
      { network: { contains: term, mode: 'insensitive' } },
    ];
  }
  if (filter === 'cleanup') where.requiresCleanup = true;
  if (filter === 'agefice') where.opcoCode = 'AGEFICE';
  if (filter === 'ei') where.legalForm = { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] };

  const [total, rows, allCount, cleanupCount, ageficeCount, eiCount] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { legalName: 'asc' },
      ...(showAll ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      select: {
        id: true,
        legalName: true,
        legalForm: true,
        siret: true,
        opcoCode: true,
        requiresCleanup: true,
        cleanupNotes: true,
        network: true,
        representative: true,
        ageficeProfile: { select: { id: true } },
        _count: { select: { legalLinks: true } },
      },
    }),
    prisma.organization.count({ where: { tenantId: user.tenantId, archived: false } }),
    prisma.organization.count({ where: { tenantId: user.tenantId, archived: false, requiresCleanup: true } }),
    prisma.organization.count({ where: { tenantId: user.tenantId, archived: false, opcoCode: 'AGEFICE' } }),
    prisma.organization.count({
      where: { tenantId: user.tenantId, archived: false, legalForm: { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] } },
    }),
  ]);

  const filterChips = [
    { label: 'Toutes', href: hrefWith({ q, filter: undefined }), active: !filter, count: allCount },
    { label: 'EI / auto-entr.', href: hrefWith({ q, filter: 'ei' }), active: filter === 'ei', count: eiCount },
    { label: 'AGEFICE', href: hrefWith({ q, filter: 'agefice' }), active: filter === 'agefice', count: ageficeCount },
    { label: 'À corriger', href: hrefWith({ q, filter: 'cleanup' }), active: filter === 'cleanup', count: cleanupCount },
  ];

  const columns: Column<OrgRow>[] = [
    {
      key: 'name',
      header: 'Raison sociale',
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.legalName}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            <Badge variant="muted" className="text-[10px]">{FORM_LABEL[row.legalForm] ?? row.legalForm}</Badge>
            {row.network && <span>{row.network}</span>}
            {row.representative && !row.network && <span>{row.representative}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'siret',
      header: 'SIRET',
      cell: (row) =>
        row.siret ? (
          <code className="font-mono text-xs">{row.siret}</code>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        ),
    },
    {
      key: 'opco',
      header: 'OPCO',
      cell: (row) =>
        row.opcoCode ? <Badge variant="default">{row.opcoCode}</Badge> : <span className="text-xs text-muted-foreground italic">—</span>,
    },
    {
      key: 'links',
      header: 'Apprenants liés',
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" /> {row._count.legalLinks}
        </span>
      ),
    },
    {
      key: 'flags',
      header: '',
      width: '260px',
      className: 'text-right',
      cell: (row) => (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {row.ageficeProfile && (
              <Badge variant="info">
                <FileCheck className="h-3 w-3" /> AGEFICE
              </Badge>
            )}
            {row.requiresCleanup && (
              <Badge variant="warning" title={row.cleanupNotes ?? undefined}>
                <AlertTriangle className="h-3 w-3" /> à corriger
              </Badge>
            )}
          </div>
          {row.requiresCleanup && row.cleanupNotes && (
            <span className="text-[11px] text-amber-700 italic max-w-[240px] truncate" title={row.cleanupNotes}>
              {row.cleanupNotes}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        subtitle={`${allCount} structures importées (${ageficeCount} éligibles AGEFICE, ${eiCount} en EI)`}
        actions={<CreateOrganizationButton />}
      />

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <SearchInput placeholder="Raison sociale, SIRET, NAF…" />
        <div className="flex items-center gap-2">
          <Link
            href={hrefWith({ q, filter, all: showAll ? undefined : '1' }) as any}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-300 ease-out active:scale-[0.97]"
          >
            {showAll ? (
              <>
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} /> Paginer
              </>
            ) : (
              <>
                <List className="h-3.5 w-3.5" strokeWidth={1.75} /> Voir tout
                <span className="tabular-nums text-[10px] text-slate-400">{total}</span>
              </>
            )}
          </Link>
          <FilterChips chips={filterChips} />
        </div>
      </div>

      <DataTable<OrgRow>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/app/organisations/${r.id}`}
        empty={q ? `Aucune organisation ne correspond à « ${q} ».` : 'Aucune organisation.'}
      />

      {!showAll && (
        <Pagination
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          basePath="/app/organisations"
          searchParams={{ q, filter }}
        />
      )}
    </div>
  );
}

function hrefWith(opts: { q?: string; filter?: string; all?: string }): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.filter) params.set('filter', opts.filter);
  if (opts.all) params.set('all', opts.all);
  const qs = params.toString();
  return `/app/organisations${qs ? `?${qs}` : ''}`;
}
