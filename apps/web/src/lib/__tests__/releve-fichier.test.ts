/**
 * GARDE — un relevé porte la date de SON run, et ne s'écrase jamais.
 *
 * ## Ce qui a rendu ce test nécessaire (16/09/2026)
 *
 * `propose-rattachement.ts` écrivait son rapport à un chemin en DUR :
 * `.planning/260911-rattachement-douleur-module.md`. Le relancer un autre jour
 * aurait réécrit, sous un nom annonçant le 11/09, le contenu d'un autre jour —
 * et écrasé au passage le rendu des arbitrages de Laurent.
 *
 * C'est §4 quater porté au niveau du FICHIER : un relevé porte sa date, et un
 * générateur qui la lui retire fabrique un document qui ment sur lui-même.
 *
 * ## Pourquoi une fonction pure, et pas un `writeFileSync` mieux écrit
 *
 * La décision « quel chemin » se teste ; l'écriture, non. `existe` est injecté
 * pour que le cas « le fichier du jour est déjà là » soit exerçable sans
 * toucher au disque — c'est justement le cas qui compte.
 */
import { describe, expect, it } from 'vitest';

import { cheminReleve } from '../releve-fichier';

const BASE = 'rattachement-douleur-module';
const LE_16 = new Date(2026, 8, 16, 14, 30); // 16/09/2026, heure locale

describe('cheminReleve', () => {
  it('porte la date du RUN, pas une date figée', () => {
    const chemin = cheminReleve({
      dossier: '.planning',
      base: BASE,
      maintenant: LE_16,
      existe: () => false,
    });
    expect(chemin).toBe('.planning/260916-rattachement-douleur-module.md');
  });

  it('date en heure LOCALE — un run du soir ne bascule pas au lendemain', () => {
    // 23 h 30 à Paris le 16/09 = 21 h 30 UTC le 16 ; mais un run à 01 h 30 le 17
    // vaut 23 h 30 UTC le 16, et `toISOString()` l'aurait daté du 16.
    const tardif = new Date(2026, 8, 17, 1, 30);
    expect(
      cheminReleve({ dossier: '.planning', base: BASE, maintenant: tardif, existe: () => false }),
    ).toBe('.planning/260917-rattachement-douleur-module.md');
  });

  it("n'écrase pas un relevé du même jour : il s'ajoute", () => {
    const pris = new Set(['.planning/260916-rattachement-douleur-module.md']);
    expect(
      cheminReleve({ dossier: '.planning', base: BASE, maintenant: LE_16, existe: (p) => pris.has(p) }),
    ).toBe('.planning/260916-rattachement-douleur-module-2.md');
  });

  it('continue de compter tant que le nom est pris', () => {
    const pris = new Set([
      '.planning/260916-rattachement-douleur-module.md',
      '.planning/260916-rattachement-douleur-module-2.md',
      '.planning/260916-rattachement-douleur-module-3.md',
    ]);
    expect(
      cheminReleve({ dossier: '.planning', base: BASE, maintenant: LE_16, existe: (p) => pris.has(p) }),
    ).toBe('.planning/260916-rattachement-douleur-module-4.md');
  });

  it("refuse plutôt que de boucler quand tout est pris — et le dit", () => {
    expect(() =>
      cheminReleve({ dossier: '.planning', base: BASE, maintenant: LE_16, existe: () => true }),
    ).toThrow(/260916-rattachement-douleur-module/);
  });
});
