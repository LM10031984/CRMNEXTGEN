import { describe, it, expect } from 'vitest';
import { deriveCellState } from '../derive-cell-state';
import { etatGenerationParParticipant, DELAI_JOB_FANTOME_MS } from '../docs/generation-en-cours';

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
      { enCours: new Set(['ATTESTATION_FIN']) },
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
      { enCours: new Set(['ATTESTATION_FIN']) },
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
      { enCours: new Set(['ATTESTATION_FIN']) },
    );
    expect(cell.state).toBe('GENERATED');
  });

  it('une génération ÉCHOUÉE ne rend jamais le lien de l’ancien document', () => {
    // Décision Laurent (21/09) : le conseiller a demandé une régénération ; lui
    // resservir l'ancien PDF comme si de rien n'était, c'est lui faire croire
    // qu'il tient la nouvelle version. La cellule dit « échec » et propose de
    // relancer — et, comme GENERATING, elle ne porte pas de `pdfRef`.
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
      { enEchec: new Set(['ATTESTATION_FIN']) },
    );
    expect(cell).toEqual({ state: 'GENERATION_FAILED' });
    expect('pdfRef' in cell).toBe(false);
  });

  it('« en cours » l’emporte sur « échec » : une relance fraîche efface l’échec affiché', () => {
    const cell = deriveCellState(
      'ATTESTATION_FIN',
      { docStatus: null },
      VIDE,
      VIDE,
      VIDE,
      VIDE,
      undefined,
      undefined,
      { enCours: new Set(['ATTESTATION_FIN']), enEchec: new Set(['ATTESTATION_FIN']) },
    );
    expect(cell.state).toBe('GENERATING');
  });

  it('sans le 9ᵉ paramètre, rien ne change — les appelants existants ne bougent pas', () => {
    const docs = new Map([['ATTESTATION_FIN', { id: 'doc-1' }]]);
    const cell = deriveCellState('ATTESTATION_FIN', { docStatus: null }, docs, VIDE, VIDE, VIDE);
    expect(cell.state).toBe('GENERATED');
  });
});

describe('etatGenerationParParticipant — le DERNIER job d’une cellule décide', () => {
  const colonnes = (m: ReturnType<typeof etatGenerationParParticipant>, p: string) => ({
    enCours: [...(m.get(p)?.enCours ?? [])].sort(),
    enEchec: [...(m.get(p)?.enEchec ?? [])].sort(),
  });

  it('traduit le kind du worker dans le nom de la COLONNE de la matrice', () => {
    const r = etatGenerationParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(5_000) },
        { participantId: 'p1', kind: 'QCM', status: 'PROCESSING', createdAt: ilYA(5_000) },
        { participantId: 'p2', kind: 'SATISFACTION_CHAUD', status: 'QUEUED', createdAt: ilYA(5_000) },
      ],
      MAINTENANT,
    );
    expect(colonnes(r, 'p1').enCours).toEqual(['ATTESTATION_FIN', 'EVALUATION_ACQUIS']);
    expect(colonnes(r, 'p2').enCours).toEqual(['SATISFACTION_CHAUD']);
  });

  it('un job en vol depuis plus de 15 min n’est plus « en cours » : c’est un ÉCHEC', () => {
    // Un worker arrêté ne doit ni verrouiller la cellule en « en cours » à vie,
    // ni — décision du 21/09 — la laisser revenir au lien de l'ancien document.
    const r = etatGenerationParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(DELAI_JOB_FANTOME_MS + 1_000) },
        { participantId: 'p1', kind: 'CERTIFICAT', status: 'QUEUED', createdAt: ilYA(DELAI_JOB_FANTOME_MS - 1_000) },
      ],
      MAINTENANT,
    );
    expect(colonnes(r, 'p1')).toEqual({
      enCours: ['CERTIFICAT_REALISATION'],
      enEchec: ['ATTESTATION_FIN'],
    });
  });

  it('une relance efface l’échec : seul le job le plus récent de la cellule compte', () => {
    const r = etatGenerationParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(60 * 60_000) },
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(5_000) },
      ],
      MAINTENANT,
    );
    expect(colonnes(r, 'p1')).toEqual({ enCours: ['ATTESTATION_FIN'], enEchec: [] });
  });

  it('une relance RÉUSSIE efface l’échec : le fantôme d’hier ne hante pas le document d’aujourd’hui', () => {
    const r = etatGenerationParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(60 * 60_000) },
        { participantId: 'p1', kind: 'ATTESTATION', status: 'DONE', createdAt: ilYA(10 * 60_000) },
      ],
      MAINTENANT,
    );
    expect(r.size).toBe(0);
  });

  it('l’ordre d’arrivée des lignes ne change rien : c’est `createdAt` qui ordonne', () => {
    const r = etatGenerationParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'DONE', createdAt: ilYA(10 * 60_000) },
        { participantId: 'p1', kind: 'ATTESTATION', status: 'QUEUED', createdAt: ilYA(60 * 60_000) },
      ],
      MAINTENANT,
    );
    expect(r.size).toBe(0);
  });

  it('un dernier job terminé ou en ERROR ne marque rien — ce module ne juge que les jobs en vol', () => {
    const r = etatGenerationParParticipant(
      [
        { participantId: 'p1', kind: 'ATTESTATION', status: 'DONE', createdAt: ilYA(5_000) },
        { participantId: 'p1', kind: 'CERTIFICAT', status: 'ERROR', createdAt: ilYA(5_000) },
      ],
      MAINTENANT,
    );
    expect(r.size).toBe(0);
  });

  it('ignore un kind sans colonne connue plutôt que d’inventer un nom', () => {
    const r = etatGenerationParParticipant(
      [{ participantId: 'p1', kind: 'KIND_INCONNU', status: 'QUEUED', createdAt: ilYA(1_000) }],
      MAINTENANT,
    );
    expect(r.size).toBe(0);
  });
});
