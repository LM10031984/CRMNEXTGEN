/**
 * L'onglet « Avant la formation » ne liste QUE des documents d'avant.
 *
 * Garde-fou posé le 2026-09-10 : l'attestation d'assiduité AGEFICE était
 * affichée ici (héritage du DocDockDrawer supprimé en Phase 15) alors que
 * `doc-phase.ts` la classe « après ». Résultat, le bouton « Télécharger (5) »
 * la comptait et l'archive `?phase=avant` ne pouvait pas la contenir.
 *
 * Test de puissance : remettre un item `ASSIDUITE_AGEFICE` dans
 * `buildDocDockItems` doit faire rougir ce fichier.
 */

import { describe, it, expect } from 'vitest';
import { buildDocDockItems } from '../doc-dock-items';
import { phaseOfDocType } from '@/lib/docs/doc-phase';

const BASE = {
  programmeProductDocId: 'doc-programme',
  participants: [{ id: 'part-1', fullName: 'Jean-Baptiste BOUTRY', isAgefice: true }],
  // L'attestation existe en base pour cet inscrit : c'est le cas qui piégeait.
  docsByParticipant: new Map([
    [
      'part-1',
      new Map([
        ['CONVENTION', 'doc-convention'],
        ['AGEFICE', 'doc-agefice'],
        ['ASSIDUITE', 'doc-assiduite'],
      ]),
    ],
  ]),
  assetsByParticipant: new Map([['part-1', new Map([['ANALYSE_BESOIN', 'asset-analyse']])]]),
  analyseBesoinInProgress: 0,
  analyseBesoinPending: 0,
};

describe('buildDocDockItems', () => {
  it("n'affiche plus l'attestation d'assiduité AGEFICE — elle appartient à l'après", () => {
    const items = buildDocDockItems(BASE);
    expect(items.map((i) => i.docType)).not.toContain('ASSIDUITE_AGEFICE');
    expect(items.map((i) => i.docType)).not.toContain('ASSIDUITE');
  });

  it('garde les quatre documents pré-formation d’un affilié AGEFICE', () => {
    const items = buildDocDockItems(BASE).filter((i) => i.section !== 'shared');
    expect(items.map((i) => i.docType)).toEqual([
      'CONVENTION',
      'CONVOCATION',
      'AGEFICE',
      'ANALYSE_BESOIN',
    ]);
  });

  it('ne liste aucun document qui ne soit pas de la phase « avant »', () => {
    for (const item of buildDocDockItems(BASE)) {
      expect(phaseOfDocType(item.docType)).toBe('avant');
    }
  });
});
