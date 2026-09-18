import { prisma, type SessionStatus } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { listTrainers } from '@/lib/planning/list-trainers';
import { buildPlanningGrid, planningStatuses, shiftDay } from '@/lib/planning/build-planning-grid';
import { parsePlanningQuery } from '@/lib/planning/planning-query';
import { PlanningGrid } from '@/components/planning/planning-grid';
import { PlanningToolbar } from '@/components/planning/planning-toolbar';
import { PageHeader } from '@/components/ui/page-header';

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireRole(['ADMIN', 'MANAGER', 'FORMATEUR', 'LECTEUR']);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const query = parsePlanningQuery(searchParams, today);
  const start = new Date(`${shiftDay(query.range.start, -7)}T00:00:00Z`);
  const end = new Date(`${shiftDay(query.range.end, 8)}T00:00:00Z`);
  const [allTrainers, sessions, availabilities] = await Promise.all([
    listTrainers(user.tenantId),
    prisma.trainingSession.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: planningStatuses(query.filters) as SessionStatus[] },
        startDate: { lt: end },
        endDate: { gte: start },
      },
      include: {
        trainers: { include: { person: { select: { id: true } } } },
        slots: true,
        product: { select: { title: true, code: true } },
        location: { select: { name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: [{ startDate: 'asc' }, { code: 'asc' }],
    }),
    prisma.trainerAvailability.findMany({
      where: { tenantId: user.tenantId, startsAt: { lt: end }, endsAt: { gt: start } },
      orderBy: { startsAt: 'asc' },
    }),
  ]);
  const trainers = allTrainers.map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
  const grid = buildPlanningGrid(
    trainers,
    sessions.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      regime: s.regime,
      status: s.status,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString(),
      productName: s.product.title,
      locationName: s.location?.name ?? null,
      capacityMax: s.capacityMax,
      participantCount: s._count.participants,
      trainers: s.trainers.map((t) => ({ personId: t.personId, isPrimary: t.isPrimary })),
      slots: s.slots.map((slot) => ({
        date: slot.date.toISOString(),
        halfDay: slot.halfDay,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    })),
    availabilities.map((a) => ({
      id: a.id,
      trainerId: a.trainerId,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      note: a.note,
    })),
    query.range,
    query.filters,
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Planning des formateurs"
        subtitle="Disponibilités, sessions et régimes de financement"
      />
      <PlanningToolbar trainers={trainers} today={today} conflictCount={grid.conflicts.length} />
      {trainers.length > 0 && grid.rows.length === 0 ? (
        <p className="rounded-xl border border-border p-8 text-center text-muted-foreground">
          Aucun formateur ne correspond aux filtres sélectionnés.
        </p>
      ) : (
        <PlanningGrid grid={grid} view={query.view} today={today} />
      )}
    </div>
  );
}
