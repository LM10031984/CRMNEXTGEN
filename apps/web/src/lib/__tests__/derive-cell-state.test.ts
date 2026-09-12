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

/**
 * Lot 0 (audit produit du 28/08) — trois états qui manquaient à la matrice :
 *  · 0.2 « périmé »        : une donnée que le document porte a bougé ;
 *  · 0.2 « non vérifiable » : produit avant le suivi des empreintes — on ne
 *    peut rien affirmer, et le dire vaut mieux qu'un vert de complaisance ;
 *  · 0.3 « générique »      : contenu de remplacement, identique d'un stagiaire
 *    à l'autre — le premier écart que cherche un auditeur.
 *
 * Plus une contrainte d'action : `engaged`, quand la sortie du document est
 * prouvée. Tous sont ADDITIFS — sans les ensembles, le comportement d'avant.
 */
describe('lot 0 — périmé, non vérifiable, générique, engagé', () => {
  function celluleDoc(flags?: Parameters<typeof deriveCellState>[6]) {
    const maps = emptyMaps();
    maps.participantDocs.set('CONVENTION', { id: 'doc-1' });
    return deriveCellState(
      'CONVENTION',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      flags,
    );
  }

  it('sans drapeaux, une cellule générée reste ce qu’elle était', () => {
    const r = celluleDoc();
    expect(r.state).toBe('GENERATED');
    expect('stale' in r && r.stale).toBeFalsy();
    expect('stub' in r && r.stub).toBeFalsy();
    expect('unverifiable' in r && r.unverifiable).toBeFalsy();
    expect('engaged' in r && r.engaged).toBeFalsy();
  });

  it('un document dont la donnée a bougé est marqué périmé', () => {
    const r = celluleDoc({ stale: new Set(['doc-1']) });
    expect('stale' in r && r.stale).toBe(true);
  });

  it('un document sans empreinte est marqué non vérifiable', () => {
    const r = celluleDoc({ unverifiable: new Set(['doc-1']) });
    expect('unverifiable' in r && r.unverifiable).toBe(true);
    // Et surtout PAS périmé : on ne sait pas, on ne prétend pas.
    expect('stale' in r && r.stale).toBeFalsy();
  });

  it('un document dont la sortie est prouvée est marqué engagé', () => {
    const r = celluleDoc({ engaged: new Set(['doc-1']) });
    expect('engaged' in r && r.engaged).toBe(true);
  });

  it('les qualificatifs se cumulent sur un même document', () => {
    const r = celluleDoc({ stale: new Set(['doc-1']), engaged: new Set(['doc-1']) });
    expect('stale' in r && r.stale).toBe(true);
    expect('engaged' in r && r.engaged).toBe(true);
  });

  it('un id qui n’est dans aucun ensemble n’est pas qualifié', () => {
    const r = celluleDoc({ stale: new Set(['autre']), unverifiable: new Set(['autre']) });
    expect('stale' in r && r.stale).toBeFalsy();
    expect('unverifiable' in r && r.unverifiable).toBeFalsy();
  });

  it('le programme partagé (productDoc) est qualifié lui aussi', () => {
    const maps = emptyMaps();
    maps.productDocs.set('PROGRAMME', { id: 'prod-1' });

    const r = deriveCellState(
      'PROGRAMME',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      { stale: new Set(['prod-1']) },
    );

    expect('stale' in r && r.stale).toBe(true);
  });

  it('un asset au contenu générique est marqué comme tel', () => {
    const maps = emptyMaps();
    maps.pedagogicalAssets.set('GRILLE_OBS', { id: 'asset-1' });

    const r = deriveCellState(
      'GRILLE_OBS',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      { stub: new Set(['asset-1']) },
    );

    expect(r.state).toBe('GENERATED');
    expect('stub' in r && r.stub).toBe(true);
  });

  it('un asset n’est jamais dit « non vérifiable » — il n’a pas d’empreinte à avoir', () => {
    const maps = emptyMaps();
    maps.pedagogicalAssets.set('GRILLE_OBS', { id: 'asset-1' });

    const r = deriveCellState(
      'GRILLE_OBS',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      { unverifiable: new Set(['asset-1']) },
    );

    expect('unverifiable' in r && r.unverifiable).toBeFalsy();
  });

  it('une preuve signée manuelle continue de primer sur tout', () => {
    const maps = emptyMaps();
    maps.pedagogicalAssets.set('GRILLE_OBS', { id: 'asset-1' });
    const docStatus: DocStatusMap = {
      GRILLE_OBS: { state: 'MANUAL_OK', updatedAt: isoNow },
    };

    const r = deriveCellState(
      'GRILLE_OBS',
      { docStatus },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      { stub: new Set(['asset-1']) },
    );

    expect(r.state).toBe('MANUAL_OK');
  });
});

/**
 * Lot C.1 signature — `NA` pour une pièce HORS RÉGIME de financement
 * (spec `2026-09-04-signature-electronique-docs-signes.md` §3 bis, décision D-10).
 *
 * `MISSING` appelle une action, `NA` dit qu'il n'y a rien à faire. Confondre les
 * deux fait courir l'admin après des pièces qui n'existent pas : une session
 * 100 % salariés OPCO n'a ni dossier AGEFICE ni attestation d'assiduité, et ces
 * cellules n'ont pas à réclamer un document qui n'existera jamais.
 *
 * Le paramètre ne s'applique qu'en DERNIER RECOURS, juste avant `MISSING` :
 * une pièce hors régime qui EXISTE malgré tout reste affichée telle quelle
 * (même raisonnement que `lib/sessions/participant-phase-items.ts` : « "Sans
 * objet" ne vaut que pour un document ABSENT » — cas de la double casquette
 * EI + enseigne).
 */
describe('lot C.1 — hors régime de financement → NA, jamais MISSING', () => {
  const HORS_REGIME: ReadonlySet<string> = new Set(['AGEFICE', 'ASSIDUITE']);

  it('Test A — hors régime et aucune trace nulle part → NA (et non MISSING)', () => {
    const maps = emptyMaps();

    const r = deriveCellState(
      'ASSIDUITE',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      undefined,
      HORS_REGIME,
    );

    expect(r.state).toBe('NA');
  });

  it('Test B — hors régime mais un Document existe → reste GENERATED', () => {
    // Une pièce qui EXISTE ne disparaît pas de l'écran parce qu'elle est hors
    // régime. `NA` ne masque jamais une preuve.
    const maps = emptyMaps();
    maps.participantDocs.set('ASSIDUITE', { id: 'doc-assiduite' });

    const r = deriveCellState(
      'ASSIDUITE',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      undefined,
      HORS_REGIME,
    );

    expect(r.state).toBe('GENERATED');
    if (r.state === 'GENERATED') {
      expect(r.pdfRef).toEqual({ kind: 'document', id: 'doc-assiduite' });
    }
  });

  it('Test C — hors régime mais un scan est déposé → reste MANUAL_OK (priorité 1 intacte)', () => {
    const maps = emptyMaps();
    const docStatus: DocStatusMap = {
      ASSIDUITE: {
        state: 'MANUAL_OK',
        uploadedSignedPdfKey: 'signed/assiduite.pdf',
        updatedAt: isoNow,
      },
    };

    const r = deriveCellState(
      'ASSIDUITE',
      { docStatus },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      undefined,
      HORS_REGIME,
    );

    expect(r.state).toBe('MANUAL_OK');
  });

  it('Test D — hors régime + MANUAL_OK sans preuve → le cas dérogatoire D-01 est intact', () => {
    const maps = emptyMaps();
    const docStatus: DocStatusMap = {
      ASSIDUITE: { state: 'MANUAL_OK', markedOkWithoutUpload: true, updatedAt: isoNow },
    };

    const r = deriveCellState(
      'ASSIDUITE',
      { docStatus },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      undefined,
      HORS_REGIME,
    );

    expect(r).toEqual({ state: 'MANUAL_OK', warning: 'no_proof' });
  });

  it('Test E — non-régression : sans le nouveau paramètre, une cellule vide rend MISSING', () => {
    // Les 8 call sites actuels ne passent pas ce paramètre et ne doivent pas
    // changer d'un caractère.
    const maps = emptyMaps();

    const r = deriveCellState(
      'ASSIDUITE',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
    );

    expect(r.state).toBe('MISSING');
  });

  it('Test E bis — un docType EN régime reste MISSING même quand d’autres sont hors régime', () => {
    const maps = emptyMaps();

    const r = deriveCellState(
      'CONVENTION',
      { docStatus: null },
      maps.participantDocs,
      maps.productDocs,
      maps.sessionDocs,
      maps.pedagogicalAssets,
      undefined,
      HORS_REGIME,
    );

    expect(r.state).toBe('MISSING');
  });
});
