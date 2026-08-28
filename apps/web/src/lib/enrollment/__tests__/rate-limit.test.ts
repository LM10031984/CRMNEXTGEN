import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimitOk, _resetRateLimit } from '../rate-limit';

beforeEach(() => {
  vi.useFakeTimers();
  _resetRateLimit();
});
afterEach(() => vi.useRealTimers());

describe('rateLimitOk', () => {
  it('laisse passer jusqu’au quota', () => {
    for (let i = 0; i < 5; i++) expect(rateLimitOk('ip-1', 5, 3_600_000)).toBe(true);
  });

  it('bloque au-delà du quota', () => {
    for (let i = 0; i < 5; i++) rateLimitOk('ip-1', 5, 3_600_000);
    expect(rateLimitOk('ip-1', 5, 3_600_000)).toBe(false);
  });

  it('isole les clés entre elles', () => {
    for (let i = 0; i < 5; i++) rateLimitOk('ip-1', 5, 3_600_000);
    expect(rateLimitOk('ip-2', 5, 3_600_000)).toBe(true);
  });

  it('rouvre après la fenêtre', () => {
    for (let i = 0; i < 5; i++) rateLimitOk('ip-1', 5, 3_600_000);
    vi.advanceTimersByTime(3_600_001);
    expect(rateLimitOk('ip-1', 5, 3_600_000)).toBe(true);
  });
});
