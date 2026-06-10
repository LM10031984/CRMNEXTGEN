import { describe, it, expect } from 'vitest';
import {
  MATRIX_DOC_TYPES,
  SESSION_ONLY_DOC_TYPES,
  DOC_TYPE_LABELS,
  DOC_TYPE_TO_CLOSURE_KIND,
  DOC_TYPE_TO_PED_KIND,
} from '../doc-scope';

/**
 * Tests Phase 9.1 Plan 09.1-01 Task 2 — `doc-scope.ts` (table figée D-04).
 *
 * Coverage (cf. <behavior> tests 8/9/10) :
 *  - Test 8 : MATRIX_DOC_TYPES.length === 13 (D-09.3-07 : PRE_ACCORD_OPCO retiré, jalon OpcoSubmission)
 *  - Test 9 : SESSION_ONLY_DOC_TYPES.length === 3
 *  - Test 10 : DOC_TYPE_TO_CLOSURE_KIND.CERTIFICAT_REALISATION === 'CERTIFICAT'
 *  - Sanity : chaque MATRIX_DOC_TYPE doit avoir un label DOC_TYPE_LABELS.
 */

describe('MATRIX_DOC_TYPES (D-04 table figée)', () => {
  it('Test 8 — MATRIX_DOC_TYPES.length === 13 (D-09.3-07 : PRE_ACCORD_OPCO retiré)', () => {
    expect(MATRIX_DOC_TYPES.length).toBe(13);
  });

  it('contient PROGRAMME en tête (priorité affichage colonnes matrice)', () => {
    expect(MATRIX_DOC_TYPES[0]).toBe('PROGRAMME');
  });

  it('inclut SATISFACTION_CHAUD et SATISFACTION_FROID comme 2 entrées distinctes (UI-SPEC Open Question 1)', () => {
    expect(MATRIX_DOC_TYPES).toContain('SATISFACTION_CHAUD');
    expect(MATRIX_DOC_TYPES).toContain('SATISFACTION_FROID');
  });
});

describe('SESSION_ONLY_DOC_TYPES (D-04 hors matrice)', () => {
  it('Test 9 — SESSION_ONLY_DOC_TYPES.length === 3', () => {
    expect(SESSION_ONLY_DOC_TYPES.length).toBe(3);
  });

  it('contient DEROULE_PEDAGOGIQUE + GRILLE_OBS_SESSION + CHECKLIST_FORMATION', () => {
    expect(SESSION_ONLY_DOC_TYPES).toContain('DEROULE_PEDAGOGIQUE');
    expect(SESSION_ONLY_DOC_TYPES).toContain('GRILLE_OBS_SESSION');
    expect(SESSION_ONLY_DOC_TYPES).toContain('CHECKLIST_FORMATION');
  });
});

describe('DOC_TYPE_TO_CLOSURE_KIND (mapping vers worker BullMQ)', () => {
  it('Test 10 — CERTIFICAT_REALISATION → "CERTIFICAT"', () => {
    expect(DOC_TYPE_TO_CLOSURE_KIND['CERTIFICAT_REALISATION']).toBe('CERTIFICAT');
  });

  it('ATTESTATION_FIN → "ATTESTATION"', () => {
    expect(DOC_TYPE_TO_CLOSURE_KIND['ATTESTATION_FIN']).toBe('ATTESTATION');
  });

  it('PROGRAMME et CONVENTION → null (pas de generator BullMQ)', () => {
    expect(DOC_TYPE_TO_CLOSURE_KIND['PROGRAMME']).toBeNull();
    expect(DOC_TYPE_TO_CLOSURE_KIND['CONVENTION']).toBeNull();
  });
});

describe('DOC_TYPE_TO_PED_KIND (mapping vers PedagogicalAsset)', () => {
  it('EVALUATION_ACQUIS → "QCM"', () => {
    expect(DOC_TYPE_TO_PED_KIND['EVALUATION_ACQUIS']).toBe('QCM');
  });

  it('GRILLE_OBS_SESSION → "GRILLE_OBS"', () => {
    expect(DOC_TYPE_TO_PED_KIND['GRILLE_OBS_SESSION']).toBe('GRILLE_OBS');
  });
});

describe('DOC_TYPE_LABELS (sanity)', () => {
  it('chaque MATRIX_DOC_TYPE doit avoir un label { short, long }', () => {
    for (const docType of MATRIX_DOC_TYPES) {
      const label = DOC_TYPE_LABELS[docType];
      expect(label, `Label manquant pour ${docType}`).toBeDefined();
      expect(label?.short.length, `short label trop long pour ${docType}`).toBeLessThanOrEqual(3);
      expect(label?.long.length, `long label vide pour ${docType}`).toBeGreaterThan(0);
    }
  });

  it('chaque SESSION_ONLY_DOC_TYPE doit avoir un label', () => {
    for (const docType of SESSION_ONLY_DOC_TYPES) {
      expect(DOC_TYPE_LABELS[docType], `Label manquant pour ${docType}`).toBeDefined();
    }
  });
});
