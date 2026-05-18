import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `LearnerTimeline` + 2 sub-composants
 * (TimelineYearMarker / TimelineSessionCard) — Phase 9.1 Plan 04 Task 2.
 *
 * Couverture (7+ grep-tests) :
 *  1. LearnerTimeline exporté + itère sur groups + utilise TimelineYearMarker + TimelineSessionCard
 *  2. TimelineYearMarker rend `<h3 className="sr-only">` (a11y UI-SPEC §A11y)
 *  3. TimelineSessionCard a `aria-label` (UI-SPEC §A11y)
 *  4. TimelineSessionCard `next/link` href vers `/app/sessions/` (D-05 cross-nav)
 *  5. TimelineSessionCard utilise `formatFunderCode` (Phase 6 helper UX-12)
 *  6. TimelineSessionCard chip docs `docs Qualiopi` ratio
 *  7. Empty state copy "Aucune session suivie" + CTA UI-SPEC
 */

const dir = path.join(__dirname, '..');

const timelineSrc = readFileSync(path.join(dir, 'learner-timeline.tsx'), 'utf-8');
const yearMarkerSrc = readFileSync(
  path.join(dir, 'timeline-year-marker.tsx'),
  'utf-8',
);
const sessionCardSrc = readFileSync(
  path.join(dir, 'timeline-session-card.tsx'),
  'utf-8',
);

describe('LearnerTimeline smoke (Phase 9.1 Plan 04)', () => {
  it('exports LearnerTimeline and references TimelineYearMarker + TimelineSessionCard', () => {
    expect(timelineSrc).toMatch(/export\s+function\s+LearnerTimeline/);
    expect(timelineSrc).toMatch(/TimelineYearMarker/);
    expect(timelineSrc).toMatch(/TimelineSessionCard/);
  });

  it('renders the empty state copywriting UI-SPEC "Aucune session suivie"', () => {
    expect(timelineSrc).toMatch(/Aucune session suivie/);
    expect(timelineSrc).toMatch(/Inscrire à une session|aucune session formée/i);
  });

  it('iterates groups by year (no inline {year, sessions})', () => {
    expect(timelineSrc).toMatch(/groups\.map|for\s*\(\s*const\s+\{?\s*year/);
  });
});

describe('TimelineYearMarker smoke', () => {
  it('exports TimelineYearMarker', () => {
    expect(yearMarkerSrc).toMatch(/export\s+function\s+TimelineYearMarker/);
  });

  it('renders an sr-only heading "Année {year}" (UI-SPEC §A11y)', () => {
    expect(yearMarkerSrc).toMatch(/sr-only/);
    expect(yearMarkerSrc).toMatch(/Année /);
  });

  it('marks visible year span with aria-hidden (decorative — UI-SPEC §A11y)', () => {
    expect(yearMarkerSrc).toMatch(/aria-hidden/);
  });
});

describe('TimelineSessionCard smoke', () => {
  it('exports TimelineSessionCard', () => {
    expect(sessionCardSrc).toMatch(/export\s+function\s+TimelineSessionCard/);
  });

  it('uses next/link href to /app/sessions/{id} (D-05 cross-nav)', () => {
    expect(sessionCardSrc).toMatch(/from\s+['"]next\/link['"]/);
    expect(sessionCardSrc).toMatch(/\/app\/sessions\//);
  });

  it('emits aria-label "Voir la session ..." (UI-SPEC §A11y session card link)', () => {
    expect(sessionCardSrc).toMatch(/aria-label=/);
    expect(sessionCardSrc).toMatch(/Voir la session/);
  });

  it('uses formatFunderCode for funder chip (Phase 6 UX-12 helper)', () => {
    expect(sessionCardSrc).toMatch(/formatFunderCode/);
  });

  it('renders the docs completeness chip "docs Qualiopi"', () => {
    expect(sessionCardSrc).toMatch(/docs Qualiopi/);
  });

  it('applies hover lift class hover:shadow-md + border-primary-200 (UI-SPEC)', () => {
    expect(sessionCardSrc).toMatch(/hover:shadow-md/);
    expect(sessionCardSrc).toMatch(/hover:border-primary-200/);
  });

  it('does not use random hex colors outside palette', () => {
    expect(sessionCardSrc).not.toMatch(/text-\[#[0-9a-f]{6}\]/i);
    expect(sessionCardSrc).not.toMatch(/bg-\[#[0-9a-f]{6}\]/i);
  });
});
