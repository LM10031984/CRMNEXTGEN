/**
 * « Rien de non-confirmé ne sort » — le filtre, écrit une seule fois.
 *
 * C'est la règle d'acceptance du lot C (§14) et elle ne se tient pas à coups de
 * vigilance : quatre écrans et deux générateurs de documents lisent les
 * réponses d'un diagnostic. Un `where` recopié cinq fois, c'est un `where`
 * oublié la sixième — et ce jour-là une réponse que personne n'a relue part
 * dans un audit remis au client.
 *
 * Donc : tout ce qui CALCULE ou IMPRIME lit les réponses par ce filtre. Le seul
 * endroit qui voit les réponses non confirmées est l'écran de revue — et les
 * écrans de saisie, où elles s'affichent badgées « à confirmer », puisque c'est
 * là qu'on les corrige.
 *
 * Une réponse du commercial est toujours confirmée à l'écriture ; on teste
 * quand même les deux conditions, pour que la règle reste vraie si un jour un
 * autre chemin écrit une réponse humaine.
 */

export const CONFIRMEE = {
  OR: [{ origin: 'COMMERCIAL' as const }, { confirmedAt: { not: null } }],
};

/** Le `include`/`select` imbriqué des lectures qui calculent ou impriment. */
export const REPONSES_CONFIRMEES = {
  where: CONFIRMEE,
  select: { questionId: true, value: true, isSkipped: true },
} as const;
