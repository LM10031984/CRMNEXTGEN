import { describe, it, expect } from 'vitest';
import { buildAuditWhere } from '../build-audit-where';

/**
 * Tests Phase 8 Plan 08-05 Task 1 — helper buildAuditWhere.
 *
 * Pure function (pas d'I/O) → 0 mock, 0 setup.
 *
 * Coverage (6 tests) :
 *  1. Empty filters → only tenantId scope
 *  2. userId filter exact match
 *  3. action prefix → startsWith convention
 *  4. from valid → createdAt.gte defined
 *  5. invalid dates silently ignored
 *  6. all filters combined → tenantId + userId + startsWith + gte/lte
 */
describe('buildAuditWhere', () => {
  it('Test 1 — returns just tenantId scope when filters are empty', () => {
    const r = buildAuditWhere({}, 't1');
    expect(r).toEqual({ tenantId: 't1' });
    expect(r.userId).toBeUndefined();
    expect(r.action).toBeUndefined();
    expect(r.createdAt).toBeUndefined();
  });

  it('Test 2 — adds userId filter as exact match', () => {
    const r = buildAuditWhere({ userId: 'u1' }, 't1');
    expect(r.tenantId).toBe('t1');
    expect(r.userId).toBe('u1');
  });

  it('Test 3 — uses startsWith for action prefix matching (so "users." matches "users.invite")', () => {
    const r = buildAuditWhere({ action: 'users.' }, 't1');
    expect(r.action).toEqual({ startsWith: 'users.' });
  });

  it('Test 4 — adds createdAt.gte when from is a valid ISO date', () => {
    const r = buildAuditWhere({ from: '2026-01-01' }, 't1');
    expect(r.createdAt).toBeDefined();
    const createdAt = r.createdAt as { gte: Date };
    expect(createdAt.gte).toBeInstanceOf(Date);
    expect(createdAt.gte.toISOString()).toMatch(/^2026-01-01/);
  });

  it('Test 5 — silently ignores invalid dates (no crash, no createdAt key)', () => {
    const r = buildAuditWhere({ from: 'not-a-date' }, 't1');
    expect(r.createdAt).toBeUndefined();
  });

  it('Test 6 — combines all filters with proper structure', () => {
    const r = buildAuditWhere(
      {
        userId: 'u1',
        action: 'parameters.',
        from: '2026-01-01',
        to: '2026-12-31',
      },
      't1',
    );
    expect(r.tenantId).toBe('t1');
    expect(r.userId).toBe('u1');
    expect(r.action).toEqual({ startsWith: 'parameters.' });
    expect(r.createdAt).toMatchObject({
      gte: expect.any(Date),
      lte: expect.any(Date),
    });
  });

  it('Test 7 — partial date range : only "to" sets only lte (no gte)', () => {
    const r = buildAuditWhere({ to: '2026-06-30' }, 't1');
    expect(r.createdAt).toBeDefined();
    const createdAt = r.createdAt as { gte?: Date; lte: Date };
    expect(createdAt.gte).toBeUndefined();
    expect(createdAt.lte).toBeInstanceOf(Date);
  });
});
