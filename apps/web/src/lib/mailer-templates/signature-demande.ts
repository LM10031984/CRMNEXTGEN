/**
 * Gabarits 1 et 2 de la chaîne de signature — lot C.2c. **LES DEUX SONT
 * BRANCHÉS** : `notifierSignataire` les appelle depuis `sendForSignature`.
 *
 *  1. « Signature demandée » — au signataire côté bénéficiaire.
 *  2. « À votre tour de signer » — au signataire de l'organisme.
 *
 * QUI REÇOIT LEQUEL NE SE DEVINE PAS ICI. La règle est « on prévient celui dont
 * c'est le tour » (D-3/D-8) : avec `signatoryOrder = BEFORE`, c'est l'organisme
 * qui signe en premier, donc c'est lui qu'on prévient au moment de l'envoi. Le
 * choix se fait dans `lib/signature/notifier.ts`, sur l'ordre DÉJÀ posé chez le
 * prestataire — pas sur une seconde règle écrite ici.
 *
 * Règles de fond, non négociables :
 *  - UN SEUL lien cliquable, le lien de signature. Pas de lien vers QualiOF :
 *    le responsable d'une agence n'a pas de compte.
 *  - Aucun montant, aucun tarif : ce n'est pas un email commercial.
 *  - La date limite en toutes lettres, jamais « sous 30 jours » — une date se
 *    vérifie, une durée se discute.
 *  - La pièce ET la formation nommées : un responsable qui reçoit trois
 *    demandes le même jour doit savoir laquelle il ouvre.
 */

import type { OfConfig } from '@/lib/of-config';
import {
  LIBELLE_QUALITE,
  coquilleHtml,
  dateEnToutesLettres,
  encadrePiece,
  paragraphe,
  type QualiteSignataire,
} from './signature-email-commun';

export { LIBELLE_QUALITE };
export type { QualiteSignataire };

export interface SignatureDemandeInput {
  signataireNom: string;
  /**
   * REÇUE, jamais re-dérivée dans le gabarit : c'est elle qui décide du mot
   * employé pour désigner le destinataire. Ignorée par la variante organisme,
   * qui est par construction le `of`.
   */
  qualiteSignataire: QualiteSignataire;
  /** « Convention — AGENCE MARTIN (2 participants) » — le libellé du plan. */
  libellePiece: string;
  formationTitre: string;
  sessionCode: string;
  signUrl: string;
  /** `SignatureRequest.expiresAt` — 30 jours par défaut. */
  dateLimite: Date;
}

export interface EmailRendu {
  subject: string;
  html: string;
  text: string;
}

function corpsCommun(
  i: SignatureDemandeInput,
  qualite: QualiteSignataire,
  introduction: string,
): { html: string; text: string[] } {
  const limite = dateEnToutesLettres(i.dateLimite);
  const html = [
    paragraphe(`Bonjour ${i.signataireNom},`),
    paragraphe(introduction),
    encadrePiece(i.libellePiece, i.formationTitre, i.sessionCode),
    paragraphe(
      `Vous recevez ce message en qualité de ${LIBELLE_QUALITE[qualite]}. ` +
        `Le lien ci-dessous vous est personnel : il ouvre le document et enregistre votre ` +
        `signature. Il reste valable jusqu'au ${limite}.`,
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
    `Vous recevez ce message en qualité de ${LIBELLE_QUALITE[qualite]}.`,
    `Le lien ci-dessous vous est personnel et reste valable jusqu'au ${limite} :`,
    i.signUrl,
  ];

  return { html, text };
}

export function renderSignatureDemandeClient(
  input: SignatureDemandeInput,
  of: OfConfig,
): EmailRendu {
  const subject = `Signature demandée — ${input.libellePiece}`;
  const { html: corps, text } = corpsCommun(
    input,
    input.qualiteSignataire,
    `Un document vous attend pour signature électronique.`,
  );

  return {
    subject,
    html: coquilleHtml(
      {
        subject,
        titre: 'Un document attend votre signature',
        corps,
        bouton: { href: input.signUrl, libelle: 'Signer le document' },
      },
      of,
    ),
    text: [...text, ``, `Merci,`, `L'équipe ${of.name}`].join('\n'),
  };
}

/**
 * La variante organisme. Même mise en page, ton interne : on ne rappelle pas à
 * Laurent ce qu'est son propre organisme de formation.
 */
export function renderSignatureDemandeOf(input: SignatureDemandeInput, of: OfConfig): EmailRendu {
  const subject = `À votre tour de signer — ${input.libellePiece}`;
  const { html: corps, text } = corpsCommun(
    input,
    'of',
    `C'est à votre tour de signer ce document.`,
  );

  return {
    subject,
    html: coquilleHtml(
      {
        subject,
        titre: 'À votre tour de signer',
        corps,
        bouton: { href: input.signUrl, libelle: 'Signer le document' },
      },
      of,
    ),
    text: [...text].join('\n'),
  };
}
