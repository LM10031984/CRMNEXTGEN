import { describe, it, expect } from 'vitest';
import { deriveCellState } from '../derive-cell-state';
import { docTypesEnCoursParParticipant, DELAI_JOB_FANTOME_MS } from '../docs/generation-en-cours';

/**
 * « Not found, puis ça marche après un ou deux rechargements » (prod, 21/09).
 *
 * La régénération d'une attestation passe par la file. Le worker fait
 * `deleteMany + create` dans une transaction : le document régénéré reçoit un
 * NOUVEL identifiant. La matrice, redessinée juste après l'envoi en file,
 * tenait encore l'ancien — et l'offrait en lien. Dès que le worker avait fini,
 * ce lien pointait dans le vide : 404, jusqu'au rechargement.
 *
 * La règle : tant qu'un job est en file ou en cours pour (inscription × type),
 * la cellule est « en cours » et n'offre AUCUN lien. L'état `GENERATING` ne
 * porte pas de `pdfRef` : c'est le typage qui interdit le lien, pas une
 * condition d'affichage qu'on oublierait un jour.
 */

const VIDE = new Map<string, { id: string }>();
const MAINTENANT = new Date('2026-09-21T10:00:00.000Z');
const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms);

describe('deriveCellState — génération en cours', () => {
  it('un job en vol l’emporte sur un document existant : pas de lien vers un id qui va mourir', () => {
    const docs = new Map([['ATTESTATION_FIN', { id: 'ancien-id' }]]);
    const cell = deriveCellState(
      'ATTESTATION_FIN',
      { docStatus: null },
      docs,
      VIDE,
      VIDE,
      VIDE,
      undefined,
      undefined,
      new Set(['ATTESTATION_FIN']),
    );
    expect(cell).toEqual({ state: 'GENERATING' });
    expect('pdfRef' in cell).toBe(false);
  });

  it('l’emporte aussi sur une preuve signée : son lien suit le même identifiant', () => {
    const cell = deriveCellState(
      'ATTESTATION_FIN',
      { docStatus: { ATTESTATION_FIN: { state: 'MANUAL_OK' } } as never },
      new Map([['ATTESTATION_FIN', { id: 'ancien-id' }]]),
      VIDE,
      VIDE,
      VIDE,
      undefined,
      undefined,
      new Set(['ATTESTATION_FIN']),
    );
    expect(cell.state).toBe('GENERATING');
  });

  it('ne touche pas aux autres colonnes de la même inscription', () => {
    const docs = new Map([['CERTIFICAT_REALISATION', { id: 'doc-1' }]]);
    const cell = deriveCellState(
      'CERTIFICAT_REALISATION',
      { docStatus: null },
      docs,
      VIDE,
      VIDE,
      VIDE,
      undefined,
      undefined,
      new Set(['ATTESTATION_FIN']),
    );
    expect(cell.state).toBe('GENERATED');
  });

  it('sans le 9ᵉ paramètre, rien ne change — les appelants existants ne bougent pas', () => {
    const docs = new Map([['ATTESTATION_FIN', { id: 'doc-1' }]]);
    const cell = deriveCellState('ATTESTATION_FIN', { docStatus: null }, docs, VIDE, VIDE, VIDE);
    expect(cell.state).toBe('GENERATED');
  });
});

describe('docTypesEnCoursParParticipant', () => {
  it('traduit le kind du worker dans le nom de la COLONNE de la matrice', () => {
    const r = docTypesEnCoursParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(5_000) },
        { participantId: 'p1', kind: 'QCM', status: 'PROCESSING', createdAt: ilYA(5_000) },
        { participantId: 'p2', kind: 'SATISFACTION_CHAUD', status: 'QUEUED', createdAt: ilYA(5_000) },
      ],
      MAINTENANT,
    );
    expect([...(r.get('p1') ?? [])].sort()).toEqual(['ATTESTATION_FIN', 'EVALUATION_ACQUIS']);
    expect([...(r.get('p2') ?? [])]).toEqual(['SATISFACTION_CHAUD']);
  });

  it('ignore les jobs terminés ou en erreur : eux ne promettent plus rien', () => {
    const r = docTypesEnCoursParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'DONE', createdAt: ilYA(5_000) },
        { participantId: 'p1', kind: 'CERTIFICAT', status: 'ERROR', createdAt: ilYA(5_000) },
      ],
      MAINTENANT,
    );
    expect(r.size).toBe(0);
  });

  it('ignore un job FANTÔME : un worker mort ne doit pas verrouiller la cellule à vie', () => {
    const r = docTypesEnCoursParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(DELAI_JOB_FANTOME_MS + 1_000) },
        { participantId: 'p1', kind: 'CERTIFICAT', status: 'QUEUED', createdAt: ilYA(DELAI_JOB_FANTOME_MS - 1_000) },
      ],
      MAINTENANT,
    );
    expect([...(r.get('p1') ?? [])]).toEqual(['CERTIFICAT_REALISATION']);
  });

  it('ignore un kind sans colonne connue plutôt que d’inventer un nom', () => {
    const r = docTypesEnCoursParParticipant(
      [{ participantId: 'p1', kind: 'KIND_INCONNU', status: 'QUEUED', createdAt: ilYA(1_000) }],
      MAINTENANT,
    );
    expect(r.size).toBe(0);
  });
});
