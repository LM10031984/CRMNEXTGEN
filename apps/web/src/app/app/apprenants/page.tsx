import Link from 'next/link';
import { Plus, AlertTriangle, Briefcase, List, LayoutGrid } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { FilterChips } from '@/components/ui/filter-chips';
import { Pagination } from '@/components/ui/pagination';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { LearnerQuickViewButton } from '@/components/apprenants/learner-quick-view-button';
import { CreatePersonButton } from '@/components/forms/create-person-button';

const PAGE_SIZE = 25;

interface ApprenantRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  professionalStatus: string | null;
  requiresCleanup: boolean;
  cleanupNotes: string | null;
  legalLinks: { role: string; isPrimary: boolean; organization: { id: string; legalName: string } }[];
}

interface SearchParams {
  q?: string;
  filter?: 'cleanup' | 'ei' | 'all';
  page?: string;
  all?: string;
}

export default async function ApprenantsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { q, filter, page: pageStr, all: allParam } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const showAll = allParam === '1';

  const where: Prisma.PersonWhereInput = {
    tenantId: user.tenantId,
    archived: false,
  };

  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { professionalStatus: { contains: term, mode: 'insensitive' } },
    ];
  }
  if (filter === 'cleanup') where.requiresCleanup = true;
  if (filter === 'ei') where.legalLinks = { some: { role: 'EI_SELF' } };

  const [total, rows, allCount, eiCount, cleanupCount] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      ...(showAll ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        professionalStatus: true,
        requiresCleanup: true,
        cleanupNotes: true,
        legalLinks: {
          orderBy: { isPrimary: 'desc' },
          select: {
            role: true,
            isPrimary: true,
            organization: { select: { id: true, legalName: true } },
          },
        },
      },
    }),
    prisma.person.count({ where: { tenantId: user.tenantId, archived: false } }),
    prisma.person.count({ where: { tenantId: user.tenantId, archived: false, legalLinks: { some: { role: 'EI_SELF' } } } }),
    prisma.person.count({ where: { tenantId: user.tenantId, archived: false, requiresCleanup: true } }),
  ]);

  const filterChips = [
    { label: 'Tous', href: hrefWith({ q, filter: undefined }), active: !filter || filter === 'all', count: allCount },
    { label: 'EI / auto-entrepreneurs', href: hrefWith({ q, filter: 'ei' }), active: filter === 'ei', count: eiCount },
    { label: 'À corriger', href: hrefWith({ q, filter: 'cleanup' }), active: filter === 'cleanup', count: cleanupCount },
  ];

  const columns: Column<ApprenantRow>[] = [
    {
      key: 'name',
      header: 'Nom',
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">
            {row.lastName.toUpperCase()} {row.firstName}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{row.professionalStatus ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (row) => (
        <div>
          <div className={row.email ? 'text-foreground' : 'text-muted-foreground italic'}>
            {row.email ?? 'email manquant'}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{row.phone ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'orgs',
      header: 'Organisation(s)',
      cell: (row) => {
        if (row.legalLinks.length === 0) {
          return <span className="text-xs text-muted-foreground italic">aucune</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            {row.legalLinks.slice(0, 2).map((link) => (
              <div key={link.organization.id} className="flex items-center gap-1.5">
                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs truncate max-w-[220px]">{link.organization.legalName}</span>
                {link.role === 'EI_SELF' && (
                  <Badge variant="primary" className="text-[10px]">EI</Badge>
                )}
              </div>
            ))}
            {row.legalLinks.length > 2 && (
              <span className="text-xs text-muted-foreground">+{row.legalLinks.length - 2} autre(s)</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'flags',
      header: '',
      width: '260px',
      className: 'text-right',
      noLink: true,
      cell: (row) => (
        <div className="flex flex-col items-end gap-1">
          <div className="inline-flex items-center gap-1.5">
            {row.requiresCleanup && (
              <Badge variant="warning" title={row.cleanupNotes ?? undefined}>
                <AlertTriangle className="h-3 w-3" /> à corriger
              </Badge>
            )}
            <LearnerQuickViewButton personId={row.id} />
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
        title="Apprenants"
        subtitle={`${allCount} fiches importées depuis SmartOF`}
        actions={<CreatePersonButton />}
      />

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <SearchInput placeholder="Nom, prénom, email…" />
        <div className="flex items-center gap-2">
          <Link
            href={hrefWith({ q, filter, all: showAll ? undefined : '1' }) as any}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors"
          >
            {showAll ? (
              <>
                <LayoutGrid className="h-4 w-4" /> Paginer ({PAGE_SIZE}/page)
              </>
            ) : (
              <>
                <List className="h-4 w-4" /> Voir tout ({total})
              </>
            )}
          </Link>
          <FilterChips chips={filterChips} />
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <DataTable<ApprenantRow>
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/app/apprenants/${r.id}`}
          empty={q ? `Aucun apprenant ne correspond à « ${q} ».` : 'Aucun apprenant.'}
        />
      </div>

      {!showAll && (
        <Pagination
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          basePath="/app/apprenants"
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
  return `/app/apprenants${qs ? `?${qs}` : ''}`;
}
