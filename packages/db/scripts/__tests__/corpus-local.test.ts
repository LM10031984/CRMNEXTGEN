/**
 * Le CORPUS LOCAL — trouver la matière là où elle est VRAIMENT.
 *
 * ## Ce qui a rendu ce helper nécessaire (11/09/2026)
 *
 * Le motif dangereux n'est pas « le chemin n'existe plus » — ça, on le voit tout
 * de suite. C'est **« le chemin existe encore et ne porte plus rien »** :
 * `existsSync` réussit, `readdirSync` rend zéro paquet, et le script travaille sur
 * du vide en annonçant un succès.
 *
 * C'est arrivé : le corpus Faros a suivi le dépôt hors d'iCloud vers
 * `~/Projects`, et iCloud a laissé sur place un dossier VIDE plus un sosie
 * « Formation Faros 2 ». L'extraction a perdu `faros:SA-ADM-M001` et
 * `faros:SA-ACQ-M003` **sans un mot** — dont celui que le plan du lot 1 exigeait
 * de voir sortir intact.
 *
 * Ces tests ne touchent PAS le disque : le lecteur est injecté. C'est ce qui
 * permet de décrire un dossier existant mais vide, ou illisible, sans fabriquer
 * d'arborescence.
 */

import { describe, it, expect } from 'vitest';

import { premierEmplacementPorteur, candidatsNxtCoach } from '../lib/corpus-local.js';

/** Le prédicat réel de l'extraction Faros, en plus court. */
const PORTE_UN_PAQUET = (entrees: readonly string[]) => entrees.some((e) => /^M\d_/.test(e));

describe('premierEmplacementPorteur', () => {
  it('rend le premier candidat qui PORTE la matière, pas le premier qui existe', () => {
    // Exactement le fantôme iCloud : /vide existe (il rend un tableau), mais il ne
    // porte rien. Le second doit gagner.
    const lire = (dir: string) => (dir === '/vide' ? [] : ['M0_SOCLE_IA', 'M1_TROUVER']);
    expect(premierEmplacementPorteur(['/vide', '/plein'], PORTE_UN_PAQUET, lire)).toBe('/plein');
  });

  it('rend null quand aucun candidat ne porte rien — c’est à l’appelant de le dire', () => {
    const lire = () => ['README.md'];
    expect(premierEmplacementPorteur(['/a', '/b'], PORTE_UN_PAQUET, lire)).toBeNull();
  });

  it('saute un dossier absent (lecteur qui rend null) sans lever', () => {
    const lire = (dir: string) => (dir === '/absent' ? null : ['M3_COMMERCIALISER']);
    expect(premierEmplacementPorteur(['/absent', '/plein'], PORTE_UN_PAQUET, lire)).toBe('/plein');
  });

  it('saute un dossier ILLISIBLE (permission) sans lever', () => {
    const lire = (dir: string) => {
      if (dir === '/interdit') throw new Error('EACCES');
      return ['M6_ACHETEUR_PILOTAGE'];
    };
    expect(premierEmplacementPorteur(['/interdit', '/plein'], PORTE_UN_PAQUET, lire)).toBe('/plein');
  });

  it('respecte l’ORDRE des candidats quand les deux portent', () => {
    const lire = () => ['M0_SOCLE_IA'];
    expect(premierEmplacementPorteur(['/premier', '/second'], PORTE_UN_PAQUET, lire)).toBe(
      '/premier',
    );
  });

  it('rend null sur une liste de candidats vide', () => {
    expect(premierEmplacementPorteur([], PORTE_UN_PAQUET, () => ['M0_X'])).toBeNull();
  });
});

describe('candidatsNxtCoach', () => {
  it('rend exactement deux emplacements, ~/Projects AVANT ~/Documents', () => {
    const c = candidatsNxtCoach();
    expect(c).toHaveLength(2);
    expect(c[0]).toMatch(/\/Projects\/nxt-coach\/Formation Faros$/);
    expect(c[1]).toMatch(/\/Documents\/nxt-coach\/Formation Faros$/);
  });

  it('suffixe les deux candidats du sous-chemin demandé', () => {
    const c = candidatsNxtCoach('LIVRAISON_PARCOURS');
    expect(c).toHaveLength(2);
    expect(c[0]).toMatch(/\/Projects\/nxt-coach\/Formation Faros\/LIVRAISON_PARCOURS$/);
    expect(c[1]).toMatch(/\/Documents\/nxt-coach\/Formation Faros\/LIVRAISON_PARCOURS$/);
  });

  it('rend des chemins ABSOLUS', () => {
    for (const c of candidatsNxtCoach('LIVRAISON_PARCOURS')) {
      expect(c.startsWith('/')).toBe(true);
    }
  });
});
