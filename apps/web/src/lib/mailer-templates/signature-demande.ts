/**
 * Gabarits 1 et 2 de la chaîne de signature — lot C.2c. **LES DEUX SONT
 * BRANCHÉS** : `notifierSignataire` les appelle depuis `sendForSignature`.
 *
 *  1. « {Pièce} à signer — {qui} » — au signataire côté bénéficiaire.
 *  2. « À votre tour de signer » — au signataire de l'organisme.
 *
 * QUI REÇOIT LEQUEL NE SE DEVINE PAS ICI. La règle est « on prévient celui dont
 * c'est le tour » (D-3/D-8) : avec `signatoryOrder = BEFORE`, c'est l'organisme
 * qui signe en premier, donc c'est lui qu'on prévient au moment de l'envoi. Le
 * choix se fait dans `lib/signature/notifier.ts`, sur l'ordre DÉJÀ posé chez le
 * prestataire — pas sur une seconde règle écrite ici.
 *
 * TEXTE REVU LE 11/09/2026 (retours Laurent sur `evidence/signature-C`) :
 *  - l'objet nomme la PIÈCE et QUI elle concerne, plus « Signature demandée — »
 *    suivi d'un libellé technique ;
 *  - une phrase de contexte ouvre le message, avant le bloc du document : on
 *    dit POURQUOI on écrit avant de dire QUOI signer ;
 *  - la phrase de rôle nomme l'organisation, ou l'inscription du stagiaire ;
 *  - sous le bouton, ce que le geste coûte réellement (deux minutes, pas de
 *    compte à créer) et comment poser une question ;
 *  - la signature est une PERSONNE avec un téléphone, jamais « L'équipe ».
 *
 * Règles de fond, inchangées et non négociables :
 *  - UN SEUL lien cliquable, le lien de signature. Pas de lien vers QualiOF :
 *    le responsable d'une agence n'a pas de compte.
 *  - Aucun montant, aucun tarif : ce n'est pas un email commercial.
 *  - La date limite en toutes lettres, jamais « sous 30 jours » — une date se
 *    vérifie, une durée se discute.
 */

import type { OfConfig } from '@/lib/of-config';
import type { DocTypeSignable } from '@/lib/signature/regime';
import {
  LIBELLE_QUALITE,
  NOM_DE_PIECE,
  RASSURANCE_SIGNATURE,
  blocSignatureTexte,
  coquilleHtml,
  dateEnToutesLettres,
  encadrePiece,
  paragraphe,
  phraseDeRole,
  type Expediteur,
  type QualiteSignataire,
} from './signature-email-commun';

export { LIBELLE_QUALITE, phraseDeRole };
export type { Expediteur, QualiteSignataire };

export interface SignatureDemandeInput {
  signataireNom: string;
  /**
   * REÇUE, jamais re-dérivée dans le gabarit : c'est elle qui décide du mot
   * employé pour désigner le destinataire. Ignorée par la variante organisme,
   * qui est par construction le `of`.
   */
  qualiteSignataire: QualiteSignataire;
  /** Le TYPE de pièce — décide de l'objet et du mot employé dans les relances. */
  piece: DocTypeSignable;
  /**
   * Ce que l'OBJET nomme : l'organisation bénéficiaire pour une convention,
   * l'apprenant pour un dossier AGEFICE ou une attestation d'assiduité.
   */
  concerne: string;
  /**
   * L'organisation bénéficiaire, NOMMÉE dans « en tant que responsable de X ».
   * `null` quand elle est inconnue : la phrase retombe alors sur « responsable
   * de l'organisation » plutôt que d'écrire « responsable de null ».
   */
  organisation: string | null;
  /** Le libellé du plan, affiché dans le bloc du document. */
  libellePiece: string;
  formationTitre: string;
  sessionCode: string;
  signUrl: string;
  /** `SignatureRequest.expiresAt` — 30 jours par défaut. */
  dateLimite: Date;
  expediteur: Expediteur;
}

export interface EmailRendu {
  subject: string;
  html: string;
  text: string;
}

/** « Convention à signer — AGENCE MARTIN & FILS ». */
export function objetDemandeClient(input: SignatureDemandeInput): string {
  return `${NOM_DE_PIECE[input.piece].titre} à signer — ${input.concerne}`;
}

/**
 * La phrase de contexte, AVANT le bloc du document — retour n°2.
 *
 * Elle dit pourquoi on écrit, en une phrase, avec le nom de la formation. Un
 * responsable d'agence qui reçoit trois demandes le même jour lit d'abord ça.
 */
function phraseDeContexte(i: SignatureDemandeInput): string {
  if (i.qualiteSignataire === 'stagiaire') {
    return `Pour finaliser votre inscription à ${i.formationTitre}, il reste votre signature.`;
  }
  return (
    `Pour finaliser l'inscription de votre équipe à la formation ${i.formationTitre}, ` +
    `il reste une signature : la vôtre.`
  );
}

function corpsCommun(
  i: SignatureDemandeInput,
  qualite: QualiteSignataire,
  introduction: string,
  of: OfConfig,
): { html: string; text: string } {
  const limite = dateEnToutesLettres(i.dateLimite);
  const role = phraseDeRole(qualite, i.organisation);

  const html = [
    paragraphe(`Bonjour ${i.signataireNom},`),
    paragraphe(introduction),
    encadrePiece(i.libellePiece, i.formationTitre, i.sessionCode),
    paragraphe(
      `${role} Le lien ci-dessous vous est personnel : il ouvre le document et enregistre ` +
        `votre signature. Il reste valable jusqu'au ${limite}.`,
    ),
  ].join('\n');

  const text = [
    `Bonjour ${i.signataireNom},`,
    ``,
    introduction,
    ``,
    `- Document : ${i.libellePiece}`,
    `- Formation : ${i.formationTitre}`,
    `- Session : ${i.sessionCode}`,
    ``,
    role,
    `Le lien ci-dessous vous est personnel et reste valable jusqu'au ${limite} :`,
    i.signUrl,
    ``,
    RASSURANCE_SIGNATURE,
    ``,
    ...blocSignatureTexte(i.expediteur, of),
  ].join('\n');

  return { html, text };
}

export function renderSignatureDemandeClient(
  input: SignatureDemandeInput,
  of: OfConfig,
): EmailRendu {
  const subject = objetDemandeClient(input);
  const { html: corps, text } = corpsCommun(
    input,
    input.qualiteSignataire,
    phraseDeContexte(input),
    of,
  );

  return {
    subject,
    html: coquilleHtml(
      {
        subject,
        titre: 'Un document attend votre signature',
        corps,
        bouton: { href: input.signUrl, libelle: 'Signer le document' },
        apresBouton: RASSURANCE_SIGNATURE,
        expediteur: input.expediteur,
      },
      of,
    ),
    text,
  };
}

/**
 * La variante organisme. Même mise en page, ton interne : on ne rappelle pas à
 * Laurent ce qu'est son propre organisme de formation, et on ne lui parle pas
 * de « finaliser une inscription » — il la connaît, il la produit.
 *
 * ⚠ SON OBJET N'A PAS BOUGÉ au 11/09. Les retours de Laurent portaient sur les
 * emails que reçoivent les CLIENTS ; celui-ci arrive dans sa propre boîte et
 * l'y désigner par le libellé complet du plan — « Convention — AGENCE MARTIN
 * (2 participants) » — est ce qui lui permet de trier.
 */
export function renderSignatureDemandeOf(input: SignatureDemandeInput, of: OfConfig): EmailRendu {
  const subject = `À votre tour de signer — ${input.libellePiece}`;
  const { html: corps, text } = corpsCommun(
    input,
    'of',
    `C'est à votre tour de signer ce document.`,
    of,
  );

  return {
    subject,
    html: coquilleHtml(
      {
        subject,
        titre: 'À votre tour de signer',
        corps,
        bouton: { href: input.signUrl, libelle: 'Signer le document' },
        apresBouton: RASSURANCE_SIGNATURE,
        expediteur: input.expediteur,
      },
      of,
    ),
    text,
  };
}
