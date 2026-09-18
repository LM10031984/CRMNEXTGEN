import { describe, expect, it } from 'vitest';
import { buildPlanningGrid, type PlanningSession } from '../build-planning-grid';

const trainers = [
  { id: 'alice', firstName: 'Alice', lastName: 'Martin' },
  { id: 'bob', firstName: 'Bob', lastName: 'Durand' },
];
const range = { start: '2026-09-01', end: '2026-09-30' };
const slot = (date: string, halfDay = 'full') => ({
  date,
  halfDay,
  startTime: '09:00',
  endTime: '17:00',
});
const session = (patch: Partial<PlanningSession> = {}): PlanningSession => ({
  id: 's1',
  code: 'SES-001',
  name: 'Formation IA',
  regime: 'INDIVIDUEL',
  status: 'PLANNED',
  startDate: '2026-09-18',
  endDate: '2026-09-22',
  capacityMax: 12,
  participantCount: 4,
  productName: 'Formation IA',
  locationName: 'Paris',
  slots: [slot('2026-09-18')],
  trainers: [{ personId: 'alice', isPrimary: true }],
  ...patch,
});
const occupied = (grid: ReturnType<typeof buildPlanningGrid>, row = 0) =>
  grid.rows[row]!.cells.filter((cell) => cell.sessions.length > 0);

describe('buildPlanningGrid — spec §6', () => {
  it('1. rend les 3 jours des slots sur la ligne principale, régime INDIVIDUEL', () => {
    const grid = buildPlanningGrid(
      trainers,
      [session({ slots: ['2026-09-18', '2026-09-21', '2026-09-22'].map((d) => slot(d)) })],
      [],
      range,
    );
    expect(occupied(grid).map((c) => c.date)).toEqual(['2026-09-18', '2026-09-21', '2026-09-22']);
    expect(
      occupied(grid).flatMap((c) => c.sessions.map((s) => [s.regime, s.isPrimary, s.estimated])),
    ).toEqual([
      ['INDIVIDUEL', true, false],
      ['INDIVIDUEL', true, false],
      ['INDIVIDUEL', true, false],
    ]);
  });
  it('2. estime vendredi à mardi sans week-end quand aucun slot existe', () => {
    const grid = buildPlanningGrid(trainers, [session({ slots: [] })], [], range);
    expect(occupied(grid).map((c) => c.date)).toEqual(['2026-09-18', '2026-09-21', '2026-09-22']);
    expect(occupied(grid).every((c) => c.sessions[0]!.estimated)).toBe(true);
  });
  it('3. empile deux régimes différents sans conflit', () => {
    const grid = buildPlanningGrid(
      trainers,
      [session(), session({ id: 's2', regime: 'ENTREPRISE' })],
      [],
      range,
    );
    expect(occupied(grid)[0]!.sessions).toHaveLength(2);
    expect(grid.conflicts).toEqual([]);
  });
  it('4. signale same_regime sur les deux sessions du même jour', () => {
    const grid = buildPlanningGrid(trainers, [session(), session({ id: 's2' })], [], range);
    expect(occupied(grid)[0]!.sessions.map((s) => s.conflicts)).toEqual([
      ['same_regime'],
      ['same_regime'],
    ]);
    expect(grid.conflicts).toEqual([
      { trainerId: 'alice', date: '2026-09-18', type: 'same_regime', sessionIds: ['s1', 's2'] },
    ]);
  });
  it('5. busy crée unavailable, tentative reste visible sans conflit', () => {
    for (const status of ['busy', 'tentative']) {
      const grid = buildPlanningGrid(
        trainers,
        [session()],
        [
          {
            id: 'a1',
            trainerId: 'alice',
            startsAt: '2026-09-18T08:00:00Z',
            endsAt: '2026-09-18T18:00:00Z',
            status,
            note: 'Réservé',
          },
        ],
        range,
      );
      const cell = occupied(grid)[0]!;
      expect(cell.availabilities.map((a) => a.status)).toEqual([status]);
      expect(cell.sessions[0]!.conflicts).toEqual(status === 'busy' ? ['unavailable'] : []);
    }
  });
  it('6. exclut CANCELLED toujours, DRAFT sauf includeDrafts, COMPLETED sauf filtre', () => {
    const sessions = [
      session({ status: 'CANCELLED' }),
      session({ id: 'draft', status: 'DRAFT' }),
      session({ id: 'done', status: 'COMPLETED' }),
    ];
    expect(occupied(buildPlanningGrid(trainers, sessions, [], range))).toEqual([]);
    expect(
      occupied(
        buildPlanningGrid(trainers, sessions, [], range, { includeDrafts: true }),
      )[0]!.sessions.map((s) => s.id),
    ).toEqual(['draft']);
    expect(
      occupied(
        buildPlanningGrid(trainers, sessions, [], range, {
          includeDrafts: true,
          statuses: ['CANCELLED', 'COMPLETED'],
        }),
      )[0]!
        .sessions.map((s) => s.id)
        .sort(),
    ).toEqual(['done', 'draft']);
  });
  it('7. affiche aussi la session du co-formateur avec isPrimary false', () => {
    const grid = buildPlanningGrid(
      trainers,
      [
        session({
          trainers: [
            { personId: 'alice', isPrimary: true },
            { personId: 'bob', isPrimary: false },
          ],
        }),
      ],
      [],
      range,
    );
    expect(occupied(grid, 1)[0]!.sessions[0]!.isPrimary).toBe(false);
    expect(grid.rows.map((r) => r.primarySessionCount)).toEqual([1, 0]);
  });
  it('8. rend un régime null comme undeclared', () => {
    const grid = buildPlanningGrid(trainers, [session({ regime: null })], [], range);
    expect(occupied(grid)[0]!.sessions[0]!.regime).toBe('undeclared');
  });
});
