import { describe, it, expect } from 'vitest';
import {
  campagneLinkState,
  defaultMaxUses,
  buildCampagneUrl,
  CAMPAGNE_LINK_MESSAGE,
} from '../lien';

const DEMAIN = new Date('2026-09-11T10:00:00Z');
const MAINTENANT = new Date('2026-09-10T10:00:00Z');

function lien(over: Partial<Parameters<typeof campagneLinkState>[0]> = {}) {
  return {
    status: 'OUVERTE',
    expiresAt: DEMAIN,
    maxUses: 10,
    usedCount: 0,
    ...over,
  };
}

describe('l’état d’un lien de campagne', () => {
  it('ouvre quand rien ne s’y oppose', () => {
    expect(campagneLinkState(lien(), MAINTENANT)).toBe('ouverte');
  });

  it('se ferme à l’expiration, à la seconde près', () => {
    expect(campagneLinkState(lien({ expiresAt: MAINTENANT }), MAINTENANT)).toBe('expiree');
    expect(
      campagneLinkState(lien({ expiresAt: new Date(MAINTENANT.getTime() + 1) }), MAINTENANT),
    ).toBe('ouverte');
  });

  it('se ferme au quota', () => {
    expect(campagneLinkState(lien({ maxUses: 3, usedCount: 3 }), MAINTENANT)).toBe('quota-atteint');
    expect(campagneLinkState(lien({ maxUses: 3, usedCount: 2 }), MAINTENANT)).toBe('ouverte');
  });

  it('sans quota, ne se ferme que par date ou révocation', () => {
    expect(campagneLinkState(lien({ maxUses: null, usedCount: 9999 }), MAINTENANT)).toBe('ouverte');
  });

  // Le cœur de la règle : une révocation est définitive. Si le quota ou
  // l'expiration l'emportaient, relever le quota rouvrirait un lien qu'on a
  // explicitement coupé — et « annuler » ne voudrait plus rien dire.
  it('une révocation l’emporte sur tout le reste', () => {
    const revoque = lien({
      status: 'ANNULEE',
      expiresAt: new Date('2020-01-01'),
      maxUses: 1,
      usedCount: 99,
    });
    expect(campagneLinkState(revoque, MAINTENANT)).toBe('annulee');
  });

  it('une clôture l’emporte sur l’expiration et le quota', () => {
    const close = lien({ status: 'CLOTUREE', expiresAt: new Date('2020-01-01'), usedCount: 99 });
    expect(campagneLinkState(close, MAINTENANT)).toBe('cloturee');
  });

  it('chaque état fermé a un message pour le participant', () => {
    for (const etat of ['expiree', 'annulee', 'cloturee', 'quota-atteint'] as const) {
      expect(CAMPAGNE_LINK_MESSAGE[etat]).toBeTruthy();
      // Aucun motif technique ne doit fuiter vers le participant.
      expect(CAMPAGNE_LINK_MESSAGE[etat]).not.toMatch(/token|quota atteint en base|status/i);
    }
  });
});

describe('le quota par défaut', () => {
  it('laisse trois tentatives par participant attendu', () => {
    expect(defaultMaxUses(4)).toBe(12);
  });

  // Un effectif à 0 (ou saisi de travers) ne doit pas produire un lien
  // immédiatement fermé : ce serait un lien qu'on diffuse et qui ne marche pas.
  it('ne produit jamais un lien mort', () => {
    expect(defaultMaxUses(0)).toBe(3);
    expect(defaultMaxUses(-5)).toBe(3);
  });
});

describe('l’URL du lien', () => {
  it('ne double jamais la barre oblique', () => {
    expect(buildCampagneUrl('abc', 'https://qualiof.app/')).toBe('https://qualiof.app/rdv/abc');
    expect(buildCampagneUrl('abc', 'https://qualiof.app')).toBe('https://qualiof.app/rdv/abc');
  });
});
