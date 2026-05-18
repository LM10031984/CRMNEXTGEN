import { describe, it, expect } from 'vitest';
import {
  groupParticipationsByYear,
  computeLearnerHours,
  detectLearnerAlerts,
  type ParticipationForStats,
} from '../learner-stats';

/**
 * Tests Phase 9.1 Plan 09.1-04 Task 1 — `learner-stats` (pure functions).
 *
 * Coverage (cf. <behavior> tests 1-7) :
 *  - Test 1 : groupParticipationsByYear regroupe + tri années desc + intra-année desc startDate
 *  - Test 2 : computeLearnerHours sum sans filtre year
 *  - Test 3 : computeLearnerHours filtré year ne somme que les sessions de cette année
 *  - Test 4 : detectLearnerAlerts compte missing via deriveCellState itéré sur MATRIX_DOC_TYPES
 *  - Test 5 : detectLearnerAlerts compte pendingPayments où paymentStatus === 'PENDING'
 *  - Test 6 : edge case — participations vides → {0, 0}
 *  - Test 7 : edge case — session traversant l'année (28/12 → 03/01) assignée à year(startDate)
 */

function buildParticipation(opts: {
  id: string;
  startDate: string | Date;
  durationHours?: number;
  paymentStatus?: string | null;
  docStatus?: ParticipationForStats['docStatus'];
  sessionId?: string;
  title?: string;
}): ParticipationForStats {
  return {
    id: opts.id,
    paymentStatus: opts.paymentStatus ?? null,
    docStatus: opts.docStatus ?? null,
    session: {
      id: opts.sessionId ?? `s-${opts.id}`,
      startDate: opts.startDate,
      product: {
        durationHours: opts.durationHours ?? 14,
        title: opts.title ?? 'Cycle prospection',
      },
    },
  };
}

describe('groupParticipationsByYear', () => {
  it('Test 1 — regroupe par année desc avec tri intra-année desc startDate', () => {
    const parts = [
      buildParticipation({ id: 'p1', startDate: '2026-10-21' }),
      buildParticipation({ id: 'p2', startDate: '2025-03-15' }),
      buildParticipation({ id: 'p3', startDate: '2026-01-10' }),
    ];
    const result = groupParticipationsByYear(parts);
    const years = [...result.keys()];
    expect(years).toEqual([2026, 2025]); // années desc
    const y2026 = result.get(2026);
    expect(y2026).toBeDefined();
    expect(y2026?.map((p) => p.id)).toEqual(['p1', 'p3']); // intra-année desc startDate (2026-10-21 avant 2026-01-10)
    const y2025 = result.get(2025);
    expect(y2025?.map((p) => p.id)).toEqual(['p2']);
  });

  it('Test 7 — session traversant l\'année (28/12/2025 → 03/01/2026) assignée à year(startDate)=2025', () => {
    const parts = [
      buildParticipation({ id: 'cross', startDate: '2025-12-28' }),
    ];
    const result = groupParticipationsByYear(parts);
    expect(result.has(2025)).toBe(true);
    expect(result.has(2026)).toBe(false);
  });
});

describe('computeLearnerHours', () => {
  it('Test 2 — somme toutes les heures sans filtre year', () => {
    const parts = [
      buildParticipation({ id: 'p1', startDate: '2026-01-01', durationHours: 14 }),
      buildParticipation({ id: 'p2', startDate: '2025-01-01', durationHours: 21 }),
    ];
    expect(computeLearnerHours(parts)).toBe(35);
  });

  it('Test 3 — filtre year ne somme que les sessions de cette année', () => {
    const parts = [
      buildParticipation({ id: 'p1', startDate: '2026-10-21', durationHours: 14 }),
      buildParticipation({ id: 'p2', startDate: '2025-03-15', durationHours: 21 }),
      buildParticipation({ id: 'p3', startDate: '2026-01-10', durationHours: 7 }),
    ];
    expect(computeLearnerHours(parts, 2026)).toBe(21); // 14 + 7
    expect(computeLearnerHours(parts, 2025)).toBe(21);
    expect(computeLearnerHours(parts, 2024)).toBe(0);
  });
});

describe('detectLearnerAlerts', () => {
  it('Test 4 — compte missing via deriveCellState (productDoc PROGRAMME présent → moins de MISSING)', () => {
    // 1 participant sans aucun doc → tous les MATRIX_DOC_TYPES en MISSING
    const parts = [buildParticipation({ id: 'p1', startDate: '2026-01-01', sessionId: 'ses1' })];

    const emptyParticipantDocs = new Map<string, Map<string, { id: string }>>();
    const emptyProductDocs = new Map<string, Map<string, { id: string }>>();
    const emptySessionDocs = new Map<string, Map<string, { id: string }>>();
    const emptyPedAssets = new Map<string, Map<string, { id: string }>>();

    const fullyMissing = detectLearnerAlerts(
      parts,
      emptyProductDocs,
      emptySessionDocs,
      emptyParticipantDocs,
      emptyPedAssets,
    );
    // 14 MATRIX_DOC_TYPES, tous MISSING quand rien n'existe
    expect(fullyMissing.missingDocsCount).toBe(14);

    // Maintenant ajoutons PROGRAMME au niveau product (Bug P0 anti-régression) → 1 doc rempli
    const productDocs = new Map<string, Map<string, { id: string }>>();
    const programmeMap = new Map<string, { id: string }>();
    programmeMap.set('PROGRAMME', { id: 'doc-prog' });
    productDocs.set('ses1', programmeMap);

    const withProgramme = detectLearnerAlerts(
      parts,
      productDocs,
      emptySessionDocs,
      emptyParticipantDocs,
      emptyPedAssets,
    );
    expect(withProgramme.missingDocsCount).toBe(13);
  });

  it('Test 5 — compte les paiements pending par paymentStatus', () => {
    const parts = [
      buildParticipation({ id: 'p1', startDate: '2026-01-01', paymentStatus: 'PENDING' }),
      buildParticipation({ id: 'p2', startDate: '2026-02-01', paymentStatus: 'PAID' }),
      buildParticipation({ id: 'p3', startDate: '2026-03-01', paymentStatus: 'PENDING' }),
    ];

    const result = detectLearnerAlerts(
      parts,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    );
    expect(result.pendingPaymentsCount).toBe(2);
  });

  it('Test 6 — edge case : participations vides → { missingDocsCount: 0, pendingPaymentsCount: 0 }', () => {
    const result = detectLearnerAlerts([], new Map(), new Map(), new Map(), new Map());
    expect(result).toEqual({ missingDocsCount: 0, pendingPaymentsCount: 0 });
  });

  it('Test 8 — manual MANUAL_OK dans docStatus réduit missingDocsCount', () => {
    const parts = [
      buildParticipation({
        id: 'p1',
        startDate: '2026-01-01',
        sessionId: 'ses1',
        docStatus: {
          CONVENTION: { state: 'MANUAL_OK', updatedAt: '2026-05-18T10:00:00.000Z' },
          EMARGEMENT: { state: 'MANUAL_OK', updatedAt: '2026-05-18T10:00:00.000Z' },
        },
      }),
    ];

    const result = detectLearnerAlerts(
      parts,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    );
    // 14 MATRIX - 2 MANUAL_OK = 12 MISSING
    expect(result.missingDocsCount).toBe(12);
  });
});
