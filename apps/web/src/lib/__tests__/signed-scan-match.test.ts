import { describe, it, expect } from 'vitest';

/**
 * Lot A — Signature électronique & docs signés (spec 2026-09-04 §5 lot A).
 *
 * Pré-affectation automatique fichier → participant : « quand le nom du
 * fichier contient le nom ou prénom du participant (normalisation sans
 * accents/casse — ex. `emargement-dupont.pdf` → Dupont), sinon vide ».
 *
 * Règle métier gravée n°4 : signataires résolus, jamais devinés. Ici :
 * en cas d'ambiguïté (2 DUPONT), on ne devine pas → null, l'admin choisit.
 */

import {
  normalizeForMatch,
  matchParticipantByFilename,
  autoAssignFiles,
  findDuplicateAssignments,
} from '../signed-scan-match';

const JEAN = { id: 'p1', fullName: 'Jean DUPONT' };
const MARIE = { id: 'p2', fullName: 'Marie MARTIN' };
const BENOIT = { id: 'p3', fullName: 'Benoît LEFÈVRE' };
const MARIE_DUPONT = { id: 'p4', fullName: 'Marie DUPONT' };
const LE_ROY = { id: 'p5', fullName: 'Le Roy' };

describe('normalizeForMatch', () => {
  it('supprime accents, casse et ponctuation', () => {
    expect(normalizeForMatch('Émargement_DUPONT-01.pdf')).toBe('emargement dupont 01 pdf');
  });

  it('rend une chaîne vide pour une entrée vide', () => {
    expect(normalizeForMatch('')).toBe('');
  });
});

describe('matchParticipantByFilename', () => {
  it('pré-affecte sur le NOM contenu dans le fichier', () => {
    expect(matchParticipantByFilename('emargement-dupont.pdf', [JEAN, MARIE])).toBe('p1');
  });

  it('pré-affecte sur le PRÉNOM contenu dans le fichier', () => {
    expect(matchParticipantByFilename('scan_marie.pdf', [JEAN, MARIE])).toBe('p2');
  });

  it('ignore les accents des deux côtés', () => {
    expect(matchParticipantByFilename('emargement-lefevre.pdf', [JEAN, BENOIT])).toBe('p3');
    expect(matchParticipantByFilename('emargement-BENOIT.pdf', [JEAN, BENOIT])).toBe('p3');
  });

  it('rend null quand aucun participant ne correspond', () => {
    expect(matchParticipantByFilename('scan001.pdf', [JEAN, MARIE])).toBeNull();
  });

  it("rend null quand l'affectation est ambiguë (2 homonymes)", () => {
    expect(matchParticipantByFilename('emargement-dupont.pdf', [JEAN, MARIE_DUPONT])).toBeNull();
  });

  it('départage par le nombre de tokens communs (prénom + nom > nom seul)', () => {
    expect(matchParticipantByFilename('emargement-jean-dupont.pdf', [JEAN, MARIE_DUPONT])).toBe('p1');
  });

  it('ignore les tokens trop courts pour éviter les faux positifs', () => {
    // « le » (2 lettres) ne doit pas déclencher un match sur "Le Roy".
    expect(matchParticipantByFilename('emargement-le-2026.pdf', [LE_ROY, MARIE])).toBeNull();
  });
});

describe('autoAssignFiles', () => {
  it('rend un tableau aligné sur les fichiers', () => {
    const r = autoAssignFiles(
      ['emargement-dupont.pdf', 'inconnu.pdf', 'scan-martin.pdf'],
      [JEAN, MARIE],
    );
    expect(r).toEqual(['p1', null, 'p2']);
  });
});

describe('findDuplicateAssignments', () => {
  it('repère un participant affecté deux fois', () => {
    expect(findDuplicateAssignments(['p1', 'p1', null, 'p2'])).toEqual(['p1']);
  });

  it('rend un tableau vide quand tout est distinct', () => {
    expect(findDuplicateAssignments(['p1', null, 'p2'])).toEqual([]);
  });
});
