/**
 * « Au 10 septembre, où devrais-je en être ? »
 *
 * Le pilotage comparait le réalisé YTD à l'objectif ANNUEL : 55 % au 10/09 ne
 * dit pas si on est en avance ou en retard. Ces tests tiennent la conversion
 * d'un objectif annuel en objectif À DATE, saisonnalité comprise.
 */

import { describe, it, expect } from 'vitest';
import {
  objectifADate,
  partAnnuelleEcoulee,
  pctObjectifADate,
  projectionAuRythme,
  saisonnaliteFiable,
  repartitionUtilisee,
} from '../objectif-rythme';

/** 12 000 € répartis uniformément : 1 000 € par mois. */
const UNIFORME = Array(12).fill(1000);

describe('objectifADate', () => {
  it('cumule les mois révolus et proratise le mois en cours', () => {
    // 15 avril : janvier→mars révolus (3 000 €) + 14/30 d'avril.
    const attendu = 3000 + Math.round(1000 * (14 / 30));
    expect(objectifADate(UNIFORME, new Date(Date.UTC(2026, 3, 15)))).toBe(attendu);
  });

  it('vaut zéro au tout premier instant de l’année', () => {
    expect(objectifADate(UNIFORME, new Date(Date.UTC(2026, 0, 1)))).toBe(0);
  });

  it('vaut l’objectif entier au 31 décembre', () => {
    // 30/31 de décembre écoulés au 31 à 0 h : on ne réclame pas le dernier jour.
    const attendu = 11000 + Math.round(1000 * (30 / 31));
    expect(objectifADate(UNIFORME, new Date(Date.UTC(2026, 11, 31)))).toBe(attendu);
  });

  it('suit la saisonnalité, pas le calendrier : un mois creux pèse moins', () => {
    // Tout le CA sur décembre : au 30 juin, rien n'est encore dû.
    const saisonnier = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12000];
    expect(objectifADate(saisonnier, new Date(Date.UTC(2026, 5, 30)))).toBe(0);
  });

  it('rend zéro quand aucun objectif n’est saisi', () => {
    expect(objectifADate(Array(12).fill(0), new Date(Date.UTC(2026, 8, 10)))).toBe(0);
  });
});

describe('partAnnuelleEcoulee', () => {
  it('est la fraction de l’objectif annuel déjà due', () => {
    expect(partAnnuelleEcoulee(UNIFORME, new Date(Date.UTC(2026, 6, 1)))).toBeCloseTo(0.5, 5);
  });

  it('rend null sans objectif — on ne divise pas par zéro', () => {
    expect(partAnnuelleEcoulee(Array(12).fill(0), new Date(Date.UTC(2026, 6, 1)))).toBeNull();
  });
});

describe('pctObjectifADate', () => {
  it('dit « en avance » au-dessus de 100', () => {
    expect(pctObjectifADate(120000, 100000)).toBe(120);
  });

  it('rend null quand rien n’est encore dû — pas 0 %, qui se lirait « en retard »', () => {
    expect(pctObjectifADate(50000, 0)).toBeNull();
  });
});

describe('projectionAuRythme', () => {
  it('extrapole le rythme constaté sur l’année entière', () => {
    // 100 k€ réalisés alors que 40 % de l'année est due → 250 k€ au même rythme.
    expect(projectionAuRythme(100000, 0.4)).toBe(250000);
  });

  it('rend null en début d’année : extrapoler sur trois jours ne veut rien dire', () => {
    expect(projectionAuRythme(5000, 0)).toBeNull();
    expect(projectionAuRythme(5000, null)).toBeNull();
  });
});

describe('saisonnalité mince', () => {
  /** Constaté le 10/09/2026 : 5 mois à zéro, dont janvier→avril. */
  const MINCE = [0, 0, 0, 0, 18000, 33000, 0, 34000, 53000, 88000, 63000, 61000];

  it('refuse une répartition qui laisse plus de quatre mois à zéro', () => {
    expect(saisonnaliteFiable(MINCE)).toBe(false);
    expect(saisonnaliteFiable(Array(12).fill(1000))).toBe(true);
  });

  it('retombe alors sur l’uniforme, sans perdre un euro de l’objectif', () => {
    const { mensuel, source } = repartitionUtilisee(MINCE, 350000);
    expect(source).toBe('uniforme');
    expect(mensuel.reduce((a, b) => a + b, 0)).toBe(350000);
  });

  it('garde la saisonnalité quand elle est fournie', () => {
    const fournie = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10].map((x) => x * 100);
    expect(repartitionUtilisee(fournie, 12000).source).toBe('saisonnalite');
  });

  it('empêche la projection délirante qui a motivé ce garde-fou', () => {
    // Avec la saisonnalité mince : 29 % de l'année due au 10/09 → 548 k€.
    // Avec l'uniforme : 69 % → une projection cohérente avec le carnet (221 k€).
    const au10sept = new Date(Date.UTC(2026, 8, 10));
    const partMince = partAnnuelleEcoulee(MINCE, au10sept)!;
    const { mensuel } = repartitionUtilisee(MINCE, 350000);
    const partUniforme = partAnnuelleEcoulee(mensuel, au10sept)!;
    expect(projectionAuRythme(158478, partMince)).toBeGreaterThan(500000);
    expect(projectionAuRythme(158478, partUniforme)).toBeLessThan(250000);
  });
});
