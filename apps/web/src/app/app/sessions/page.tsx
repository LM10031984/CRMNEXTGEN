import Link from 'next/link';
import { Plus, Calendar, Users, Euro, AlertTriangle } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { FilterChips } from '@/components/ui/filter-chips';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'muted' | 'danger' | 'primary' }> = {
  DRAFT: { label: 'Brouillon', variant: 'muted' },
  PLANNED: { label: 'Planifiée', variant: 'info' },
  OPEN: { label: 'Ouverte', variant: 'info' },
  VALIDATED: { label: 'Validée', variant: 'success' },
  IN_PROGRESS: { label: 'En cours', variant: 'primary' },
  COMPLETED: { label: 'Terminée', variant: 'success' },
  CANCELLED: { label: 'Annulée', variant: 'danger' },
};

interface SP {
  q?: string;
  filter?: 'completed' | 'upcoming' | 'cancelled' | 'ei';
  page?: string;
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { q, filter, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const now = new Date();

  const where: Prisma.TrainingSessionWhereInput = { tenantId: user.tenantId };
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (filter === 'completed') where.status = 'COMPLETED';
  if (filter === 'upcoming') where.startDate = { gt: now };
  if (filter === 'cancelled') where.status = 'CANCELLED';
  if (filter === 'ei') {
    where.participants = { some: { sponsorOrg: { legalForm: { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] } } } };
  }

  const [total, rows, allCount, completedCount, upcomingCount, eiCount] = await Promise.all([
    prisma.trainingSession.count({ where }),
    prisma.trainingSession.findMany({
      where,
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        pricePerLearner: true,
        product: { select: { code: true, durationHours: true } },
        _count: { select: { participants: true } },
        participants: {
          take: 1,
          select: { sponsorOrg: { select: { legalForm: true } } },
        },
      },
    }),
    prisma.trainingSession.count({ where: { tenantId: user.tenantId } }),
    prisma.trainingSession.count({ where: { tenantId: user.tenantId, status: 'COMPLETED' } }),
    prisma.trainingSession.count({ where: { tenantId: user.tenantId, startDate: { gt: now } } }),
    prisma.trainingSession.count({
      where: {
        tenantId: user.tenantId,
        participants: { some: { sponsorOrg: { legalForm: { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] } } } },
      },
    }),
  ]);

  const filterChips = [
    { label: 'Toutes', href: hrefWith({ q, filter: undefined }), active: !filter, count: allCount },
    { label: 'À venir', href: hrefWith({ q, filter: 'upcoming' }), active: filter === 'upcoming', count: upcomingCount },
    { label: 'Terminées', href: hrefWith({ q, filter: 'completed' }), active: filter === 'completed', count: completedCount },
    { label: 'Avec EI', href: hrefWith({ q, filter: 'ei' }), active: filter === 'ei', count: eiCount },
    { label: 'Annulées', href: hrefWith({ q, filter: 'cancelled' }), active: filter === 'cancelled' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions de formation"
        subtitle={`${allCount} sessions importées depuis SmartOF (${eiCount} avec ≥1 inscription EI)`}
        actions={
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors opacity-60 cursor-not-allowed"
            title="Wizard création — disponible au palier 2.3"
          >
            <Plus className="h-4 w-4" /> Nouvelle session
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <SearchInput placeholder="Code, titre…" />
        <FilterChips chips={filterChips} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-sm text-muted-foreground">
          {q ? `Aucune session ne correspond à « ${q} ».` : 'Aucune session.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white divide-y divide-border overflow-hidden">
          {rows.map((s) => {
            const statusInfo = STATUS_LABELS[s.status] ?? { label: s.status, variant: 'muted' as const };
            const start = new Date(s.startDate);
            const end = new Date(s.endDate);
            const sameDay = start.toDateString() === end.toDateString();
            const isPast = end < now;
            return (
              <Link
                key={s.id}
                href={`/app/sessions/${s.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="shrink-0">
                  <Badge variant="muted" className="font-mono">{s.code}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name ?? '(sans nom)'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {sameDay
                        ? start.toLocaleDateString('fr-FR')
                        : `${start.toLocaleDateString('fr-FR')} → ${end.toLocaleDateString('fr-FR')}`}
                    </span>
                    {s.product?.durationHours ? <span>· {s.product.durationHours}h</span> : null}
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {s._count.participants} inscrit{s._count.participants > 1 ? 's' : ''}
                    </span>
                    {Number(s.pricePerLearner ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Euro className="h-3 w-3" /> {Number(s.pricePerLearner).toFixed(0)} €
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {isPast && s.status !== 'COMPLETED' && s.status !== 'CANCELLED' && (
                    <Badge variant="warning">
                      <AlertTriangle className="h-3 w-3" /> à clore
                    </Badge>
                  )}
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        basePath="/app/sessions"
        searchParams={{ q, filter }}
      />
    </div>
  );
}

function hrefWith(opts: { q?: string; filter?: string }): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.filter) params.set('filter', opts.filter);
  const qs = params.toString();
  return `/app/sessions${qs ? `?${qs}` : ''}`;
}
