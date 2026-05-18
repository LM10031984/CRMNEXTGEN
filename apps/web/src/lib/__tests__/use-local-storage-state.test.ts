import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `useLocalStorageState` (Phase 9.1 Plan 03 Task 1).
 *
 * Vérifie la structure de l'helper SSR-safe localStorage state
 * (RESEARCH Finding 2).
 */

const src = readFileSync(
  path.join(__dirname, '..', 'use-local-storage-state.ts'),
  'utf-8',
);

describe('useLocalStorageState — smoke (Phase 9.1 Plan 03)', () => {
  it('declares use client directive (Client hook)', () => {
    expect(src).toMatch(/^['"]use client['"]/);
  });

  it('exports useLocalStorageState named function', () => {
    expect(src).toMatch(/export\s+function\s+useLocalStorageState/);
  });

  it('uses useState + useEffect + useCallback from react', () => {
    expect(src).toMatch(/from\s+['"]react['"]/);
    expect(src).toMatch(/useState/);
    expect(src).toMatch(/useEffect/);
    expect(src).toMatch(/useCallback/);
  });

  it('reads localStorage post-mount in useEffect (SSR-safe)', () => {
    expect(src).toMatch(/window\.localStorage\.getItem/);
    // useEffect callback contains the localStorage read (not at module init)
    expect(src).toMatch(/useEffect\(/);
  });

  it('writes via localStorage.setItem inside the setter', () => {
    expect(src).toMatch(/window\.localStorage\.setItem/);
  });

  it('wraps localStorage access in try/catch (private mode fallback)', () => {
    const matches = src.match(/try\s*\{/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // 1 read + 1 write
  });

  it('returns initial value until hydrated (avoid hydration mismatch)', () => {
    expect(src).toMatch(/hydrated/);
  });
});
