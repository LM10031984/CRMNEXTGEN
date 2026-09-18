/** Planning en lecture, décisions D-1 à D-5 de la spec du 18/09/2026. */
export type PlanningTrainer = { id: string; firstName: string; lastName: string };
export type PlanningRegime = 'INDIVIDUEL' | 'ENTREPRISE' | 'undeclared';
export type PlanningRange = { start: string; end: string };
export type PlanningSession = {
  id: string; code: string; name: string | null; regime: 'INDIVIDUEL' | 'ENTREPRISE' | null;
  status: string; startDate: string; endDate: string; productName: string;
  locationName: string | null; capacityMax: number; participantCount: number;
  trainers: { personId: string; isPrimary: boolean }[];
  slots: { date: string; halfDay: string; startTime: string; endTime: string }[];
};
export type PlanningAvailability = {
  id: string; trainerId: string; startsAt: string; endsAt: string; status: string; note: string | null;
};
export type ConflictType = 'same_regime' | 'unavailable';
export type PlanningEntry = Omit<PlanningSession, 'regime' | 'trainers' | 'slots'> & {
  regime: PlanningRegime; isPrimary: boolean; estimated: boolean;
  halfDays: ('morning' | 'afternoon')[]; conflicts: ConflictType[];
};
export type PlanningCell = {
  date: string; sessions: PlanningEntry[]; availabilities: PlanningAvailability[];
};
export type PlanningConflict = {
  trainerId: string; date: string; type: ConflictType; sessionIds: string[];
};
export const DEFAULT_STATUSES = ['PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS'];
export type PlanningFilters = {
  includeDrafts?: boolean; statuses?: string[]; regimes?: PlanningRegime[]; trainerIds?: string[];
};

// SessionSlot.date est un jour civil sérialisé ISO ; arithmétique UTC indépendante du poste/DST.
export function dayKey(date: string): string { return date.slice(0, 10); }
export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${dayKey(day)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function daysInRange(range: PlanningRange): string[] {
  const days: string[] = [];
  for (let day = dayKey(range.start); day <= dayKey(range.end); day = shiftDay(day, 1)) days.push(day);
  return days;
}
export function planningStatuses(filters: PlanningFilters = {}): string[] {
  const statuses = (filters.statuses ?? DEFAULT_STATUSES).filter((s) => s !== 'CANCELLED' && s !== 'DRAFT');
  return filters.includeDrafts ? [...statuses, 'DRAFT'] : statuses;
}
export function buildPlanningGrid(
  trainers: PlanningTrainer[], sessions: PlanningSession[], availabilities: PlanningAvailability[],
  range: PlanningRange, filters: PlanningFilters = {},
) {
  const days = daysInRange(range);
  const statuses = planningStatuses(filters);
  const visibleSessions = sessions.filter((s) => statuses.includes(s.status) &&
    (!filters.regimes?.length || filters.regimes.includes(s.regime ?? 'undeclared')));
  const conflicts: PlanningConflict[] = [];
  const rows = trainers.filter((t) => !filters.trainerIds?.length || filters.trainerIds.includes(t.id)).map((trainer) => {
    const assigned = visibleSessions.filter((s) => s.trainers.some((t) => t.personId === trainer.id));
    const absences = availabilities.filter((a) => a.trainerId === trainer.id && ['busy', 'tentative'].includes(a.status));
    const primaryIds = new Set<string>();
    const cells: PlanningCell[] = days.map((date) => {
      const cellSessions: PlanningEntry[] = [];
      for (const session of assigned) {
        const slots = session.slots.filter((slot) => dayKey(slot.date) === date);
        const estimated = session.slots.length === 0;
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (estimated ? date < dayKey(session.startDate) || date > dayKey(session.endDate) || weekday === 0 || weekday === 6 : slots.length === 0) continue;
        const halfDays: PlanningEntry['halfDays'] = [];
        if (estimated || slots.some((s) => s.halfDay !== 'afternoon')) halfDays.push('morning');
        if (estimated || slots.some((s) => s.halfDay !== 'morning')) halfDays.push('afternoon');
        const isPrimary = session.trainers.find((t) => t.personId === trainer.id)!.isPrimary;
        if (isPrimary) primaryIds.add(session.id);
        const { trainers: _trainers, slots: _slots, regime, ...details } = session;
        cellSessions.push({ ...details, regime: regime ?? 'undeclared', isPrimary, estimated, halfDays, conflicts: [] });
      }
      const dayStart = new Date(`${date}T00:00:00Z`).getTime();
      const dayEnd = new Date(`${shiftDay(date, 1)}T00:00:00Z`).getTime();
      const cellAbsences = absences.filter((a) => Date.parse(a.startsAt) < dayEnd && Date.parse(a.endsAt) > dayStart);
      // D-3a porte sur le jour, même si les demi-journées sont distinctes.
      for (const regime of ['INDIVIDUEL', 'ENTREPRISE', 'undeclared'] as const) {
        const same = cellSessions.filter((s) => s.regime === regime);
        if (same.length > 1) {
          same.forEach((s) => s.conflicts.push('same_regime'));
          conflicts.push({ trainerId: trainer.id, date, type: 'same_regime', sessionIds: same.map((s) => s.id) });
        }
      }
      if (cellSessions.length && cellAbsences.some((a) => a.status === 'busy')) {
        cellSessions.forEach((s) => s.conflicts.push('unavailable'));
        conflicts.push({ trainerId: trainer.id, date, type: 'unavailable', sessionIds: cellSessions.map((s) => s.id) });
      }
      return { date, sessions: cellSessions, availabilities: cellAbsences };
    });
    return { trainer, primarySessionCount: primaryIds.size, cells };
  });
  return { days, rows, conflicts };
}
export type PlanningGridData = ReturnType<typeof buildPlanningGrid>;
