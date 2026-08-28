import { describe, it, expect } from 'vitest';
import {
  generatePublicToken,
  publicLinkState,
  buildPublicEnrollmentUrl,
  type PublicLinkInput,
} from '../public-link';

const base: PublicLinkInput = {
  publicToken: 'a'.repeat(32),
  publicFormClosedAt: null,
  sessionStatus: 'OPEN',
  capacityMax: 12,
  participantCount: 3,
  pendingRequestCount: 1,
};

describe('generatePublicToken', () => {
  it('produit 32 caractères hexadécimaux', () => {
    const t = generatePublicToken();
    expect(t).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ne produit pas deux fois le même jeton', () => {
    expect(generatePublicToken()).not.toBe(generatePublicToken());
  });
});

describe('publicLinkState', () => {
  it('ouvert quand le jeton existe, rien n’est fermé et il reste de la place', () => {
    expect(publicLinkState(base)).toBe('ouvert');
  });

  it('jamais-ouvert quand le jeton est absent', () => {
    expect(publicLinkState({ ...base, publicToken: null })).toBe('jamais-ouvert');
  });

  it('ferme quand publicFormClosedAt est renseigné', () => {
    expect(publicLinkState({ ...base, publicFormClosedAt: new Date() })).toBe('ferme');
  });

  it('session-terminee pour une session COMPLETED', () => {
    expect(publicLinkState({ ...base, sessionStatus: 'COMPLETED' })).toBe('session-terminee');
  });

  it('session-terminee pour une session CANCELLED', () => {
    expect(publicLinkState({ ...base, sessionStatus: 'CANCELLED' })).toBe('session-terminee');
  });

  it('complet quand inscrits + demandes en cours atteignent la capacité', () => {
    expect(
      publicLinkState({ ...base, participantCount: 10, pendingRequestCount: 2 }),
    ).toBe('complet');
  });

  it('la fermeture manuelle prime sur la capacité disponible', () => {
    expect(
      publicLinkState({ ...base, publicFormClosedAt: new Date(), participantCount: 0 }),
    ).toBe('ferme');
  });
});

describe('buildPublicEnrollmentUrl', () => {
  it('compose une URL absolue sans double slash', () => {
    expect(buildPublicEnrollmentUrl('abc', 'https://qualiof.vercel.app/')).toBe(
      'https://qualiof.vercel.app/inscription/abc',
    );
  });
});
