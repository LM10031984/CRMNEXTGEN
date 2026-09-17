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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE D'ORDRE — une garde n'a pas d'effet rétroactif
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `contentMdFingerprint = NULL` veut dire « **l'import n'a rien à protéger
 * ici** », pas « protégé ». C'est le bon défaut — sans lui, la colonne aurait
 * gelé tout le catalogue le jour de sa naissance. Mais il a une conséquence que
 * personne ne voit venir :
 *
 *   **Verser du contenu humain AVANT que l'import ait stampé le rend écrasable
 *   par le premier import qui passe — et celui-ci l'annoncera en « mis à
 *   jour ».**
 *
 * L'ordre n'est donc pas une préférence, c'est une condition :
 *
 *   ① import complet   → chaque module porte l'empreinte de ce que l'import a écrit
 *   ② SEULEMENT ENSUITE → versement du contenu humain
 *   ③ import suivant   → empreinte ≠ contenu, il refuse et il nomme
 *
 * Inversé, l'ordre ne casse rien bruyamment : il perd le travail en silence, au
 * prochain import, avec un rapport qui a l'air d'une bonne nouvelle.
 *
 * Une consigne se perd — d'où cette garde. Un script de versement l'appelle
 * AVANT d'écrire, et refuse si une seule de ses cibles n'a pas d'empreinte.
 */

/** Le motif rendu à l'écran quand le versement est lancé trop tôt. */
export const MOTIF_ORDRE_INVERSE =
  "Ce module est géré par l'import et ne porte AUCUNE empreinte : " +
  "l'import n'y a jamais écrit depuis que la garde existe. Y poser du contenu " +
  "maintenant le rendrait écrasable au premier import, qui l'annoncerait en " +
  "« mis à jour ». Lancer l'import COMPLET d'abord, ce versement ensuite.";

/** Une cible de versement, telle que la garde a besoin de la voir. */
export interface CibleVersement {
  /** L'identité du module dans sa source. NULL = module né hors import, rien à craindre. */
  sourceRef: string | null;
  /** Pour que le refus se lise. */
  titre: string;
  /** L'empreinte que le module porte aujourd'hui. */
  empreinte: string | null | undefined;
}

/**
 * Les cibles qu'on ne peut PAS encore servir, et rien d'autre.
 *
 * Un module sans `sourceRef` n'est pas concerné : l'import ne le connaît pas,
 * ne l'écrira jamais, et n'a donc rien à écraser. Le confondre avec une cible à
 * risque ferait refuser un versement légitime — et une garde qui refuse le cas
 * normal finit débranchée (§4 quaterdecies).
 */
export function ciblesSansEmpreinte(cibles: readonly CibleVersement[]): CibleVersement[] {
  return cibles.filter((c) => c.sourceRef !== null && c.empreinte == null);
}
