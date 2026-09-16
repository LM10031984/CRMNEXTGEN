/**
 * La répartition des heures par modalité, telle qu'elle part à l'AGEFICE.
 *
 * ## Source UNIQUE — ce qu'elle remplace
 *
 * Cette fonction vivait en **deux exemplaires identiques**, dans
 * `agefice-generator.ts` (le formulaire officiel) et
 * `agefice-attendance-generator.ts` (l'attestation d'assiduité). Le clone était
 * assumé en commentaire — « déduplication possible plus tard ». Deux copies
 * d'une règle qui part au financeur divergent au premier changement d'avis
 * (§4 bis), et celle-ci porte déjà trois défauts identiques des deux côtés.
 *
 * ⚠️ **Ce fichier est un DÉPLACEMENT, pas une correction.** La logique est
 * recopiée à l'identique, défauts compris, pour que la déduplication ne masque
 * pas ce que les tests mesurent. Les trois défauts sont décrits dans
 * `server/actions/__tests__/agefice-modalite-rendu.test.ts`, qui reste rouge :
 *
 *   (a) `ELEARNING` — valeur de l'enum Prisma `Modality` — n'a pas de `case` et
 *       tombe dans `default` : toutes ses heures sont déclarées en présentiel
 *       collectif, en silence ;
 *   (b) le `default` est muet : une modalité nulle ou inconnue produit la même
 *       affirmation positive qu'un vrai présentiel ;
 *   (c) `foadAsync` vaut 0 dans les quatre branches — la case FOAD asynchrone du
 *       formulaire ne peut structurellement jamais être remplie.
 *
 * Leur correction touche ce qu'un financeur lit. Elle attend l'arbitrage de
 * Laurent, pas l'initiative d'une session.
 */

/** Les quatre cases « durée » du formulaire AGEFICE, en heures. */
export interface DureeParModalite {
  presIndiv: number;
  presColl: number;
  foadSync: number;
  foadAsync: number;
}

/** `TrainingSession.modality` → les quatre cases AGEFICE. */
export function splitDureeByModality(
  modality: string | null | undefined,
  totalHours: number,
): DureeParModalite {
  switch ((modality ?? '').toUpperCase()) {
    case 'PRESENTIEL':
      return { presIndiv: 0, presColl: totalHours, foadSync: 0, foadAsync: 0 };
    case 'DISTANCIEL':
      return { presIndiv: 0, presColl: 0, foadSync: totalHours, foadAsync: 0 };
    case 'MIXTE':
    case 'BLENDED': {
      const half = Math.round(totalHours / 2);
      return { presIndiv: 0, presColl: half, foadSync: totalHours - half, foadAsync: 0 };
    }
    default:
      return { presIndiv: 0, presColl: totalHours, foadSync: 0, foadAsync: 0 };
  }
}
