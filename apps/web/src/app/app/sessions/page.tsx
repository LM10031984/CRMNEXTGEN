import Link from 'next/link';
import { Plus, Calendar, Users, Euro, AlertTriangle, Sparkles, ChevronRight, Clock } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { FilterChips } from '@/components/ui/filter-chips';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
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
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-amber-700 hover:bg-amber-50 transition-all duration-300 ease-out active:scale-[0.97]"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> Rattraper
            </Link>
            <Link
              href="/app/sessions/nouvelle"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.35),0_0_20px_rgba(15,23,42,0.18)] transition-all duration-300 ease-out active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouvelle session
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <SearchInput placeholder="Code, titre…" />
        <FilterChips chips={filterChips} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card py-16 text-center">
          <div className="inline-flex h-10 w-10 mb-3 rounded-lg bg-slate-100 text-slate-400 items-center justify-center">
            <Calendar className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h3 className="text-sm font-medium text-slate-900">
            {q ? 'Aucun résultat' : 'Aucune session pour le moment'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {q ? (
              <>Aucune session ne correspond à <span className="font-medium text-slate-700">« {q} »</span>.</>
            ) : (
              <>Crée ta première session de formation via le bouton <span className="font-medium text-slate-700">Nouvelle session</span>.</>
            )}
          </p>
        </div>
      ) : (
        <ul className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card divide-y divide-slate-100 overflow-hidden">
          {rows.map((s) => {
            const start = new Date(s.startDate);
            const end = new Date(s.endDate);
            const sameDay = start.toDateString() === end.toDateString();
            const isPast = end < now;
            const dateLabel = sameDay
              ? start.toLocaleDateString('fr-FR')
              : `${start.toLocaleDateString('fr-FR')} → ${end.toLocaleDateString('fr-FR')}`;
            const code = s.code ?? '';
            return (
              <li key={s.id}>
                <Link
                  href={`/app/sessions/${s.id}`}
                  className="group flex items-center gap-4 py-3 px-4 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {/* Code session — pill mono Folk discrète */}
                  <div className="shrink-0">
                    <span className="inline-flex items-center justify-center font-mono text-[11px] font-medium text-slate-600 bg-slate-50 rounded px-2 py-0.5">
                      {code}
                    </span>
                  </div>

                  {/* Nom + métadonnées */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {s.name ?? <span className="text-slate-400 italic">(sans nom)</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" strokeWidth={1.75} />
                        <span className="tabular-nums">{dateLabel}</span>
                      </span>
                      {s.product?.durationHours ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" strokeWidth={1.75} />
                          <span className="tabular-nums">{s.product.durationHours}h</span>
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3 text-slate-400" strokeWidth={1.75} />
                        <span className="tabular-nums">{s._count.participants}</span> inscrit{s._count.participants > 1 ? 's' : ''}
                      </span>
                      {Number(s.pricePerLearner ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Euro className="h-3 w-3 text-slate-400" strokeWidth={1.75} />
                          <span className="tabular-nums">{Number(s.pricePerLearner).toFixed(0)} €</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Statut + alerte "à clore" */}
                  <div className="shrink-0 flex items-center gap-2">
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

                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-all duration-300 ease-out active:scale-[0.97] shrink-0" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
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
