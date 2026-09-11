import { describe, it, expect } from 'vitest';
import { estJoignable, filtrerJoignables, EQUIPE_JOIGNABLE } from '../destinataires';

/**
 * Qui peut recevoir une alerte interne.
 *
 * PROBLÈME RÉSOLU (11/09/2026) : `equipe()` renvoyait TOUS les `User` du
 * tenant, sans filtre. Or deux d'entre eux n'ont pas de boîte —
 * `e2e@start-academy.fr`, le compte dont Playwright a besoin, et
 * `admin@startacademy.fr`, un compte historique. Chaque alerte A-2 produisait
 * donc deux bounces sur `formation@`, la boîte expéditrice. Une alerte qui
 * salit la boîte qu'elle est censée servir finit par être ignorée — et les
 * bounces répétés abîment la réputation d'envoi du domaine.
 *
 * Deux motifs d'exclusion, distincts à dessein :
 *  - `disabledAt` — le compte a été désactivé, il ne doit plus rien recevoir ;
 *  - `isServiceAccount` — le compte existe pour une machine. Il doit rester
 *    ACTIF (Playwright s'y connecte) mais ne jamais être écrit.
 *
 * Test de puissance : retirer `isServiceAccount` du prédicat fait virer ROUGE
 * « écarte un compte de service resté actif ».
 */

const ADMIN = {
  id: 'u-1',
  role: 'ADMIN',
  email: 'laurent@start-academy.fr',
  disabledAt: null,
  isServiceAccount: false,
};
const E2E = {
  id: 'u-e2e',
  role: 'ADMIN',
  email: 'e2e@start-academy.fr',
  disabledAt: null,
  isServiceAccount: true,
};
const DESACTIVE = {
  id: 'u-old',
  role: 'ADMIN',
  email: 'admin@startacademy.fr',
  disabledAt: new Date('2026-09-11'),
  isServiceAccount: false,
};

describe('estJoignable', () => {
  it('accepte un compte humain actif', () => {
    expect(estJoignable(ADMIN)).toBe(true);
  });

  it('écarte un compte de service resté actif — Playwright en a besoin, pas d’email', () => {
    expect(estJoignable(E2E)).toBe(false);
  });

  it('écarte un compte désactivé', () => {
    expect(estJoignable(DESACTIVE)).toBe(false);
  });

  it('écarte un compte sans adresse', () => {
    expect(estJoignable({ ...ADMIN, email: null })).toBe(false);
    expect(estJoignable({ ...ADMIN, email: '   ' })).toBe(false);
  });

  it('tolère un enregistrement sans les champs (lecture partielle)', () => {
    expect(estJoignable({ id: 'u', role: 'ADMIN', email: 'x@y.fr' })).toBe(true);
  });
});

describe('filtrerJoignables', () => {
  it('ne garde que les humains actifs, dans l’ordre reçu', () => {
    expect(filtrerJoignables([ADMIN, E2E, DESACTIVE]).map((u) => u.id)).toEqual(['u-1']);
  });

  it('rend une liste vide sans planter', () => {
    expect(filtrerJoignables([])).toEqual([]);
  });
});

describe('EQUIPE_JOIGNABLE', () => {
  it('exprime les deux mêmes exclusions côté base', () => {
    // Le filtre Prisma et le prédicat doivent décrire la même population : si
    // l'un gagne un motif d'exclusion, l'autre doit suivre.
    expect(EQUIPE_JOIGNABLE).toEqual({ disabledAt: null, isServiceAccount: false });
  });
});
