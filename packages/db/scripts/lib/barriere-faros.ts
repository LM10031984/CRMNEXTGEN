/**
 * Le SORT d'un rayon à l'import — module PUR, sans base ni réseau.
 *
 * ## Pourquoi cette décision vit ici, et pas dans le script
 *
 * `faros-non-importable.test.ts` tenait la barrière Faros par une **lecture du
 * texte source** de l'importeur (`/origin === 'faros'/.test(src)`). Une garde
 * qui vit dans un test que le chemin réel ne consulte jamais n'est pas une
 * garde (§4 ter) : le jour où l'importeur change de forme sans changer d'effet,
 * le test parle encore et ne protège plus rien.
 *
 * La décision est donc UNE fonction, appelée par l'importeur et appelée par le
 * test. Il n'y a plus deux vérités à tenir d'accord.
 *
 * ## La barrière Faros — arbitrage de Laurent, 16/09/2026, portée le 17/09
 *
 * `SA-ACQ-M003` et `SA-ADM-M001` ne sont PAS écartés pour la qualité de leur
 * contenu : leurs manifestes déclarent « G3 prêt à produire » en v1.0, et ce
 * sont les deux seuls du corpus dans ce cas.
 *
 * Ils sont écartés parce que ce sont des **capsules asynchrones** et que
 * l'import ne sait poser qu'une seule modalité — `PRESENTIEL`, en dur, pour
 * tous les produits. Les verser reviendrait à écrire une **fausse modalité sur
 * une pièce Qualiopi, en production** : une valeur que personne n'a affirmée,
 * rendue comme si quelqu'un l'avait décidée (§4 quinquies).
 *
 * La barrière se lève quand `TrainingModule` porte une modalité explicite
 * (condition ① du test) et que les produits `faros:` cessent de déclarer
 * `PRESENTIEL` par défaut (condition ②). Pas avant, et pas en retirant ce
 * fichier.
 *
 * ## Divergence assumée entre les bases
 *
 * La base LOCALE porte déjà les 2 entrées `faros:` (import du 11/09). La
 * PRODUCTION ne les aura pas. **Les deux bases divergent volontairement** — ce
 * n'est pas un écart à rattraper par un import. Consigné dans
 * `.planning/quick/260916-faros-barriere/deferred-items.md`.
 */

/** Le motif imprimé dans le dry-run et dans le rapport. Texte arrêté par Laurent. */
export const MOTIF_FAROS =
  "Écarté — contenu asynchrone, et l'import ne sait poser que PRESENTIEL. " +
  "Le champ de modalité n'existe pas encore (barrière Faros, condition ①).";

/** Un dossier source dont l'extraction n'a rien rendu : il n'y a rien à importer. */
export const MOTIF_SANS_MODULE = 'Aucun module extrait — rien à importer.';

/**
 * Union discriminée plutôt qu'un booléen : elle grave l'invariant « un rayon
 * écarté porte toujours son motif », que TypeScript vérifie au lieu qu'on
 * l'affirme.
 */
export type SortDuRayon = { importable: true } | { importable: false; motif: string };

/**
 * Ce qu'on a besoin de savoir d'un rayon pour trancher son sort — et rien de
 * plus, pour que le test n'ait pas à fabriquer un instantané entier.
 */
export interface RayonCandidat {
  origin: string;
  modules: readonly unknown[];
}

/**
 * Le sort d'un rayon, dans l'ordre où les refus s'appliquent.
 *
 * Faros d'abord, et c'est délibéré : l'exclusion est **catégorielle**. Un
 * dossier Faros bien découpé, riche en modules, reste écarté — le motif ne
 * regarde pas ce que le dossier contient, il regarde ce que l'import sait
 * écrire. Tester le nombre de modules d'abord ferait dépendre le motif rendu de
 * la forme du dossier, et un jour le mauvais motif partirait dans un rapport.
 */
export function sortDuRayon(p: RayonCandidat): SortDuRayon {
  if (p.origin === 'faros') return { importable: false, motif: MOTIF_FAROS };
  if (p.modules.length === 0) return { importable: false, motif: MOTIF_SANS_MODULE };
  return { importable: true };
}
