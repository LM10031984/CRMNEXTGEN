/**
 * Un pluriel écrit, pas un « (s) ».
 *
 * « 9 demi-journée(s) », « 4 indépendant(s) éligible(s) » : sur un document
 * remis à un dirigeant, ça fait brouillon. Le nombre est toujours connu au
 * moment d'écrire la phrase — il n'y a aucune raison de laisser le lecteur
 * accorder lui-même.
 */
export function plural(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${Math.abs(n) >= 2 ? pluriel : singulier}`;
}

/** Le mot seul, accordé — quand le nombre est écrit ailleurs dans la phrase. */
export function accord(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return Math.abs(n) >= 2 ? pluriel : singulier;
}
