import Link from 'next/link';
import { Plus, Calendar, Users, Euro, AlertTriangle, Sparkles } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { FilterChips } from '@/components/ui/filter-chips';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { SessionStatusBadgeMenu } from '@/components/sessions/session-status-badge-menu';
import type { SessionStatus } from '@/server/actions/sessions-create';

const PAGE_SIZE = 25;

type SessionFilter = 'completed' | 'upcoming' | 'cancelled' | 'ei' | 'this_week' | 'no_attendees' | 'to_invoice' | 'signed';

interface SP {
  q?: string;
  filter?: SessionFilter;
  page?: string;
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { q, filter, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const where: Prisma.TrainingSessionWhereInput = { tenantId: user.tenantId };
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (filter === 'completed') where.status = 'COMPLETED';
  if (filter === 'upcoming') {
    // Sessions futures, on exclut brouillons et annulees pour rester coherent
    // avec le KPI "CA a venir" du dashboard.
    where.startDate = { gt: now };
    where.status = { notIn: ['DRAFT', 'CANCELLED'] };
  }
  if (filter === 'cancelled') where.status = 'CANCELLED';
  if (filter === 'signed') {
    where.status = { in: ['VALIDATED', 'IN_PROGRESS', 'COMPLETED'] };
  }
  if (filter === 'ei') {
    where.participants = { some: { sponsorOrg: { legalForm: { in: ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] } } } };
  }
  if (filter === 'this_week') {
    where.startDate = { gte: now, lte: weekFromNow };
  }
  if (filter === 'no_attendees') {
    where.participants = { none: {} };
  }
  if (filter === 'to_invoice') {
    // Sessions terminées dont au moins 1 inscrit n'a pas encore été facturé
    where.endDate = { lt: now };
    where.participants = { some: { invoices: { none: {} } } };
  }

  const [
    total,
    rows,
    allCount,
    completedCount,
    upcomingCount,
    eiCount,
    thisWeekCount,
    noAttendeesCount,
    toInvoiceCount,
    totalParticipations,
  ] = await Promise.all([
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
        product: { select: { code: true, durationHours: true, title: true } },
        _count: { select: { participants: true } },
        participants: {
          take: 1,
          select: { sponsorOrg: { select: { legalForm: true } } },
        },
        trainers: {
          where: { isPrimary: true },
          take: 1,
          include: { person: { select: { firstName: true, lastName: true } } },
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
    prisma.trainingSession.count({
      where: { tenantId: user.tenantId, startDate: { gte: now, lte: weekFromNow } },
    }),
    prisma.trainingSession.count({
      where: { tenantId: user.tenantId, participants: { none: {} } },
    }),
    prisma.trainingSession.count({
      where: {
        tenantId: user.tenantId,
        endDate: { lt: now },
        participants: { some: { invoices: { none: {} } } },
      },
    }),
    prisma.sessionParticipant.count({ where: { session: { tenantId: user.tenantId } } }),
  ]);

  const subtitleParts = [
    `${allCount} session${allCount > 1 ? 's' : ''}`,
    `${totalParticipations} inscrit${totalParticipations > 1 ? 's' : ''} cumulé${totalParticipations > 1 ? 's' : ''}`,
  ];
  if (eiCount > 0) subtitleParts.push(`${eiCount} avec EI`);

  const filterChips = [
    { label: 'Toutes', href: hrefWith({ q, filter: undefined }), active: !filter, count: allCount },
    { label: 'Cette semaine', href: hrefWith({ q, filter: 'this_week' }), active: filter === 'this_week', count: thisWeekCount },
    { label: 'À venir', href: hrefWith({ q, filter: 'upcoming' }), active: filter === 'upcoming', count: upcomingCount },
    { label: 'Sans inscrit', href: hrefWith({ q, filter: 'no_attendees' }), active: filter === 'no_attendees', count: noAttendeesCount },
    { label: 'À facturer', href: hrefWith({ q, filter: 'to_invoice' }), active: filter === 'to_invoice', count: toInvoiceCount },
    { label: 'Terminées', href: hrefWith({ q, filter: 'completed' }), active: filter === 'completed', count: completedCount },
    { label: 'Avec EI', href: hrefWith({ q, filter: 'ei' }), active: filter === 'ei', count: eiCount },
    { label: 'Annulées', href: hrefWith({ q, filter: 'cancelled' }), active: filter === 'cancelled' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions de formation"
        subtitle={subtitleParts.join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/app/sessions/rattrapage"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Rattraper les inscriptions
            </Link>
            <Link
              href="/app/sessions/nouvelle"
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
            >
              <Plus className="h-4 w-4" /> Nouvelle session
            </Link>
          </div>
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
        <div className="space-y-5">
          {(() => {
            // Groupage par mois pour visibilité (les sessions sont triées startDate DESC)
            const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
            const grouped = new Map<string, typeof rows>();
            for (const s of rows) {
              const key = monthFormatter.format(new Date(s.startDate));
              const list = grouped.get(key) ?? [];
              list.push(s);
              grouped.set(key, list);
            }
            return Array.from(grouped.entries()).map(([month, items]) => (
              <div key={month}>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-2">
                  {month} <span className="text-foreground/40">— {items.length} session{items.length > 1 ? 's' : ''}</span>
                </h2>
                <div className="rounded-2xl border border-border bg-white divide-y divide-border overflow-hidden">
                  {items.map((s) => {
                    const start = new Date(s.startDate);
                    const end = new Date(s.endDate);
                    const sameDay = start.toDateString() === end.toDateString();
                    const isPast = end < now;
                    const noLearners = s._count.participants === 0;
                    const primaryTrainer = s.trainers[0]?.person;
                    const rowBg = noLearners ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-muted/30';
                    return (
                      <Link
                        key={s.id}
                        href={`/app/sessions/${s.id}`}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors ${rowBg}`}
                      >
                        <div className="shrink-0">
                          <Badge variant="muted" className="font-mono">{s.code}</Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.name ?? s.product?.title ?? '(sans nom)'}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {sameDay
                                ? start.toLocaleDateString('fr-FR')
                                : `${start.toLocaleDateString('fr-FR')} → ${end.toLocaleDateString('fr-FR')}`}
                            </span>
                            {s.product?.durationHours ? <span>· {s.product.durationHours}h</span> : null}
                            <span className={`inline-flex items-center gap-1 ${noLearners ? 'text-amber-700 font-semibold' : ''}`}>
                              <Users className="h-3 w-3" /> {s._count.participants} inscrit{s._count.participants > 1 ? 's' : ''}
                            </span>
                            {primaryTrainer && (
                              <span className="inline-flex items-center gap-1">
                                · 🎓 {primaryTrainer.firstName} {primaryTrainer.lastName}
                              </span>
                            )}
                            {Number(s.pricePerLearner ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Euro className="h-3 w-3" /> {Number(s.pricePerLearner).toFixed(0)} €
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {noLearners && (
                            <Badge variant="warning" className="text-[10px]">
                              0 inscrit
                            </Badge>
                          )}
                          {isPast && s.status !== 'COMPLETED' && s.status !== 'CANCELLED' && (
                            <Badge variant="warning">
                              <AlertTriangle className="h-3 w-3" /> à clore
                            </Badge>
                          )}
                          <SessionStatusBadgeMenu
                            sessionId={s.id}
                            sessionCode={s.code}
                            status={s.status as SessionStatus}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
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
