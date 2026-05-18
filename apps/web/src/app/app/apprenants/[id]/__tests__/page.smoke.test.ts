import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `apprenants/[id]/page.tsx` (Phase 9.1 Plan 04 Task 3).
 *
 * Pattern Phase 9 D-Phase9-N : analyse statique du source, environment=node,
 * @testing-library/react non installé.
 *
 * Couverture (8 grep-tests) :
 *  1. importe et utilise les 3 composants timeline Phase 9.1 Plan 04
 *  2. importe les 3 helpers learner-stats
 *  3. utilise Promise.all pour bulk fetch (rawProductDocs + rawSessionDocs)
 *  4. construit les 4 maps (participantDocsByPid / pedAssetsByPid / productDocsBySid / sessionDocsBySid)
 *  5. appelle detectLearnerAlerts avec les 4 maps
 *  6. n'a pas cassé l'existant (Breadcrumb / IdentityDocsCard / BudgetAgefice / LearnerTabs présents)
 *  7. cross-nav D-05 conservée (existing LegalLink + sessions/{id})
 *  8. MATRIX_DOC_TYPES utilisé pour docsTotal
 */

const pageSrc = readFileSync(
  path.join(__dirname, '..', 'page.tsx'),
  'utf-8',
);

describe('apprenants/[id]/page.tsx smoke (Phase 9.1 Plan 04)', () => {
  it('imports and uses the 3 timeline components', () => {
    expect(pageSrc).toMatch(/import\s*\{?\s*LearnerPrioCards\s*\}?\s*from\s+['"]@\/components\/apprenants\/timeline\/learner-prio-cards['"]/);
    expect(pageSrc).toMatch(/import\s*\{?\s*LearnerAlertsBanner\s*\}?\s*from\s+['"]@\/components\/apprenants\/timeline\/learner-alerts-banner['"]/);
    expect(pageSrc).toMatch(/import\s*\{?\s*LearnerTimeline\s*\}?\s*from\s+['"]@\/components\/apprenants\/timeline\/learner-timeline['"]/);
    expect(pageSrc).toMatch(/<LearnerPrioCards/);
    expect(pageSrc).toMatch(/<LearnerAlertsBanner/);
    expect(pageSrc).toMatch(/<LearnerTimeline/);
  });

  it('imports the 3 learner-stats helpers (groupParticipationsByYear / computeLearnerHours / detectLearnerAlerts)', () => {
    expect(pageSrc).toMatch(/groupParticipationsByYear/);
    expect(pageSrc).toMatch(/computeLearnerHours/);
    expect(pageSrc).toMatch(/detectLearnerAlerts/);
  });

  it('uses Promise.all for bulk fetch (rawProductDocs + rawSessionDocs)', () => {
    expect(pageSrc).toMatch(/Promise\.all/);
    expect(pageSrc).toMatch(/rawProductDocs/);
    expect(pageSrc).toMatch(/rawSessionDocs/);
    // Both entityType lookups present
    expect(pageSrc).toMatch(/entityType:\s*['"]product['"]/);
    expect(pageSrc).toMatch(/entityType:\s*['"]session['"]/);
  });

  it('builds the 4 maps for detectLearnerAlerts', () => {
    expect(pageSrc).toMatch(/participantDocsByPid/);
    expect(pageSrc).toMatch(/pedAssetsByPid/);
    expect(pageSrc).toMatch(/productDocsBySid/);
    expect(pageSrc).toMatch(/sessionDocsBySid/);
  });

  it('uses MATRIX_DOC_TYPES for docsTotal in TimelineSessionCard data', () => {
    expect(pageSrc).toMatch(/MATRIX_DOC_TYPES\.length/);
  });

  it('keeps the existing sections (Breadcrumb / IdentityDocsCard / BudgetAgefice / LearnerTabs)', () => {
    expect(pageSrc).toMatch(/<Breadcrumb/);
    expect(pageSrc).toMatch(/<IdentityDocsCard/);
    expect(pageSrc).toMatch(/<BudgetAgefice/);
    expect(pageSrc).toMatch(/<LearnerTabs/);
  });

  it('cross-nav D-05 conservée (lien vers /app/sessions/)', () => {
    expect(pageSrc).toMatch(/\/app\/sessions\//);
  });

  it('insertion top : LearnerAlertsBanner avant LearnerPrioCards avant LearnerTimeline avant LearnerTabs', () => {
    const idxBanner = pageSrc.indexOf('<LearnerAlertsBanner');
    const idxPrio = pageSrc.indexOf('<LearnerPrioCards');
    const idxTimeline = pageSrc.indexOf('<LearnerTimeline');
    const idxTabs = pageSrc.indexOf('<LearnerTabs');
    expect(idxBanner).toBeGreaterThan(0);
    expect(idxPrio).toBeGreaterThan(idxBanner);
    expect(idxTimeline).toBeGreaterThan(idxPrio);
    expect(idxTabs).toBeGreaterThan(idxTimeline);
  });
});
