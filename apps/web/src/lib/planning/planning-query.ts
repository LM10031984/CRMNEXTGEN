import { dayKey, shiftDay, type PlanningFilters, type PlanningRegime } from './build-planning-grid';
export const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planifiée',
  OPEN: 'Ouverte',
  VALIDATED: 'Validée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  DRAFT: 'Brouillon',
};
export const REGIME_LABELS: Record<PlanningRegime, string> = {
  INDIVIDUEL: 'Agents co / AGEFICE',
  ENTREPRISE: 'Entreprise / OPCO',
  undeclared: 'Régime non déclaré',
};
export const REGIME_CLASSES: Record<PlanningRegime, string> = {
  INDIVIDUEL: 'bg-primary-50 text-primary-700 border-primary',
  ENTREPRISE: 'bg-info/10 text-info-foreground border-info',
  undeclared: 'bg-muted text-muted-foreground border-muted-foreground',
};
export function parsePlanningQuery(
  params: Record<string, string | string[] | undefined>,
  today: string,
) {
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]![0] : params[key]);
  const month = one('m');
  const m =
    month &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    Number(month.slice(0, 4)) >= 1900 &&
    Number(month.slice(0, 4)) <= 9998
      ? month
      : today.slice(0, 7);
  const d = one('d');
  const validDay =
    d &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    !Number.isNaN(Date.parse(d)) &&
    dayKey(new Date(d).toISOString()) === d &&
    d.startsWith(m);
  const anchor = validDay ? d : today.startsWith(m) ? today : `${m}-01`;
  const view = one('view') === 'week' ? 'week' : 'month';
  const start =
    view === 'month'
      ? `${m}-01`
      : shiftDay(anchor, -((new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7));
  const end =
    view === 'week'
      ? shiftDay(start, 6)
      : new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).toISOString().slice(0, 10);
  const split = (key: string) => (one(key) ?? '').split(',').filter(Boolean);
  const selectedStatuses = split('status').filter((s) => s in STATUS_LABELS && s !== 'DRAFT');
  const filters: PlanningFilters = {
    includeDrafts: one('drafts') === '1',
    trainerIds: split('trainer'),
    regimes: split('regime').filter((s): s is PlanningRegime => s in REGIME_LABELS),
    statuses:
      one('status') === 'none' ? [] : selectedStatuses.length ? selectedStatuses : undefined,
  };
  return { m, anchor, view, range: { start, end }, filters } as const;
}
export function formatPlanningDate(day: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(
    new Date(`${dayKey(day)}T00:00:00Z`),
  );
}
