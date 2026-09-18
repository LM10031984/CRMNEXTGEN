import { expect, it } from 'vitest';
import { parsePlanningQuery } from '../planning-query';
it('valide les dates URL et borne le mois, sans normaliser un 31 février', () => {
  expect(
    parsePlanningQuery({ m: '2026-02', d: '2026-02-31', view: 'week' }, '2026-09-18').range,
  ).toEqual({ start: '2026-01-26', end: '2026-02-01' });
  expect(parsePlanningQuery({ m: '99999-01' }, '2026-09-18').m).toBe('2026-09');
});
it('garde semaine lundi-dimanche, multi-formateurs et filtre vide explicite', () => {
  const q = parsePlanningQuery(
    { m: '2026-09', view: 'week', trainer: 'a,b', status: 'none', drafts: '1' },
    '2026-09-18',
  );
  expect(q.range).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  expect(q.filters.trainerIds).toEqual(['a', 'b']);
  expect(q.filters.statuses).toEqual([]);
  expect(q.filters.includeDrafts).toBe(true);
});
