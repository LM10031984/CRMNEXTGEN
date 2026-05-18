import { describe, it, expect } from 'vitest';
import { deriveCellState } from '../derive-cell-state';
import type { DocStatusMap } from '@qualiof/shared';

/**
 * Tests Phase 9.1 Plan 09.1-01 Task 2 — `deriveCellState` (pure function).
 *
 * Coverage (cf. <behavior> tests 1-7) :
 *  - Test 1 : Bug P0 anti-régression — PROGRAMME productDoc-only → GENERATED productDoc
 *  - Test 2 : MANUAL_OK manuel avec uploadedSignedPdfKey → MANUAL_OK
 *  - Test 3 : MANUAL_OK + markedOkWithoutUpload (D-01 dérogatoire) → MANUAL_OK + warning='no_proof'
 *  - Test 4 : participantDocs hit → GENERATED document
 *  - Test 5 : pedagogicalAssets hit → GENERATED asset
 *  - Test 6 : tout vide → MISSING
 *  - Test 7 : priorité strict participant > asset > session > product
 */

const isoNow = '2026-05-18T10:00:00.000Z';

function emptyMaps() {
  return {
    participantDocs: new Map<string, { id: string }>(),
    productDocs: new Map<string, { id: string }>(),
    sessionDocs: new Map<string, { id: string }>(),
    pedagogicalAssets: new Map<string, { id: string }>(),
  };
}

describe('deriveCellState', () => {
  // Bug P0 anti-régression
  // Le PDF Programme est stocké session-wide (Document.entityType='product'),
  // et la matrice doit dériver l'état GENERATED en lisant ce pdfRef partagé
  // pour CHAQUE participant — pas de duplication, pas de N "MISSING".
  it('Test 1 — Bug P0 anti-régression : PROGRAMME productDoc → GENERATED productDoc', () => {
    const maps = emptyMaps();
    maps.productDocs.set('PROGRAMME', { id: 'doc1' });

    const result = deriveCellState(
      'PROGRAMME',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('GENERATED');
    if (result.state === 'GENERATED') {
      expect(result.pdfRef.kind).toBe('productDoc');
      expect(result.pdfRef.id).toBe('doc1');
    }
  });

  it('Test 2 — manual MANUAL_OK avec uploadedSignedPdfKey → MANUAL_OK (priorité au manuel)', () => {
    const maps = emptyMaps();
    const docStatus: DocStatusMap = {
      CONVENTION: {
        state: 'MANUAL_OK',
        uploadedSignedPdfKey: 'signed/x.pdf',
        updatedAt: isoNow,
      },
    };

    const result = deriveCellState(
      'CONVENTION',
      { docStatus },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('MANUAL_OK');
    if (result.state === 'MANUAL_OK') {
      expect(result.warning).toBeUndefined();
    }
  });

  it('Test 3 — markedOkWithoutUpload=true (D-01 dérogatoire) → MANUAL_OK + warning=no_proof', () => {
    const maps = emptyMaps();
    const docStatus: DocStatusMap = {
      CONVENTION: {
        state: 'MANUAL_OK',
        markedOkWithoutUpload: true,
        updatedAt: isoNow,
      },
    };

    const result = deriveCellState(
      'CONVENTION',
      { docStatus },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('MANUAL_OK');
    if (result.state === 'MANUAL_OK') {
      expect(result.warning).toBe('no_proof');
    }
  });

  it('Test 4 — participantDocs hit → GENERATED { kind: "document" }', () => {
    const maps = emptyMaps();
    maps.participantDocs.set('CERTIFICAT_REALISATION', { id: 'partdoc-1' });

    const result = deriveCellState(
      'CERTIFICAT_REALISATION',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('GENERATED');
    if (result.state === 'GENERATED') {
      expect(result.pdfRef.kind).toBe('document');
      expect(result.pdfRef.id).toBe('partdoc-1');
    }
  });

  it('Test 5 — pedagogicalAssets hit → GENERATED { kind: "asset" }', () => {
    const maps = emptyMaps();
    maps.pedagogicalAssets.set('EVALUATION_ACQUIS', { id: 'asset-42' });

    const result = deriveCellState(
      'EVALUATION_ACQUIS',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('GENERATED');
    if (result.state === 'GENERATED') {
      expect(result.pdfRef.kind).toBe('asset');
      expect(result.pdfRef.id).toBe('asset-42');
    }
  });

  it('Test 6 — tout vide → MISSING', () => {
    const maps = emptyMaps();

    const result = deriveCellState(
      'CONVENTION',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('MISSING');
  });

  it('Test 7 — priorité strict participant > asset > session > product', () => {
    const maps = emptyMaps();
    maps.participantDocs.set('CERTIFICAT_REALISATION', { id: 'p' });
    maps.pedagogicalAssets.set('CERTIFICAT_REALISATION', { id: 'a' });
    maps.sessionDocs.set('CERTIFICAT_REALISATION', { id: 's' });
    maps.productDocs.set('CERTIFICAT_REALISATION', { id: 'pr' });

    const result = deriveCellState(
      'CERTIFICAT_REALISATION',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('GENERATED');
    if (result.state === 'GENERATED') {
      // Participant doc wins (priorité la plus haute après le manual override).
      expect(result.pdfRef.kind).toBe('document');
      expect(result.pdfRef.id).toBe('p');
    }
  });

  it('priorité asset > session > product quand participantDoc absent', () => {
    const maps = emptyMaps();
    maps.pedagogicalAssets.set('GRILLE_OBS_SESSION', { id: 'a' });
    maps.sessionDocs.set('GRILLE_OBS_SESSION', { id: 's' });
    maps.productDocs.set('GRILLE_OBS_SESSION', { id: 'pr' });

    const result = deriveCellState(
      'GRILLE_OBS_SESSION',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('GENERATED');
    if (result.state === 'GENERATED') {
      expect(result.pdfRef.kind).toBe('asset');
    }
  });

  it('manual override prend toujours priorité sur participantDoc présent', () => {
    const maps = emptyMaps();
    maps.participantDocs.set('CERTIFICAT_REALISATION', { id: 'p' });
    const docStatus: DocStatusMap = {
      CERTIFICAT_REALISATION: {
        state: 'MANUAL_OK',
        markedOkWithoutUpload: true,
        updatedAt: isoNow,
      },
    };

    const result = deriveCellState(
      'CERTIFICAT_REALISATION',
      { docStatus },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(result.state).toBe('MANUAL_OK');
    if (result.state === 'MANUAL_OK') {
      expect(result.warning).toBe('no_proof');
    }
  });
});
