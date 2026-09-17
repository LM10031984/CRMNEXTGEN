/**
 * La garde d'ÉCRASEMENT — l'import ne réécrit que ce qu'il a lui-même écrit.
 *
 * ## Le défaut qu'elle ferme
 *
 * `import-drive-catalog.ts` réécrit `contentMd` à chaque passage. Sa seule
 * garde, `doitProtegerLeContenu`, commence par `if (!entrantVide) return false` :
 * **elle ne protège que du VIDE.** Un déroulé réécrit à la main était donc
 * remplacé dès que le document Drive portait son propre texte — et le rapport
 * annonçait « 72 mis à jour », ce qui a l'air d'une bonne nouvelle.
 *
 * C'est la forme exacte du défaut qu'on traque depuis une semaine : *une perte
 * rendue par une affirmation positive.*
 *
 * ## La règle, et pourquoi celle-là
 *
 * L'import range l'empreinte de ce que LUI a écrit. Au passage suivant il
 * compare l'empreinte mémorisée au contenu en base :
 *
 *   • elles concordent → personne n'est passé après lui, il reprend la main ;
 *   • elles diffèrent  → **un humain a écrit après lui**, il ne réécrit pas et
 *     il le NOMME.
 *
 * « L'import ne vide jamais un contenu écrit » devient « **l'import ne réécrit
 * que ce qu'il a lui-même écrit** » — la seconde contient la première.
 *
 * ## Il ne devine JAMAIS
 *
 * Le cas gênant est réel : le Drive est corrigé, et le module a aussi été
 * retouché à la main. Les deux versions sont légitimes, et **aucune règle ne
 * peut les départager** — pas plus qu'un rayon contre un rayon (D-19 bis).
 * Le script ne tranche donc pas : il refuse, il nomme la paire, et un humain
 * décide. Un script qui arbitre à la place de Laurent sur un texte qui part
 * chez un financeur est exactement ce qu'on ne veut pas.
 *
 * ## Portée, dite en toutes lettres
 *
 * Elle couvre `TrainingModule.contentMd`, et rien d'autre. C'est là que vit le
 * travail rédactionnel, et c'est la seule perte irréversible : les titres
 * passent déjà par un registre d'arbitrages explicite (`TITRES_TRANCHES`), et
 * `order`, `durationMin`, `family`, `excludedFromClientOutputs` se dérivent de
 * la source sans qu'un humain y écrive.
 * Le `programMd` des rayons n'est PAS couvert — un rayon n'est pas vendable et
 * personne ne l'édite aujourd'hui. Le jour où ça change, cette garde est la
 * forme à reprendre.
 */
import { createHash } from 'node:crypto';

/**
 * L'empreinte d'un contenu — SHA-256, jamais le texte.
 *
 * Normalisée par `trim()` seulement : une espace en fin de fichier ne doit pas
 * faire croire qu'un humain est passé, mais une ligne réécrite, si. En faire
 * plus (casse, ponctuation) rendrait la garde aveugle à de vraies retouches.
 */
export function empreinte(contenu: string | null | undefined): string {
  return createHash('sha256')
    .update((contenu ?? '').trim(), 'utf8')
    .digest('hex');
}

/** Ce que l'import a le droit de faire du `contentMd` d'un module. */
export type SortDuContenu =
  /** Il écrit, et il stampe l'empreinte de ce qu'il vient d'écrire. */
  | { action: 'écrire' }
  /** Le Drive est muet, la base a un déroulé : on le garde (garde d'origine). */
  | { action: 'protéger' }
  /** Un humain a écrit après l'import : il ne reprend pas la main, il nomme. */
  | { action: 'refuser' };

export interface EtatDuContenu {
  /** Ce que la base porte aujourd'hui. */
  enBase: string | null | undefined;
  /** Ce que la source veut écrire. */
  entrant: string | null | undefined;
  /** L'empreinte mémorisée au dernier passage de l'import — NULL s'il n'en a jamais écrit. */
  empreinteConnue: string | null | undefined;
  /** La garde d'origine : « un import ne VIDE jamais un contenu écrit ». */
  protegeParLeVide: boolean;
}

/**
 * Les trois issues, dans l'ordre où elles s'appliquent.
 *
 * `protéger` passe en premier : c'est la garde la plus ancienne et la plus
 * simple, et quand les deux s'appliquent le résultat est le même — on n'écrit
 * pas. Lui donner la priorité garde le motif le plus précis dans le rapport.
 */
export function sortDuContenu(etat: EtatDuContenu): SortDuContenu {
  if (etat.protegeParLeVide) return { action: 'protéger' };
  // Aucune empreinte : l'import n'a jamais écrit ce module (ou l'a écrit avant
  // cette colonne). Il n'a rien à protéger — il écrit et il stampe.
  if (etat.empreinteConnue == null) return { action: 'écrire' };
  if (empreinte(etat.enBase) !== etat.empreinteConnue) return { action: 'refuser' };
  return { action: 'écrire' };
}
