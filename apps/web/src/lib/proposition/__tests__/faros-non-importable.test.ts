/**
 * ⛔ BARRIÈRE — aucune unité `faros:` n'entre au composeur sans modalité explicite.
 *
 * ## CE TEST EST ROUGE, ET C'EST VOULU. NE LE SUPPRIMEZ PAS.
 *
 * Il ne signale pas une régression : il tient une **décision de Laurent du
 * 16/09/2026** — *aucun contenu Faros n'est importé au catalogue, ni la capsule,
 * ni le groupe de lettres*. Il redeviendra vert le jour où quelqu'un aura fait le
 * travail qu'il décrit, et pas avant. Le rendre vert autrement, c'est verser au
 * catalogue un parcours qui se déclare lui-même non diffusable.
 *
 * Pour le lever, il faut les DEUX :
 *   ① `TrainingModule` porte une modalité explicite (le champ n'existe pas) ;
 *   ② les produits `faros:` cessent de déclarer `PRESENTIEL` par défaut.
 *
 * ## Ce que le corpus dit de lui-même (relevé du 16/09, 538 Mo, lecture seule)
 *
 * - `AGENT-INCOMPARABLE…/LIVRAISON_PARCOURS`, v0.9 : « **NE PAS DIFFUSER AUX
 *   APPRENANTS** — relecture et levée des ⚠️ requises » ;
 * - `TOURNAGE-PAR-MODULE` : un pack **de tournage**, « à tourner » ;
 * - **zéro fichier vidéo** dans les 538 Mo (`*.mp4`, `*.mov`, `*.m4v`, `*.avi`).
 *
 * Une capsule dure 5 à 15 minutes et se regarde seule ; une unité QualiOF se vend
 * en demi-journées co-animées sur site. Les mettre dans le même sac ferait sortir
 * un programme annonçant à un financeur des heures qui n'ont pas été tournées —
 * la pire instance de §4 quinquies : *une absence rendue par une affirmation
 * positive*.
 *
 * ## Le défaut de modalité : RÉEL et LATENT — corrigé en portée le 16/09 (soir)
 *
 * Les deux produits `faros:` déclarent `modality = PRESENTIEL`. Personne ne l'a
 * décidé : `import-drive-catalog.ts` le pose en dur pour TOUS les produits — et
 * la ligne SUIVANTE branche sur `p.origin === 'faros'` pour choisir le thème.
 * L'importeur sait que c'est Faros ; il ne le sait pas pour la modalité.
 *
 * **Mais AUCUNE pièce ne le lit aujourd'hui, et ce test l'a d'abord surévalué.**
 * Relevé des lectures : le programme, la convention, la convocation, les factures
 * et les deux générateurs AGEFICE lisent tous `session.modality`.
 * `product.modality` n'est lu qu'à TROIS endroits — deux badges d'admin
 * (`app/produits/page.tsx:231`, `app/produits/[id]/page.tsx:187`) et
 * `/catalogue` (`app/catalogue/page.tsx:300`), qui filtre `isActive: true`
 * alors que l'import pose `isActive: false`.
 *
 * Zéro pièce atteinte. Le défaut est une **mine**, pas un incendie : il
 * s'allumerait le jour où un produit `faros:` serait activé, ou le jour où une
 * pièce se mettrait à lire la modalité du produit. **Un garde qui annonce plus
 * que ce qu'il constate finit débranché** (§4 quaterdecies) — d'où ce cadrage.
 *
 * Et leurs deux modules sont **animables aujourd'hui** (`isAnimable` = true,
 * 55 434 et 6 887 caractères) — vérifié en lecture seule sur `qualiof_dev` le
 * 16/09/2026. Rien ne les empêche d'entrer dans un parcours composé.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MOTIF_FAROS, sortDuRayon } from '@qualiof/db/barriere-faros';

import { isAnimable } from '../module-matcher';

const RACINE = path.resolve(__dirname, '../../../..', '..', '..');
const SCHEMA = path.join(RACINE, 'packages/db/prisma/schema.prisma');
const IMPORT_DRIVE = path.join(RACINE, 'packages/db/scripts/import-drive-catalog.ts');

/** Le bloc `model TrainingModule { … }` du schéma, lu au FICHIER. */
function modelTrainingModule(): string {
  const s = fs.readFileSync(SCHEMA, 'utf8');
  const m = /model TrainingModule \{([\s\S]*?)\n\}/.exec(s);
  expect(m, 'model TrainingModule introuvable dans schema.prisma').not.toBeNull();
  return m![1]!;
}

describe('⛔ Faros ne peut pas entrer au composeur', () => {
  it('① TrainingModule porte une modalité explicite', () => {
    // `TrainingProduct` et `TrainingSession` ont `modality: Modality`. Le MODULE,
    // qui est l'unité recommandable depuis le lot I-1, n'a rien : seulement
    // quatre compteurs d'heures nullables, tous nuls sur les unités faros.
    expect(
      modelTrainingModule(),
      "Le champ n'existe pas — donc aucune unité `faros:` ne peut déclarer " +
        "qu'elle est du distanciel asynchrone, et aucune ne doit être animable. " +
        'Cette barrière se lève en créant le champ, pas en supprimant le test.',
    ).toMatch(/^\s*modalit[ey]\s/m);
  });

  /**
   * ### Corrigé en portée le 17/09/2026 — ce test dit toujours vrai, autrement
   *
   * Il disait : « `import-drive-catalog.ts` stampe `Modality.PRESENTIEL` sur
   * TOUS les produits, et distingue pourtant `origin === 'faros'` à la ligne
   * suivante pour le thème. » C'était exact, et ça l'est encore de la ligne de
   * code — mais **plus aucun produit `faros:` n'atteint cette ligne** depuis que
   * la barrière est posée sur le chemin réel (④).
   *
   * Le test reste donc ROUGE, et c'est juste : la condition ② n'est pas
   * « aucun produit faros n'est écrit », c'est « l'import sait écrire une
   * modalité ». Tant qu'il ne sait pas, importer du Faros reste impossible —
   * l'exclusion est un contournement de ce défaut, pas sa réparation.
   *
   * **Pourquoi la phrase d'origine est citée et non effacée** : un test qui
   * réécrit son propre motif en silence devient un test dont personne ne sait
   * plus ce qu'il gardait (`quick.md` §4 sexdecies).
   */
  it("② l'import ne pose pas une modalité en dur sur un produit faros", () => {
    const src = fs.readFileSync(IMPORT_DRIVE, 'utf8');
    const enDur = /modality:\s*Modality\.PRESENTIEL/.test(src);
    const saitQueCestFaros = /origin === 'faros'/.test(src);
    expect(
      enDur && saitQueCestFaros,
      '`import-drive-catalog.ts` stampe `Modality.PRESENTIEL` sur TOUS les ' +
        "produits, et distingue pourtant `origin === 'faros'` à la ligne " +
        'suivante pour le thème. Un parcours filmé, non tourné, déclaré ' +
        'présentiel est une valeur que personne n’a affirmée (§4 quinquies).\n' +
        'PORTÉE — aucune pièce n’est atteinte AUJOURD’HUI : programme, ' +
        'convention, convocation, factures et AGEFICE lisent tous ' +
        '`session.modality`. `product.modality` n’est lu que par deux badges ' +
        'd’admin et /catalogue, qui filtre `isActive: true` quand l’import pose ' +
        '`isActive: false`. Le défaut est LATENT : il s’allume à la première ' +
        'activation d’un produit faros, ou à la première pièce qui lira la ' +
        'modalité du produit. C’est une mine, pas un incendie.',
    ).toBe(false);
  });

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

  it('③ une unité faros: est refusée par le filtre du composeur', () => {
    // `isAnimable` ne regarde que le déroulé. Les deux modules faros en ont un
    // (55 434 et 6 887 car.) : ils passent. Le filtre doit apprendre à lire
    // l'origine, ou la modalité quand elle existera.
    const farosEnBase = {
      sourceRef: 'faros:SA-ADM-M001#1',
      contentMd: 'LIVRABLE 001 — 55 434 caractères de livret HTML concaténé',
      needIdentification: null,
    };
    expect(
      isAnimable(farosEnBase),
      'Le module `faros:SA-ADM-M001#1` est animable : rien ne l’empêche ' +
        "d'entrer dans un parcours composé et de partir chez un financeur, " +
        'alors que la vidéo qu’il décrit n’est pas tournée.',
    ).toBe(false);
  });
});
