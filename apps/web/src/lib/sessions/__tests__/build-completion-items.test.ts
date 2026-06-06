/**
 * Tests des deux helpers d'items utilisés par les step blocks pour passer
 * à `docCompletion()`. Le contrat : même set qu'avant le refactor du
 * commit ui-e, mais comptabilisé via la SAME fonction que le drawer.
 *
 * Smoke check #7 — "compteur step = état drawer = matrice".
 */

import { describe, expect, it } from 'vitest';
import { docCompletion } from '../doc-completion';
import { buildPrepCompletionItems } from '../build-prep-completion-items';
import { buildClosureCompletionItems } from '../build-closure-completion-items';
import type { SessionPreparationStatus } from '@/server/actions/prepare-training';

function emptyPrep(N: number): SessionPreparationStatus {
  return {
    ok: true,
    programme: false,
    deroule: false,
    checklist: false,
    conventionsCount: 0,
    convocationsCount: 0,
    analyseBesoinDone: 0,
    analyseBesoinInProgress: 0,
    analyseBesoinPending: 0,
    ageficeCount: 0,
    ageficeEligibleCount: 0,
    participantsCount: N,
  };
}

describe('buildPrepCompletionItems', () => {
  it('session vide (N=0) : 3 items partagés tous missing', () => {
    const items = buildPrepCompletionItems(emptyPrep(0));
    expect(items).toHaveLength(3);
    expect(docCompletion(items)).toEqual({ total: 3, ready: 0, pending: 0, missing: 3 });
  });

  it('session 2 apprenants vide : 3 + 2*3 = 9 items missing (pas AGEFICE)', () => {
    const items = buildPrepCompletionItems(emptyPrep(2));
    expect(items).toHaveLength(9);
    expect(docCompletion(items).missing).toBe(9);
  });

  it('1 TNS éligible AGEFICE : 3 partagés + 1*3 + 1 AGEFICE = 7', () => {
    const items = buildPrepCompletionItems({
      ...emptyPrep(1),
      ageficeEligibleCount: 1,
    });
    expect(items).toHaveLength(7);
    expect(docCompletion(items).missing).toBe(7);
  });

  it('analyse besoin in-flight remontée en `pending`', () => {
    const items = buildPrepCompletionItems({
      ...emptyPrep(2),
      programme: true,
      deroule: true,
      analyseBesoinInProgress: 2,
    });
    const c = docCompletion(items);
    // 3 partagés (2 ready + 1 missing) + 2 convention + 2 convocation + 2 AB pending
    expect(c.total).toBe(9);
    expect(c.ready).toBe(2);
    expect(c.pending).toBe(2);
    expect(c.missing).toBe(5);
  });

  it('complet : ready === total', () => {
    const items = buildPrepCompletionItems({
      ...emptyPrep(2),
      programme: true,
      deroule: true,
      checklist: true,
      conventionsCount: 2,
      convocationsCount: 2,
      analyseBesoinDone: 2,
      ageficeCount: 1,
      ageficeEligibleCount: 1,
    });
    const c = docCompletion(items);
    expect(c.ready).toBe(c.total);
    expect(c.missing).toBe(0);
  });
});

describe('buildClosureCompletionItems', () => {
  it('session vide (N=0) : 3 items partagés', () => {
    const items = buildClosureCompletionItems({
      participantsCount: 0,
      ageficeEligibleCount: 0,
      programmeProductDocId: null,
      grilleObsSession: false,
      bilanSatisfaction: false,
      attestations: 0,
      certificats: 0,
      qcm: 0,
      positionnements: 0,
      satisfactionChaud: 0,
      satisfactionFroid: 0,
      assiduites: 0,
    });
    expect(items).toHaveLength(3);
    expect(docCompletion(items).missing).toBe(3);
  });

  it('2 apprenants non AGEFICE : 3 + 6*2 = 15 items', () => {
    const items = buildClosureCompletionItems({
      participantsCount: 2,
      ageficeEligibleCount: 0,
      programmeProductDocId: 'doc_123',
      grilleObsSession: true,
      bilanSatisfaction: false,
      attestations: 2,
      certificats: 2,
      qcm: 0,
      positionnements: 0,
      satisfactionChaud: 0,
      satisfactionFroid: 0,
      assiduites: 0,
    });
    expect(items).toHaveLength(15);
    const c = docCompletion(items);
    expect(c.ready).toBe(2 /* grilleObs + programme */ + 4 /* 2 att + 2 cert */);
    expect(c.missing).toBe(15 - 6);
  });

  it('TNS AGEFICE compté sur les éligibles uniquement', () => {
    const items = buildClosureCompletionItems({
      participantsCount: 3,
      ageficeEligibleCount: 1,
      programmeProductDocId: null,
      grilleObsSession: false,
      bilanSatisfaction: false,
      attestations: 0,
      certificats: 0,
      qcm: 0,
      positionnements: 0,
      satisfactionChaud: 0,
      satisfactionFroid: 0,
      assiduites: 0,
    });
    // 3 partagés + 3*6 par stagiaire + 1 assiduité = 22
    expect(items).toHaveLength(22);
  });

  it('pack complet → ready === total', () => {
    const N = 2;
    const items = buildClosureCompletionItems({
      participantsCount: N,
      ageficeEligibleCount: 1,
      programmeProductDocId: 'doc_x',
      grilleObsSession: true,
      bilanSatisfaction: true,
      attestations: N,
      certificats: N,
      qcm: N,
      positionnements: N,
      satisfactionChaud: N,
      satisfactionFroid: N,
      assiduites: 1,
    });
    const c = docCompletion(items);
    expect(c.ready).toBe(c.total);
    expect(c.missing).toBe(0);
  });
});
