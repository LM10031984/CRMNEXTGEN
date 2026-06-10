import { describe, it, expect } from 'vitest';
import {
  MATRIX_DOC_TYPES,
  SESSION_ONLY_DOC_TYPES,
  DOC_TYPE_LABELS,
  DOC_TYPE_TO_CLOSURE_KIND,
  DOC_TYPE_TO_PED_KIND,
  DOC_FAMILY,
  DOC_INDICATORS,
  docFamilyOf,
  docLotOf,
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

describe('DOC_FAMILY (audit pré-BCI — gouvernance des lots)', () => {
  // L'inventaire dérive la famille pour CHAQUE docType/kind émis par le résolveur.
  // Si un type émis n'est pas couvert explicitement, il tombe en `resultat` (Lot B
  // gelé) par biais de sécurité — ce test garantit qu'on COUVRE explicitement
  // les types attendus, pour que les bordures soient validées et non subies.
  const coveredTypes = new Set<string>([
    ...MATRIX_DOC_TYPES,
    ...SESSION_ONLY_DOC_TYPES,
    // kinds bruts PedagogicalAsset (docType = pa.kind dans resolveDocs)
    ...(Object.values(DOC_TYPE_TO_PED_KIND).filter((k): k is string => !!k)),
    // toutes les clés du catalogue indicateurs (ce que resolveDocs peut émettre)
    ...Object.keys(DOC_INDICATORS),
  ]);

  it('couvre explicitement tous les docType/kind émis par le résolveur', () => {
    const missing: string[] = [];
    for (const t of coveredTypes) {
      if (t === 'CUSTOM') continue; // upload libre, hors worklist d'inventaire
      if (!(t in DOC_FAMILY)) missing.push(t);
    }
    expect(missing, `docType non classés dans DOC_FAMILY : ${missing.join(', ')}`).toEqual([]);
  });

  it('biais de sécurité : type inconnu → famille `resultat` (jamais un Lot A)', () => {
    expect(docFamilyOf('UN_TYPE_QUI_NEXISTE_PAS')).toBe('resultat');
    expect(docFamilyOf('UN_TYPE_QUI_NEXISTE_PAS')).not.toBe('descriptif');
    expect(docLotOf('UN_TYPE_QUI_NEXISTE_PAS')).toBe('B'); // jamais A ni DRIVE
  });

  it('mapping Lot (3 buckets, décision Laurent 2026-06-10) : EMARGEMENT→DRIVE, dérivés→A, résultats→B', () => {
    // Lot A : descriptif + analyse + presence_derivee
    expect(docLotOf('PROGRAMME')).toBe('A'); // descriptif
    expect(docLotOf('ANALYSE_BESOIN')).toBe('A'); // analyse
    expect(docLotOf('ASSIDUITE')).toBe('A'); // presence_derivee
    expect(docLotOf('CERTIFICAT_REALISATION')).toBe('A'); // presence_derivee
    expect(docLotOf('ATTESTATION_FIN')).toBe('A'); // presence_derivee
    // Lot B : resultat (gelé, attente Kaïna)
    expect(docLotOf('EVALUATION_ACQUIS')).toBe('B'); // resultat
    expect(docLotOf('QCM')).toBe('B'); // resultat (kind brut)
    expect(docLotOf('POSITIONNEMENT')).toBe('B'); // resultat
    expect(docLotOf('SATISFACTION_CHAUD')).toBe('B'); // resultat
    expect(docLotOf('GRILLE_OBS_SESSION')).toBe('B'); // resultat
    // Lot DRIVE : émargement signé (preuve au Drive, hors worklist)
    expect(docLotOf('EMARGEMENT')).toBe('DRIVE');
  });

  it('toute valeur de DOC_FAMILY est une famille valide', () => {
    const valid = new Set([
      'descriptif',
      'analyse',
      'resultat',
      'presence_signee',
      'presence_derivee',
    ]);
    for (const [k, v] of Object.entries(DOC_FAMILY)) {
      expect(valid.has(v), `Famille invalide pour ${k} : ${v}`).toBe(true);
    }
  });

  it('émargement = preuve signée brute → `presence_signee` → Lot DRIVE (hors worklist)', () => {
    expect(DOC_FAMILY['EMARGEMENT']).toBe('presence_signee');
    expect(docLotOf('EMARGEMENT')).toBe('DRIVE');
  });

  it('assiduité/certificat/attestation = dérivés de la présence prouvée → `presence_derivee` → Lot A', () => {
    for (const t of ['ASSIDUITE', 'CERTIFICAT_REALISATION', 'ATTESTATION_FIN']) {
      expect(DOC_FAMILY[t], `${t} doit être en presence_derivee (formalise, ne mesure pas)`).toBe(
        'presence_derivee',
      );
      expect(docLotOf(t), `${t} doit être générable (Lot A)`).toBe('A');
    }
  });
});
