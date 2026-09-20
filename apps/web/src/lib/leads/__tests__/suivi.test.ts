import { describe, it, expect } from 'vitest';
import { ActivitySchema, EditLeadSchema, transitionAppel, libelleStatut } from '../suivi';
const draft = {
  requestId: '00000000-0000-4000-8000-000000000001',
  updatedAt: '2026-09-20T09:00:00Z',
  type: 'call',
  occurredAt: '2026-09-19T09:00:00Z',
  outcome: 'NO_ANSWER',
  durationSeconds: 42,
  body: 'Pas de réponse',
  status: 'NEW',
  nextAction: 'Rappeler',
  nextActionAt: '2026-09-22T09:00:00Z',
  lossReason: '',
};
describe('suivi commercial', () => {
  it('avance les appels 1 à 6 sans perdre le lead', () => {
    for (let i = 0; i < 6; i++) {
      const r = transitionAppel({ status: 'CONTACTED', callCount: i }, ActivitySchema.parse(draft));
      expect(r).toEqual({ callCount: i + 1, status: 'CONTACTED' });
      expect(libelleStatut(r.status, r.callCount)).toBe(`Appel ${i + 1}`);
    }
  });
  it('impose un choix après le septième appel sans réponse', () => {
    expect(() =>
      transitionAppel({ status: 'CONTACTED', callCount: 6 }, ActivitySchema.parse(draft)),
    ).toThrow('Après l’appel 7');
    expect(
      transitionAppel(
        { status: 'CONTACTED', callCount: 6 },
        ActivitySchema.parse({ ...draft, status: 'TO_FOLLOWUP' }),
      ),
    ).toEqual({ callCount: 7, status: 'TO_FOLLOWUP' });
  });
  it('permet une qualification directe', () =>
    expect(
      transitionAppel(
        { status: 'NEW', callCount: 0 },
        ActivitySchema.parse({ ...draft, outcome: 'QUALIFIED' }),
      ).status,
    ).toBe('QUALIFIED'));
  it('refuse un appel sans résultat et un lead ouvert sans prochaine action', () => {
    expect(ActivitySchema.safeParse({ ...draft, outcome: '' }).success).toBe(false);
    expect(ActivitySchema.safeParse({ ...draft, nextActionAt: '' }).success).toBe(false);
    expect(ActivitySchema.safeParse({ ...draft, nextAction: '' }).success).toBe(false);
  });
  it('exige une relance après l’appel sans réponse', () =>
    expect(() =>
      transitionAppel(
        { status: 'NEW', callCount: 0 },
        ActivitySchema.parse({ ...draft, nextActionAt: '2026-09-18T09:00:00Z' }),
      ),
    ).toThrow('relance datée'));
  it('exige un motif structuré de perte', () => {
    expect(ActivitySchema.safeParse({ ...draft, status: 'LOST', lossReason: '' }).success).toBe(
      false,
    );
    expect(
      ActivitySchema.safeParse({
        ...draft,
        status: 'LOST',
        lossReason: 'NOT_INTERESTED',
        nextAction: '',
        nextActionAt: '',
      }).success,
    ).toBe(true);
  });
  it('ne compte pas une note comme un appel', () =>
    expect(
      transitionAppel(
        { status: 'QUALIFIED', callCount: 3 },
        ActivitySchema.parse({ ...draft, type: 'note', status: 'QUALIFIED', outcome: '' }),
      ).callCount,
    ).toBe(3));
  it('refuse une durée négative et une activité future', () => {
    expect(ActivitySchema.safeParse({ ...draft, durationSeconds: -1 }).success).toBe(false);
    expect(ActivitySchema.safeParse({ ...draft, occurredAt: '2099-01-01T00:00:00Z' }).success).toBe(
      false,
    );
  });
  it('refuse un identifiant de rattachement invalide', () =>
    expect(EditLeadSchema.safeParse({ organizationId: 'bad' }).success).toBe(false));
});
