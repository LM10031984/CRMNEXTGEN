/**
 * L'ÉCRAN « DOSSIER PRÊT », décidé ici et pas dans le JSX.
 *
 * Attente de Laurent (10/09) : « l'admin ouvre le dossier du participant et
 * trouve un écran Dossier prêt … et UN SEUL bouton Envoyer. Si une pièce manque
 * ou n'est pas signée : bloquant nominatif, jamais d'envoi partiel silencieux. »
 *
 * POURQUOI LA RÈGLE VIT ICI. Le refus existe déjà côté serveur
 * (`sendOpcoSubmission`), et c'est lui qui protège réellement. Mais le
 * découvrir au clic fait refaire tout le chemin — préparer, cocher, rédiger —
 * pour rien. L'écran doit le dire AVANT. Deux endroits qui répondent à la même
 * question finiraient par diverger : celui-ci ne décide donc RIEN de neuf, il
 * appelle `piecesNonSignees`, la même fonction que le serveur.
 *
 * PUR : ni Prisma, ni réseau, ni horloge.
 */

import {
  messageDossierIncomplet,
  piecesNonSignees,
  type KindPieceDossier,
  type PieceASigner,
} from './pieces-dossier';

export type EtatDossier = 'PRET' | 'INCOMPLET' | 'SANS_DESTINATAIRE' | 'SANS_PIECE';

export interface VueDossierPret {
  etat: EtatDossier;
  /** Non nul EXACTEMENT quand `etat !== 'PRET'`. Rendu tel quel par l'écran. */
  blocage: string | null;
  /** Les pièces exigées, incluses, et non signées — pour marquer les lignes. */
  nonSignees: PieceASigner[];
  /** L'envoi ORDINAIRE est-il proposable ? */
  envoiPossible: boolean;
  /**
   * L'option « Envoyer quand même » est-elle offerte ?
   *
   * ⚠ Elle EXISTE ou elle n'existe pas, jamais grisée — la discipline du bloc
   * « Signature » (décision Laurent n°3). Un bouton grisé laisse croire qu'il
   * manque un réglage ; ici, c'est un RÔLE qui manque, et aucune case à cocher
   * ne le donnera.
   */
  forcagePossible: boolean;
}

/** Seul ADMIN décide d'envoyer un dossier incomplet — comme côté serveur. */
const ROLE_QUI_PEUT_FORCER = 'ADMIN';

export function vueDossierPret(a: {
  attachments: readonly { kind: KindPieceDossier; included: boolean; signe?: boolean }[];
  destinataire: string;
  role: string;
}): VueDossierPret {
  // Seules les pièces RÉELLEMENT jointes comptent : un admin qui décoche la
  // convention monte un dossier partiel assumé, et lui opposer « convention non
  // signée » serait lui parler d'une pièce absente.
  const jointes = a.attachments.filter((p) => p.included);

  // ⚠ `signe` absent vaut « on ne sait pas » : les brouillons composés AVANT ce
  // lot n'en portent pas, et les bloquer rétroactivement immobiliserait des
  // dossiers déjà préparés.
  const nonSignees = piecesNonSignees(
    jointes.filter((p) => p.signe !== undefined).map((p) => ({ kind: p.kind, signe: p.signe === true })),
  );

  // L'ORDRE DE LECTURE EST LA RÈGLE : l'adresse d'abord, puis les pièces, puis
  // les signatures. On nomme le manque qu'on corrige EN PREMIER — dire « la
  // convention n'est pas signée » à quelqu'un qui n'a pas de destinataire le
  // ferait travailler dans le désordre.
  if (a.destinataire.trim().length === 0) {
    return {
      etat: 'SANS_DESTINATAIRE',
      blocage:
        'Aucune adresse destinataire : renseignez-la ci-dessus avant d’envoyer le dossier.',
      nonSignees,
      envoiPossible: false,
      // Forcer ne créerait pas d'adresse : l'option n'aurait aucun sens.
      forcagePossible: false,
    };
  }

  if (jointes.length === 0) {
    return {
      etat: 'SANS_PIECE',
      blocage: 'Aucune pièce jointe sélectionnée : le dossier serait vide.',
      nonSignees,
      envoiPossible: false,
      forcagePossible: false,
    };
  }

  if (nonSignees.length > 0) {
    return {
      etat: 'INCOMPLET',
      blocage: messageDossierIncomplet(nonSignees),
      nonSignees,
      envoiPossible: false,
      forcagePossible: a.role === ROLE_QUI_PEUT_FORCER,
    };
  }

  return { etat: 'PRET', blocage: null, nonSignees: [], envoiPossible: true, forcagePossible: false };
}
