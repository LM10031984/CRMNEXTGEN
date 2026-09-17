/**
 * L'accumulation des signaux sur UN module — fonction pure.
 *
 * ## Le défaut qu'elle remplace
 *
 * `ecrire-rattachements.ts` écrivait `[...signalsAvant, signal]`, où
 * `signalsAvant` avait été lu pendant la phase de décision — donc **avant** la
 * transaction. Trois modules sont visés par deux douleurs différentes : leurs
 * deux écritures partaient du même état et la seconde écrasait la première.
 *
 * Un **lost update**, et c'est le bug `drive:020` sous un autre nom : une
 * lecture prise hors de la transaction, utilisée pour décider dedans.
 *
 * ## La forme de la correction
 *
 * L'unité n'est plus la DÉCISION, c'est le MODULE. On lui présente d'un coup
 * tous les signaux qu'on veut lui poser, et l'état frais relu dans la
 * transaction ; il rend ce qu'il reste à ajouter.
 *
 * Deux dédoublonnages, pas un — et le second est celui qui manquait :
 *   ① contre ce que le module porte DÉJÀ (une réexécution n'ajoute rien) ;
 *   ② contre le lot LUI-MÊME (deux décisions portant le même signal sur le même
 *      module ne le posent pas deux fois).
 *
 * La comparaison passe par une clé fournie par l'appelant — en pratique
 * `normalize` — parce qu'un signal est une phrase, et qu'une phrase revient avec
 * une apostrophe typographique ou une espace en trop sans être un autre signal.
 */

export interface AccumulationSignaux {
  /** À ajouter, dans l'ordre d'arrivée, dédoublonnés contre l'existant ET entre eux. */
  aAjouter: string[];
  /** Déjà portés par le module — comptés pour le relevé, pas silencieux. */
  dejaPresents: number;
}

export function accumulerSignaux(
  actuels: readonly string[],
  voulus: readonly string[],
  cle: (s: string) => string,
): AccumulationSignaux {
  const vus = new Set(actuels.map((s) => cle(s)));
  const aAjouter: string[] = [];
  let dejaPresents = 0;
  for (const signal of voulus) {
    const k = cle(signal);
    if (vus.has(k)) {
      dejaPresents += 1;
      continue;
    }
    // Ajouté à `vus` tout de suite : c'est ce qui empêche le doublon INTERNE au
    // lot, celui que l'ancien code produisait en écrasant.
    vus.add(k);
    aAjouter.push(signal);
  }
  return { aAjouter, dejaPresents };
}
