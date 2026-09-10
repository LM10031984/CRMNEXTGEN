import { describe, expect, it } from 'vitest';

import { capitaleInitiale, jourCourt, jourLong, jourLongAvecAnnee } from '../dates-fr';

/**
 * Le français ne met de majuscule ni aux jours ni aux mois. La classe Tailwind
 * `capitalize` en mettait à CHAQUE mot — « Jeudi 8 Octobre 2026 » — parce
 * qu'elle applique `text-transform: capitalize`, qui ne connaît pas la notion
 * de première lettre de phrase. D'où ce module : le formatage se décide dans le
 * code, pas dans une classe CSS qui ne sait pas ce qu'elle transforme.
 */
const JEUDI = new Date('2026-10-08T09:00:00+02:00');

describe('jourLongAvecAnnee — la forme longue', () => {
  it('écrit le jour et le mois en minuscules', () => {
    expect(jourLongAvecAnnee(JEUDI)).toBe('jeudi 8 octobre 2026');
  });

  it('ne coupe pas les mois accentués', () => {
    expect(jourLongAvecAnnee(new Date('2026-12-24T09:00:00+01:00'))).toBe('jeudi 24 décembre 2026');
  });

  it('lit la date dans le fuseau de l’organisme, pas dans celui du serveur', () => {
    // 22:30 UTC un 7 octobre, c'est déjà le 8 à Paris. Un rendu serveur en UTC
    // annoncerait la veille.
    expect(jourLongAvecAnnee(new Date('2026-10-07T22:30:00Z'))).toBe('jeudi 8 octobre 2026');
  });
});

describe('jourLong et jourCourt', () => {
  it('jourLong omet l’année — pour les listes où elle est déjà connue', () => {
    expect(jourLong(JEUDI)).toBe('jeudi 8 octobre');
  });

  it('jourCourt reste numérique', () => {
    expect(jourCourt(JEUDI)).toBe('08/10/2026');
  });
});

describe('capitaleInitiale — quand une phrase commence par la date', () => {
  it('ne touche QUE la première lettre', () => {
    expect(capitaleInitiale('jeudi 8 octobre 2026')).toBe('Jeudi 8 octobre 2026');
  });

  it('laisse le reste intact, accents compris', () => {
    expect(capitaleInitiale('jeudi 24 décembre 2026')).toBe('Jeudi 24 décembre 2026');
  });

  it('ne casse pas sur une chaîne vide', () => {
    expect(capitaleInitiale('')).toBe('');
  });
});
