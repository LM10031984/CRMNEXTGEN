import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `LearnerAlertsBanner` (Phase 9.1 Plan 04 Task 2).
 *
 * Couverture (6 grep-tests) :
 *  1. exporte LearnerAlertsBanner
 *  2. early return `null` quand 0 alertes (Phase 5 UX-09 convention)
 *  3. copywriting FR UI-SPEC (Action requise / Voir les sessions concernées)
 *  4. role="alert" pour a11y (UI-SPEC §A11y "PrioCard alerte role=alert")
 *  5. AlertTriangle lucide icon + cross-nav vers session
 *  6. palette amber (border-amber-300 bg-amber-50 — UI-SPEC §Color)
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'learner-alerts-banner.tsx'),
  'utf-8',
);

describe('LearnerAlertsBanner smoke (Phase 9.1 Plan 04)', () => {
  it('exports LearnerAlertsBanner function', () => {
    expect(componentSrc).toMatch(/export\s+function\s+LearnerAlertsBanner/);
  });

  it('returns null when 0 alerts (Phase 5 UX-09 convention — no "all OK" banner)', () => {
    expect(componentSrc).toMatch(
      /missingDocsCount\s*===\s*0[\s\S]{0,80}pendingPaymentsCount\s*===\s*0[\s\S]{0,40}return\s+null/,
    );
  });

  it('contains the FR copywriting (Action requise / Voir les sessions concernées)', () => {
    expect(componentSrc).toMatch(/Action requise/);
    expect(componentSrc).toMatch(/Voir les sessions concernées/);
  });

  it('uses role="alert" for a11y (UI-SPEC §A11y attribute)', () => {
    expect(componentSrc).toMatch(/role=['"]alert['"]/);
  });

  it('imports AlertTriangle from lucide-react + Link for cross-nav to session', () => {
    expect(componentSrc).toMatch(/from\s+['"]lucide-react['"]/);
    expect(componentSrc).toMatch(/AlertTriangle/);
    expect(componentSrc).toMatch(/from\s+['"]next\/link['"]/);
    expect(componentSrc).toMatch(/\/app\/sessions\//);
  });

  it('uses amber palette (UI-SPEC §Color)', () => {
    expect(componentSrc).toMatch(/border-amber-300/);
    expect(componentSrc).toMatch(/bg-amber-50/);
  });

  it('does not use random hex colors outside palette (UI-SPEC anti-pattern)', () => {
    expect(componentSrc).not.toMatch(/text-\[#[0-9a-f]{6}\]/i);
    expect(componentSrc).not.toMatch(/bg-\[#[0-9a-f]{6}\]/i);
  });
});
