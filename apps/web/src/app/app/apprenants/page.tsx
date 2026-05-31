import Link from 'next/link';
import { AlertTriangle, Briefcase, List, LayoutGrid, Search } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { LearnerQuickViewButton } from '@/components/apprenants/learner-quick-view-button';
import { CreatePersonButton } from '@/components/forms/create-person-button';

/**
 * POC Folk-style — refonte UI uniquement, logique métier identique.
 *
 * Tout est inliné (pas de `<DataTable>` / `<Badge>` / `<PageHeader>` /
 * `<FilterChips>` / `<PageHeader>`) pour que les changements visuels
 * ne contaminent PAS les autres pages tant que la direction n'est pas
 * validée. Si OK, on extraira ces motifs en composants partagés.
 */

const PAGE_SIZE = 25;

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

  return (
    <div className="space-y-5">
      {/* ── Header sobre Folk-style : titre h1 modéré + meta inline + CTA discret ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Apprenants</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            <span className="tabular-nums font-medium text-slate-700">{allCount}</span> fiches
            <span className="text-slate-300 mx-1.5">·</span>
            importées depuis SmartOF
          </p>
        </div>
        <CreatePersonButton />
      </div>

      {/* ── Toolbar : search + filter pills + toggle pagination ── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <SearchInput placeholder="Nom, prénom, email…" />
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterChips.map((chip) => (
            <Link
              key={chip.href}
              href={chip.href as never}
              className={
                chip.active
                  ? 'inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium bg-slate-900 text-white transition-all duration-300 ease-out active:scale-[0.97]'
                  : 'inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-300 ease-out active:scale-[0.97]'
              }
            >
              {chip.label}
              {chip.count !== undefined && (
                <span
                  className={
                    chip.active
                      ? 'tabular-nums text-[10px] text-white/70'
                      : 'tabular-nums text-[10px] text-slate-400'
                  }
                >
                  {chip.count}
                </span>
              )}
            </Link>
          ))}
          {/* Séparateur visuel discret */}
          <span className="w-px h-5 bg-slate-200 mx-1" aria-hidden />
          <Link
            href={hrefWith({ q, filter, all: showAll ? undefined : '1' }) as any}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-300 ease-out active:scale-[0.97]"
            title={showAll ? `Paginer ${PAGE_SIZE} par page` : `Voir les ${total} résultats`}
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
        </div>
      </div>

      {/* ── Tableau Folk-style : blanc pur, border slate-200, shadow-sm, hover slate-50 ── */}
      {rows.length === 0 ? (
        <EmptyState query={q} />
      ) : (
        <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <Th>Nom</Th>
                  <Th>Contact</Th>
                  <Th>Organisation(s)</Th>
                  <Th className="text-right">Statut</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {/* Nom + statut pro */}
                    <td className="py-3 px-4 align-top">
                      <Link href={`/app/apprenants/${row.id}`} className="block">
                        <div className="text-sm font-medium text-slate-900 truncate max-w-[240px]">
                          {row.lastName.toUpperCase()} {row.firstName}
                        </div>
                        {row.professionalStatus && (
                          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">
                            {row.professionalStatus}
                          </div>
                        )}
                      </Link>
                    </td>

                    {/* Contact */}
                    <td className="py-3 px-4 align-top">
                      <Link href={`/app/apprenants/${row.id}`} className="block">
                        <div className={row.email ? 'text-sm text-slate-700 truncate max-w-[260px]' : 'text-sm text-slate-400 italic'}>
                          {row.email ?? 'email manquant'}
                        </div>
                        {row.phone && (
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">{row.phone}</div>
                        )}
                      </Link>
                    </td>

                    {/* Organisations */}
                    <td className="py-3 px-4 align-top">
                      <Link href={`/app/apprenants/${row.id}`} className="block">
                        {row.legalLinks.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">aucune</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {row.legalLinks.slice(0, 2).map((link) => (
                              <div key={link.organization.id} className="flex items-center gap-1.5 min-w-0">
                                <Briefcase className="h-3 w-3 text-slate-400 shrink-0" strokeWidth={1.75} />
                                <span className="text-xs text-slate-700 truncate max-w-[200px]">
                                  {link.organization.legalName}
                                </span>
                                {link.role === 'EI_SELF' && (
                                  <span className="shrink-0 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                    EI
                                  </span>
                                )}
                              </div>
                            ))}
                            {row.legalLinks.length > 2 && (
                              <span className="text-[11px] text-slate-400">
                                +{row.legalLinks.length - 2} autre{row.legalLinks.length - 2 > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </Link>
                    </td>

                    {/* Statut + actions — `align-top` pour s'aligner avec la 1ère ligne */}
                    <td className="py-3 px-4 align-top text-right">
                      <div className="inline-flex items-center gap-2">
                        {row.requiresCleanup && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                            title={row.cleanupNotes ?? undefined}
                          >
                            <AlertTriangle className="h-3 w-3" strokeWidth={2} /> À corriger
                          </span>
                        )}
                        <LearnerQuickViewButton personId={row.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

// ───────────────────────── helpers locaux ─────────────────────────

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={
        'py-2.5 px-4 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 ' +
        (className ?? '')
      }
    >
      {children}
    </th>
  );
}

function EmptyState({ query }: { query?: string }) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card py-16 text-center">
      <div className="inline-flex h-10 w-10 mb-3 rounded-lg bg-slate-100 text-slate-400 items-center justify-center">
        <Search className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-medium text-slate-900">
        {query ? 'Aucun résultat' : 'Aucun apprenant'}
      </h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
        {query ? (
          <>
            Aucun apprenant ne correspond à <span className="font-medium text-slate-700">« {query} »</span>.
          </>
        ) : (
          'Les fiches apparaîtront ici dès qu\'un apprenant sera créé ou importé.'
        )}
      </p>
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
