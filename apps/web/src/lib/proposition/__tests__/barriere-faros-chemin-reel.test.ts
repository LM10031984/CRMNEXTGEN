/**
 * ⛔ LA BARRIÈRE FAROS, SUR LE CHEMIN RÉEL DE L'IMPORT — et elle est VERTE.
 *
 * Arbitrage de Laurent du 16/09/2026 : *aucun contenu Faros n'est importé au
 * catalogue, ni la capsule, ni le groupe de lettres.* Porté dans le code le
 * 17/09.
 *
 * ## Pourquoi ce fichier existe séparément
 *
 * La barrière tenait dans `faros-non-importable.test.ts`, par une lecture du
 * TEXTE SOURCE de l'importeur (`/origin === 'faros'/.test(src)`) : elle le
 * décrivait sans jamais l'empêcher de rien. Une garde qui vit dans un test que
 * le chemin réel ne consulte pas n'est pas une garde (§4 ter) — c'est un
 * commentaire avec une assertion autour.
 *
 * `sortDuRayon` est désormais la MÊME fonction des deux côtés : celle que ce
 * test appelle, et celle que `import-drive-catalog.ts` appelle avant d'écrire.
 * Si elle change, les deux changent ensemble.
 *
 * ## Ce qui N'EST PAS ici, et où c'est
 *
 * Les trois conditions de LEVÉE de la barrière — un champ de modalité sur
 * `TrainingModule`, un import qui cesse de déclarer `PRESENTIEL` par défaut, un
 * filtre de composition qui lit l'origine — sont tenues par trois assertions
 * volontairement ROUGES. Elles ne peuvent pas vivre dans une branche qui doit
 * passer la CI : elles vivent dans une **PR ouverte qui ne se fusionne pas**,
 * et qui EST la décision, visible.
 *
 * Ce fichier-ci protège ce qui est FAIT. L'autre tient ce qui reste à faire.
 *
 * ## La raison du refus, et ce qu'elle n'est pas
 *
 * `SA-ACQ-M003` et `SA-ADM-M001` déclarent « G3 prêt à produire » en v1.0 — ce
 * sont les deux seuls du corpus dans ce cas. Ils ne sont pas écartés pour la
 * qualité de leur contenu, mais parce que ce sont des capsules ASYNCHRONES et
 * que l'import ne sait poser qu'une modalité, `PRESENTIEL`, en dur. Les verser
 * écrirait une fausse modalité sur une pièce Qualiopi, en production.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MOTIF_FAROS, sortDuRayon } from '@qualiof/db/barriere-faros';

const RACINE = path.resolve(__dirname, '../../../..', '..', '..');
const IMPORT_DRIVE = path.join(RACINE, 'packages/db/scripts/import-drive-catalog.ts');

/**
 * ### ④ — VERTE, et c'est la seule du fichier
 *
 * Les trois autres tiennent une décision en attendant qu'un travail soit
 * fait. Celle-ci vérifie qu'un travail EST fait : le 17/09/2026, l'exclusion
 * Faros est passée du test au **chemin réel** de l'importeur.
 *
 * Avant, la barrière était une lecture de texte source
 * (`/origin === 'faros'/.test(src)`) : elle décrivait l'importeur sans jamais
 * l'empêcher de rien. Une garde qui vit dans un test que le chemin réel ne
 * consulte pas n'est pas une garde (§4 ter) — c'est un commentaire avec une
 * assertion autour.
 *
 * `sortDuRayon` est maintenant la MÊME fonction des deux côtés : celle que ce
 * test appelle, et celle que `import-drive-catalog.ts` appelle avant d'écrire.
 * Si elle change, les deux changent ensemble.
 */
describe('④ la barrière vit sur le chemin réel de l’import', () => {
  it('refuse un rayon faros, quel que soit son contenu', () => {
    // Riche en modules, et refusé quand même : le motif ne regarde pas ce que
    // le dossier contient, il regarde ce que l'import sait écrire.
    const sort = sortDuRayon({ origin: 'faros', modules: [{}, {}, {}] });
    expect(sort.importable).toBe(false);
    expect(sort.importable === false && sort.motif).toBe(MOTIF_FAROS);
  });

  it('laisse passer un rayon Drive qui porte des modules', () => {
    // La barrière doit refuser Faros, pas tout arrêter : un refus qui refuse
    // tout ne prouve rien.
    expect(sortDuRayon({ origin: 'drive', modules: [{}] }).importable).toBe(true);
  });

  it('écarte un rayon sans module, avec son propre motif', () => {
    const sort = sortDuRayon({ origin: 'drive', modules: [] });
    expect(sort.importable).toBe(false);
    expect(sort.importable === false && sort.motif).not.toBe(MOTIF_FAROS);
  });

  it("l'importeur consulte CETTE fonction avant d'écrire", () => {
    // Le maillon que le comportement seul ne peut pas prouver : que
    // l'importeur passe bien par ici. Sans lui, les trois tests ci-dessus
    // décriraient une fonction que personne n'appelle.
    const src = fs.readFileSync(IMPORT_DRIVE, 'utf8');
    expect(src, "l'importeur n'importe plus la barrière").toMatch(
      /import \{[^}]*sortDuRayon[^}]*\} from '\.\/lib\/barriere-faros\.js'/,
    );
    expect(src, "l'importeur n'appelle plus `sortDuRayon`").toMatch(/sortDuRayon\(p\)/);
    expect(
      src,
      "l'importeur ne s'arrête plus sur un rayon écarté — il faut un `continue` " +
        'AVANT toute écriture, pas seulement une note dans le rapport.',
    ).toMatch(/if \(!sort\.importable\) \{[\s\S]*?continue;/);
  });
});
