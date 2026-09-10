/**
 * Le formatage des dates en français — module PUR, source unique.
 *
 * POURQUOI CE MODULE EXISTE (relecture du 10/09/2026)
 *
 * Trois écrans affichaient « Jeudi 8 Octobre 2026 ». Le fautif n'était pas
 * `Intl`, qui rend correctement « jeudi 8 octobre 2026 », mais la classe
 * Tailwind `capitalize` posée par-dessus : `text-transform: capitalize`
 * majuscule CHAQUE mot, parce que le CSS ne sait pas distinguer un début de
 * phrase d'un nom de mois. En français, ni les jours ni les mois ne prennent
 * de majuscule.
 *
 * La règle est donc : le formatage se décide ici, jamais dans une classe CSS.
 * Quand une date ouvre une phrase et mérite une capitale, on le demande
 * explicitement avec `capitaleInitiale`, qui ne touche que la première lettre.
 *
 * Le fuseau est celui de l'organisme, pour la même raison que dans
 * `campagne/creneaux.ts` : un rendu serveur en UTC afficherait la veille pour
 * toute date du soir.
 */

const FUSEAU_OF = 'Europe/Paris';

const FMT_LONG_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_OF,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const FMT_LONG = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_OF,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const FMT_COURT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_OF,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** « jeudi 8 octobre 2026 ». */
export function jourLongAvecAnnee(d: Date): string {
  return FMT_LONG_ANNEE.format(d);
}

/** « jeudi 8 octobre » — pour les listes où l'année est déjà donnée. */
export function jourLong(d: Date): string {
  return FMT_LONG.format(d);
}

/** « 08/10/2026 ». */
export function jourCourt(d: Date): string {
  return FMT_COURT.format(d);
}

/**
 * Majuscule sur la PREMIÈRE lettre, et sur elle seule.
 *
 * À réserver aux positions où la date ouvre une phrase ou un titre. Partout
 * ailleurs, la minuscule est la forme correcte.
 */
export function capitaleInitiale(texte: string): string {
  if (texte.length === 0) return texte;
  return texte.charAt(0).toLocaleUpperCase('fr-FR') + texte.slice(1);
}
