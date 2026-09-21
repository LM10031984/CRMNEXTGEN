import { describe, it, expect, beforeEach, vi } from 'vitest';

const { documentFindFirst, participantFindFirst } = vi.hoisted(() => ({
  documentFindFirst: vi.fn(),
  participantFindFirst: vi.fn(),
}));

// Mock PARTIEL : `prisma` est doublé, mais l'énumération `DocType` reste la
// VRAIE. Un test qui inventerait sa propre liste de types ne prouverait rien —
// c'est précisément l'écart entre la liste supposée et le schéma réel qui a
// produit le 500 en production.
vi.mock('@qualiof/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@qualiof/db')>()),
  prisma: {
    document: { findFirst: documentFindFirst },
    sessionParticipant: { findFirst: participantFindFirst },
  },
}));

import { DocType } from '@qualiof/db';
import { getParticipantDocEngagement } from '../document-engagement';

/**
 * Le 500 du 21/09 : « Invalid value for argument `type`. Expected DocType. »
 *
 * La matrice envoie le `docKind` de la colonne cliquée. Pour les documents de
 * clôture, ce nom appartient à `ClosureDocKind` / `PedagogicalAssetKind` —
 * `SATISFACTION_CHAUD`, `QCM`, `DEROULE_PEDA`… — et PAS à `DocType`. Un
 * `type: docType as never` le laissait filer jusqu'à Prisma, qui le refuse à
 * l'exécution : la page entière tombait en erreur serveur.
 *
 * La règle : un kind qui n'est pas un `DocType` n'a, par construction, aucun
 * document nominatif à protéger. La fonction doit rendre `null` sans interroger
 * la base — pas lever.
 */

const TENANT = 'db191440-a144-48d1-93c1-767e6f647f2c';
const PARTICIPANT = '83f088ec-d953-4000-b562-b1355b83860e';

/** Toute la colonne de la matrice, telle que `PEDAGOGICAL_KIND_BY_CLOSURE_KIND` la nomme. */
const COLONNE = [
  'QCM',
  'GRILLE_OBS',
  'ANALYSE_BESOIN',
  'POSITIONNEMENT',
  'SATISFACTION_CHAUD',
  'SATISFACTION_FROID',
  'DEROULE_PEDA',
  'EMARGEMENT',
] as const;

const estDocType = (nom: string): boolean =>
  Object.prototype.hasOwnProperty.call(DocType, nom);

beforeEach(() => {
  vi.clearAllMocks();
  documentFindFirst.mockResolvedValue(null);
  participantFindFirst.mockResolvedValue(null);
});

describe('getParticipantDocEngagement — un kind hors DocType ne doit jamais atteindre Prisma', () => {
  it('le cas exact de la production : SATISFACTION_CHAUD ne lève pas et rend null', async () => {
    await expect(
      getParticipantDocEngagement(TENANT, PARTICIPANT, 'SATISFACTION_CHAUD'),
    ).resolves.toBeNull();
    expect(documentFindFirst).not.toHaveBeenCalled();
  });

  it.each(COLONNE)('%s : comportement conforme au schéma réel', async (kind) => {
    await expect(
      getParticipantDocEngagement(TENANT, PARTICIPANT, kind),
    ).resolves.toBeNull();

    if (estDocType(kind)) {
      // Un vrai DocType doit continuer d'être cherché — sinon on aurait fermé
      // le garde d'engagement en même temps que le trou.
      expect(documentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: kind }) }),
      );
    } else {
      expect(documentFindFirst).not.toHaveBeenCalled();
    }
  });

  it('EMARGEMENT est bien le seul de la colonne qui soit un DocType', () => {
    // Si ce test rougit, c'est que le schéma a bougé : mettre à jour la
    // colonne ci-dessus plutôt que de contourner.
    expect(COLONNE.filter(estDocType)).toEqual(['EMARGEMENT']);
  });

  it('un DocType hors colonne reste interrogé normalement', async () => {
    await expect(
      getParticipantDocEngagement(TENANT, PARTICIPANT, 'ASSIDUITE'),
    ).resolves.toBeNull();
    expect(documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'ASSIDUITE' }) }),
    );
  });

  it('CONVENTION : le repli sur la convention de groupe reste atteint', async () => {
    await getParticipantDocEngagement(TENANT, PARTICIPANT, 'CONVENTION');
    expect(documentFindFirst).toHaveBeenCalled();
    expect(participantFindFirst).toHaveBeenCalled();
  });
});
