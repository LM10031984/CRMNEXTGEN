/**
 * La répartition des heures par modalité, telle qu'elle part à l'AGEFICE.
 *
 * Source UNIQUE, importée par `agefice-generator.ts` (le formulaire officiel) et
 * `agefice-attendance-generator.ts` (l'attestation d'assiduité). Elle vivait en
 * deux exemplaires identiques, clone assumé en commentaire — §4 bis se referme.
 *
 * ## Les quatre cases du Cerfa, et ce qui les alimente
 *
 * | Case AGEFICE | Alimentée par |
 * |---|---|
 * | Présentiel individuel | **rien** — aucune modalité ne la renseigne aujourd'hui |
 * | Présentiel collectif  | `PRESENTIEL` |
 * | FOAD synchrone        | `DISTANCIEL` — du distanciel **en direct** |
 * | FOAD asynchrone       | `ELEARNING` — à son rythme |
 *
 * `DISTANCIEL` et `ELEARNING` ne tombent pas dans la même case, et c'est le
 * point de vigilance : l'AGEFICE distingue le distanciel synchrone du distanciel
 * asynchrone. Avant le 16/09/2026, `ELEARNING` n'avait pas de `case` et tombait
 * dans un `default` qui déclarait **toutes** ses heures en présentiel collectif,
 * en silence.
 *
 * ## Pourquoi il n'y a plus de `default`
 *
 * Il était inatteignable en production. `TrainingSession.modality` est un enum
 * **fermé et non nullable** (`schema.prisma:582`), et les deux appelants passent
 * ce champ. Le paramètre était pourtant typé `string | null | undefined` : la
 * branche `default` n'existait que parce que la signature avait ouvert un
 * ensemble fermé. Le `case 'BLENDED'` en était la preuve — cette valeur n'est
 * dans aucun enum, c'était du code mort invité par le typage.
 *
 * Le garde est désormais le **contrôle d'exhaustivité** : une cinquième valeur
 * ajoutée à `Modality` casse `tsc` au build, pas la génération devant un
 * commercial.
 *
 * ## Pourquoi `MIXTE` refuse au lieu de répartir
 *
 * Il inventait un 50/50 (`Math.round(totalHours / 2)`). Personne ne l'avait
 * décidé, et rien ne permet de le déduire : la répartition d'un parcours mixte
 * n'est renseignée nulle part. Une heure inventée sur une pièce qui part au
 * financeur est exactement ce que §4 quinquies interdit — une absence rendue par
 * une affirmation positive.
 *
 * Le refus est donc la réponse juste tant qu'il n'existe pas de source. Son
 * successeur est nommé et différé : un champ de répartition sur la session
 * (`.planning/quick/260916-faros-barriere/deferred-items.md`).
 */
import { Modality } from '@qualiof/db';

/** Les quatre cases « durée » du formulaire AGEFICE, en heures. */
export interface HeuresAgefice {
  presIndiv: number;
  presColl: number;
  foadSync: number;
  foadAsync: number;
}

/**
 * Soit une répartition, soit un refus qui dit ce qui manque.
 *
 * Jamais un objet d'heures « par défaut » : une répartition qu'on ne sait pas
 * établir ne s'imprime pas, elle se refuse.
 */
export type RepartitionAgefice =
  | ({ ok: true } & HeuresAgefice)
  | { ok: false; motif: string };

/** `TrainingSession.modality` → les quatre cases AGEFICE. */
export function repartirHeuresAgefice(
  modality: Modality,
  totalHours: number,
): RepartitionAgefice {
  switch (modality) {
    case Modality.PRESENTIEL:
      return { ok: true, presIndiv: 0, presColl: totalHours, foadSync: 0, foadAsync: 0 };
    case Modality.DISTANCIEL:
      return { ok: true, presIndiv: 0, presColl: 0, foadSync: totalHours, foadAsync: 0 };
    case Modality.ELEARNING:
      return { ok: true, presIndiv: 0, presColl: 0, foadSync: 0, foadAsync: totalHours };
    case Modality.MIXTE:
      return {
        ok: false,
        motif:
          "Modalité MIXTE : la répartition des heures entre présentiel et distanciel " +
          "n'est renseignée nulle part. Déclare la session en PRESENTIEL, DISTANCIEL " +
          'ou ELEARNING, ou ajoute la répartition sur la session.',
      };
  }
  // Le garde : une cinquième valeur de l'enum ne compile pas.
  const _exhaustif: never = modality;
  return _exhaustif;
}
