/**
 * L'objectif au rythme du calendrier (Laurent 2026-09-10).
 *
 * La page comparait le réalisé YTD à l'objectif ANNUEL. Au 10 septembre,
 * « 55 % atteint » ne dit pas si on est en avance ou en retard : il manque la
 * moitié de la phrase — combien devrait-on avoir fait à cette date.
 *
 * Cette réponse existait déjà à moitié dans le code : `distributeAnnualObjective`
 * répartit l'objectif sur 12 mois selon la saisonnalité constatée des 3 années
 * précédentes, et le graphe l'affiche. On ne recalcule donc rien ici — on lit
 * cette répartition et on s'arrête au jour dit.
 *
 * Module PUR (aucune I/O). Toutes les fonctions rendent `null` plutôt qu'un
 * zéro quand la question n'a pas de sens : un « 0 % » se lit « en retard », un
 * « — » se lit « pas encore mesurable ». La nuance compte au 3 janvier.
 */

/**
 * Combien de mois de l'année ont une attente non nulle.
 *
 * `distributeAnnualObjective` répartit l'objectif selon la saisonnalité
 * constatée sur les 3 années précédentes. Quand l'historique est mince — un
 * seul exercice réel — des mois entiers retombent à zéro : la répartition dit
 * alors « rien n'est attendu en janvier » là où la vérité est « on ne sait
 * pas ». Constaté le 10/09/2026 : 5 mois à zéro, dont janvier→avril, alors que
 * 2026 y a fait 113 k€. L'objectif à date ne réclamait plus que 29 % de
 * l'année et la projection annonçait 548 k€ pour un carnet de 221 k€.
 */
const MOIS_MINIMUM_RENSEIGNES = 8;

/**
 * La saisonnalité est-elle assez fournie pour porter un objectif à date ?
 *
 * En dessous de 8 mois renseignés sur 12, non : mieux vaut une répartition
 * uniforme, franchement annoncée, qu'une courbe qui flatte le premier semestre
 * et écrase le second.
 */
export function saisonnaliteFiable(objectifMensuel: number[]): boolean {
  return objectifMensuel.filter((m) => m > 0).length >= MOIS_MINIMUM_RENSEIGNES;
}

/**
 * La répartition mensuelle à utiliser, et d'où elle vient — pour que l'écran
 * puisse le dire au lecteur plutôt que de laisser croire à une saisonnalité
 * mesurée.
 */
export function repartitionUtilisee(
  objectifMensuel: number[],
  objectifAnnuel: number,
): { mensuel: number[]; source: 'saisonnalite' | 'uniforme' } {
  if (objectifAnnuel <= 0) return { mensuel: objectifMensuel, source: 'saisonnalite' };
  if (saisonnaliteFiable(objectifMensuel)) {
    return { mensuel: objectifMensuel, source: 'saisonnalite' };
  }
  const part = Math.round(objectifAnnuel / 12);
  const mensuel = Array(12).fill(part) as number[];
  // Le résidu d'arrondi sur le dernier mois : la somme doit valoir l'objectif.
  mensuel[11] = objectifAnnuel - part * 11;
  return { mensuel, source: 'uniforme' };
}

/** Jours dans le mois (0-11) d'une année donnée, en UTC. */
function joursDansLeMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
}

/**
 * Ce que l'objectif réclame à une date donnée : les mois révolus en entier,
 * plus la part écoulée du mois en cours.
 *
 * Le mois courant est proratisé sur les jours ÉCOULÉS (le jour même ne compte
 * pas encore) : au 1er janvier à 0 h, rien n'est dû.
 *
 * @param objectifMensuel 12 montants (sortie de `distributeAnnualObjective`).
 */
export function objectifADate(objectifMensuel: number[], date: Date): number {
  const annee = date.getUTCFullYear();
  const mois = date.getUTCMonth();
  let cumul = 0;
  for (let i = 0; i < mois; i++) cumul += objectifMensuel[i] ?? 0;
  const joursEcoules = date.getUTCDate() - 1;
  const part = joursEcoules / joursDansLeMois(annee, mois);
  return cumul + Math.round((objectifMensuel[mois] ?? 0) * part);
}

/**
 * Quelle fraction de l'objectif annuel est déjà due à cette date.
 *
 * Ce n'est pas la fraction du calendrier : avec une saisonnalité chargée en fin
 * d'année, la moitié du temps ne réclame pas la moitié du CA.
 *
 * `null` = aucun objectif saisi (on ne divise pas par zéro).
 */
export function partAnnuelleEcoulee(objectifMensuel: number[], date: Date): number | null {
  const annuel = objectifMensuel.reduce((acc, m) => acc + m, 0);
  if (annuel === 0) return null;
  return objectifADate(objectifMensuel, date) / annuel;
}

/**
 * Où on en est PAR RAPPORT AU RYTHME attendu. 100 = pile dans les temps.
 *
 * `null` quand rien n'est encore dû : afficher 0 % se lirait « en retard »,
 * alors que la bonne lecture est « trop tôt pour le dire ».
 */
export function pctObjectifADate(realiseYTD: number, objectifADateValeur: number): number | null {
  if (objectifADateValeur <= 0) return null;
  return Math.round((realiseYTD / objectifADateValeur) * 100);
}

/**
 * Fin d'année extrapolée AU RYTHME CONSTATÉ — à ne pas confondre avec
 * l'atterrissage, qui additionne le carnet de commandes.
 *
 * Les deux répondent à deux questions différentes : « si je continue comme
 * ça » contre « si tout ce qui est signé se réalise, et rien de plus ». Les
 * lire ensemble encadre la fin d'année ; n'en lire qu'un seul trompe.
 *
 * `null` en début d'année : extrapoler un mois de janvier sur douze mois
 * produit un chiffre spectaculaire et sans valeur.
 */
export function projectionAuRythme(realiseYTD: number, part: number | null): number | null {
  if (!part || part <= 0) return null;
  return Math.round(realiseYTD / part);
}
