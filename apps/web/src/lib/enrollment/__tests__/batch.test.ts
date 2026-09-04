import { describe, expect, it } from 'vitest';

import {
  BATCH_STATE_MESSAGE,
  batchState,
  computeBatchProgress,
  defaultMaxUses,
  isBatchOpen,
  piecesDeadline,
  tallyDateOptions,
} from '../batch';

const NOW = new Date('2026-09-10T10:00:00.000Z');
const DEMAIN = new Date('2026-09-11T10:00:00.000Z');
const HIER = new Date('2026-09-09T10:00:00.000Z');

describe('L’état d’une campagne', () => {
  const base = {
    status: 'OUVERTE' as const,
    expiresAt: DEMAIN,
    maxUses: 10,
    usedCount: 0,
    now: NOW,
  };

  it('est ouverte tant qu’elle a des places et du temps', () => {
    expect(batchState(base)).toBe('ouverte');
    expect(isBatchOpen(base)).toBe(true);
  });

  it('se ferme à l’expiration', () => {
    expect(batchState({ ...base, expiresAt: HIER })).toBe('expiree');
  });

  it('se ferme quand le plafond d’usages est atteint', () => {
    expect(batchState({ ...base, usedCount: 10 })).toBe('complete');
    expect(batchState({ ...base, maxUses: null, usedCount: 999 })).toBe('ouverte');
  });

  it('fait primer l’annulation et la clôture sur tout le reste', () => {
    // Une campagne annulée dont il resterait des places et du temps ne se
    // rouvre pas : la décision humaine l'emporte sur l'arithmétique.
    expect(batchState({ ...base, status: 'ANNULEE' })).toBe('annulee');
    expect(batchState({ ...base, status: 'CLOTUREE' })).toBe('cloturee');
    expect(batchState({ ...base, status: 'ANNULEE', expiresAt: HIER })).toBe('annulee');
  });

  it('explique au participant, sans jamais lui montrer un code', () => {
    for (const [etat, message] of Object.entries(BATCH_STATE_MESSAGE)) {
      expect(message.length, etat).toBeGreaterThan(20);
      expect(message).not.toMatch(/[A-Z_]{6,}/);
    }
  });
});

describe('Le plafond d’usages par défaut', () => {
  it('vaut trois fois l’effectif attendu — un participant peut s’y reprendre', () => {
    expect(defaultMaxUses(7)).toBe(21);
  });

  it('ne pose aucun plafond quand l’effectif est inconnu', () => {
    // Mieux vaut un lien ouvert qu'un lien qui bloque une équipe un vendredi.
    expect(defaultMaxUses(null)).toBeNull();
    expect(defaultMaxUses(0)).toBeNull();
  });
});

describe('La deadline administrative', () => {
  it('recule de la première date de session, du délai du financeur', () => {
    const d = piecesDeadline(
      [new Date('2026-10-08T08:00:00.000Z'), new Date('2026-09-24T08:00:00.000Z')],
      15,
    );
    expect(d?.toISOString().slice(0, 10)).toBe('2026-09-09');
  });

  it('n’en invente pas quand aucune date n’est posée', () => {
    expect(piecesDeadline([], 15)).toBeNull();
  });
});

describe('L’avancement — « ce qui est bon ou pas bon »', () => {
  it('ne confond pas un lien ouvert, un dossier déposé et un dossier bon', () => {
    const p = computeBatchProgress(
      ['PENDING_FORM', 'PENDING_FORM', 'SUBMITTED', 'EXTRACTED', 'VALIDATED', 'CONVERTED', 'REJECTED'],
      7,
    );
    expect(p.attendus).toBe(2);
    expect(p.aVerifier).toBe(2);
    expect(p.valides).toBe(2);
    expect(p.rejetes).toBe(1);
    expect(p.total).toBe(7);
    expect(p.percentValidated).toBe(29);
  });

  it('n’affiche aucun pourcentage sans effectif attendu — pas de 0 % trompeur', () => {
    expect(computeBatchProgress(['VALIDATED'], null).percentValidated).toBeNull();
    expect(computeBatchProgress(['VALIDATED'], 0).percentValidated).toBeNull();
  });
});

describe('Le dépouillement des dates', () => {
  const option = (votes: unknown) => ({
    id: 'o1',
    label: 'Jeudi 24/09',
    startsAt: NOW,
    endsAt: NOW,
    isRetained: false,
    votes,
  });

  it('compte les votants, pas les clics — un participant qui revient ne vote pas deux fois', () => {
    expect(tallyDateOptions([option({ pe1: true, pe2: true, pe1bis: false })])[0]!.votes).toBe(2);
  });

  it('survit à une donnée absente ou malformée', () => {
    expect(tallyDateOptions([option(null)])[0]!.votes).toBe(0);
    expect(tallyDateOptions([option([1, 2, 3])])[0]!.votes).toBe(0);
    expect(tallyDateOptions([option('nawak')])[0]!.votes).toBe(0);
  });
});
