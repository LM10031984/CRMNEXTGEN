import { expect, it } from 'vitest';
import { toParisInput, parisInputToISO } from '../availability-time';
it('affiche et enregistre les heures de Paris en hiver et en été', () => {
  expect(toParisInput('2026-09-18T07:00:00Z')).toBe('2026-09-18T09:00');
  expect(parisInputToISO('2026-09-18T09:00')).toBe('2026-09-18T07:00:00.000Z');
  expect(parisInputToISO('2026-12-18T09:00')).toBe('2026-12-18T08:00:00.000Z');
});
it('refuse une date invalide et une heure inexistante au passage heure été', () => {
  expect(parisInputToISO('2026-02-30T09:00')).toBeNull();
  expect(parisInputToISO('2026-03-29T02:30')).toBeNull();
});
import { buildPlanningGrid } from '../build-planning-grid';
it('ne dessine pas la veille UTC pour une journée complète saisie à Paris', () => {
  const grid = buildPlanningGrid(
    [{ id: 't', firstName: 'Alice', lastName: 'Test' }],
    [],
    [
      {
        id: 'a',
        trainerId: 't',
        status: 'busy',
        note: null,
        startsAt: '2026-09-18T22:00:00Z',
        endsAt: '2026-09-19T22:00:00Z',
      },
    ],
    { start: '2026-09-18', end: '2026-09-20' },
  );
  expect(grid.rows[0]!.cells.filter((c) => c.availabilities.length).map((c) => c.date)).toEqual([
    '2026-09-19',
  ]);
});
