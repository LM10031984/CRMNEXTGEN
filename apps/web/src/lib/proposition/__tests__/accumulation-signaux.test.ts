/**
 * Le lost update des rattachements — le jumeau de `drive:020`.
 *
 * `ecrire-rattachements.ts` lisait l'état d'un module pendant la phase de
 * DÉCISION, puis écrivait `[...signalsAvant, signal]` dans la transaction.
 * Trois modules sont visés par deux douleurs (`drive:008#1`, `drive:034#2`,
 * `drive:034#3`) : leurs deux écritures partaient du même état, et la seconde
 * écrasait la première. Un passage posait 9 signaux sur 12.
 *
 * Ce que ces tests protègent : **un seul passage suffit**. Un chemin qui demande
 * deux passages sera lancé une fois.
 */
import { describe, expect, it } from 'vitest';

import { accumulerSignaux } from '../accumulation-signaux';

const cle = (s: string) => s.trim().toLowerCase();

describe('accumulerSignaux — deux douleurs sur un module, un seul passage', () => {
  it('ACCUMULE les deux signaux au lieu que le second écrase le premier', () => {
    // Le cas exact de `drive:034#2` : « offres → compromis » et « compromis →
    // acte » visent le même module avec deux signaux différents.
    const { aAjouter } = accumulerSignaux([], ['signal A', 'signal B'], cle);
    expect(aAjouter).toEqual(['signal A', 'signal B']);
  });

  it('conserve ce que le module portait déjà', () => {
    // Le catalogue diagnostic en a posé 43 le 10/09 : les écraser reviendrait à
    // défaire l'import du lot A pour installer le nôtre.
    const actuels = ['signal du 10/09'];
    const { aAjouter } = accumulerSignaux(actuels, ['signal neuf'], cle);
    expect([...actuels, ...aAjouter]).toEqual(['signal du 10/09', 'signal neuf']);
  });

  it("n'ajoute rien au second passage — idempotent", () => {
    const { aAjouter, dejaPresents } = accumulerSignaux(['A', 'B'], ['A', 'B'], cle);
    expect(aAjouter).toEqual([]);
    expect(dejaPresents).toBe(2);
  });

  it('dédoublonne DANS le lot, pas seulement contre la base', () => {
    // Deux décisions portant le même signal sur le même module. Sans ce
    // dédoublonnage-là, le module porterait deux fois la même phrase.
    const { aAjouter, dejaPresents } = accumulerSignaux([], ['même', 'même'], cle);
    expect(aAjouter).toEqual(['même']);
    expect(dejaPresents).toBe(1);
  });

  it('compare par la CLÉ, pas au caractère près', () => {
    // Un signal est une phrase : elle revient avec une espace en trop ou une
    // capitale sans être un autre signal.
    expect(accumulerSignaux(['Le Signal'], ['  le signal  '], cle).aAjouter).toEqual([]);
  });

  it('le lot complet du 17/09 : 12 signaux sur 9 modules, en UN passage', () => {
    // La forme réelle : 3 modules portent 2 douleurs, 6 en portent 1.
    const modules: Record<string, string[]> = {
      'drive:006#1': ['s1'],
      'drive:008#1': ['s2', 's3'],
      'drive:012#2': ['s4'],
      'drive:017#1': ['s5'],
      'drive:017#3': ['s6'],
      'drive:034#2': ['s7', 's8'],
      'drive:034#3': ['s9', 's10'],
      'drive:037#2': ['s11'],
      'drive:047#20': ['s12'],
    };
    const poses = Object.values(modules).reduce(
      (n, voulus) => n + accumulerSignaux([], voulus, cle).aAjouter.length,
      0,
    );
    expect(poses, 'un seul passage doit poser les 12').toBe(12);
  });
});
