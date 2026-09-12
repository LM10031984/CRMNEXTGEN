/**
 * Où vit la matière LOCALE — et comment la trouver sans se faire mentir.
 *
 * ── Le motif dangereux ──────────────────────────────────────────────────────
 *
 * Ce n'est PAS « le chemin n'existe plus » : ça, on le voit tout de suite.
 * C'est **« le chemin existe encore et ne porte plus rien »**. `existsSync`
 * réussit, `readdirSync` rend zéro paquet, et le script travaille sur du vide en
 * annonçant un succès.
 *
 * Vérifié le 11/09/2026, et c'est l'origine de ce module : `~/Documents` est
 * synchronisé par iCloud, qui duplique les fichiers pendant qu'on les édite. Le
 * corpus Faros a suivi le dépôt vers `~/Projects`, et iCloud a laissé sur place
 * un dossier **vide** plus un sosie « Formation Faros 2 ». Une extraction a donc
 * perdu `faros:SA-ADM-M001` et `faros:SA-ACQ-M003` **sans un mot** — dont celui
 * que le plan du lot 1 exigeait de voir sortir intact.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 * On ne se contente plus de l'existence : on cherche le premier emplacement qui
 * PORTE réellement la matière, avec le prédicat de l'appelant. Une variable
 * d'environnement explicite reste toujours souveraine — si on la pose, c'est
 * qu'on sait ce qu'on fait.
 *
 * Ce module est le SEUL endroit du dépôt qui nomme encore l'ancien emplacement
 * `~/Documents`, et c'est délibéré : il le garde comme SECOND candidat. Le garde
 * `apps/web/src/lib/__tests__/chemins-en-dur.test.ts` l'inscrit pour cette raison
 * dans sa liste d'exceptions — et refuse tout nouvel arrivant.
 *
 * Fonctions PURES côté logique : le lecteur de dossier est injectable, c'est ce
 * qui permet de tester « existe mais vide » et « illisible » sans fabriquer
 * d'arborescence.
 */

import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

/** Le lecteur par défaut : les entrées du dossier, ou `null` s'il est inexploitable. */
function lireDossier(dir: string): readonly string[] | null {
  if (!existsSync(dir)) return null;
  try {
    return readdirSync(dir);
  } catch {
    return null;
  }
}

/**
 * Le premier emplacement qui PORTE la matière, dans l'ordre des candidats.
 *
 * @param candidats   les emplacements possibles, par ordre de préférence
 * @param porteQuoi   le prédicat de l'appelant, appliqué aux entrées du dossier
 * @param lire        lecteur injectable (tests) — `null` quand le dossier est
 *                    absent ou illisible
 * @returns l'emplacement retenu, ou `null` si aucun ne porte rien. C'est à
 *          l'APPELANT de décider quoi en dire : se rabattre sur le premier
 *          candidat pour afficher un message, ou échouer.
 */
export function premierEmplacementPorteur(
  candidats: readonly string[],
  porteQuoi: (entrees: readonly string[]) => boolean,
  lire: (dir: string) => readonly string[] | null = lireDossier,
): string | null {
  for (const dir of candidats) {
    let entrees: readonly string[] | null;
    try {
      entrees = lire(dir);
    } catch {
      // Un dossier illisible (permission) n'est pas une erreur de programme : on
      // passe au suivant. Le lecteur par défaut avale déjà le cas, mais un
      // lecteur injecté peut lever — ce garde vaut pour les deux.
      continue;
    }
    if (entrees === null) continue;
    if (porteQuoi(entrees)) return dir;
  }
  return null;
}

/**
 * Les deux emplacements possibles du corpus nxt-coach, dans l'ordre de préférence.
 *
 * `~/Projects` d'abord — c'est là que le corpus vit depuis la sortie d'iCloud du
 * 11/09/2026. `~/Documents` ensuite, pour une machine qui n'a pas encore
 * déménagé sa matière.
 */
export function candidatsNxtCoach(sousChemin?: string): string[] {
  const home = process.env.HOME ?? '';
  const racines = [
    path.join(home, 'Projects/nxt-coach/Formation Faros'),
    path.join(home, 'Documents/nxt-coach/Formation Faros'),
  ];
  return sousChemin === undefined ? racines : racines.map((r) => path.join(r, sousChemin));
}
