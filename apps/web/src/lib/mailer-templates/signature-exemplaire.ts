/**
 * Gabarit 5 — « voici votre exemplaire signé ».
 *
 * ⚠ **CE GABARIT N'A ENCORE AUCUN APPELANT**, et surtout : **sa pièce jointe
 * n'existe pas encore**. `Document.signedPdfUrl` n'est rempli aujourd'hui que
 * par le SCAN MANUEL du lot A (`signatureKind = MANUAL_SCAN`) ; pour une
 * signature électronique, c'est le webhook `submission.completed` — lot C.3 —
 * qui l'écrit, avec le certificat de signature en `.audit-trail.pdf`. Branché
 * aujourd'hui, cet email joindrait au mieux un scan, jamais l'exemplaire
 * électronique. La plomberie, elle, existe déjà : `sendMail` accepte
 * `attachments`, `downloadFile(DOCS_BUCKET, key)` rend un Buffer.
 *
 * LE CERTIFICAT EST UNE PIÈCE À PART ENTIÈRE, pas une annexe technique : c'est
 * lui que les AGEFICE réclament (spec §4.3). Le gabarit l'ANNONCE nommément —
 * une pièce jointe muette est une pièce jointe que personne n'ouvre.
 *
 * AUCUN LIEN CLIQUABLE. Tout est joint. Renvoyer le destinataire vers une URL
 * pour récupérer son propre exemplaire, c'est lui demander de faire confiance à
 * un lien dans un email qui ressemble à celui qu'il vient de signer.
 */

import type { OfConfig } from '@/lib/of-config';
import type { DocTypeSignable } from '@/lib/signature/regime';
import {
  blocSignatureTexte,
  coquilleHtml,
  dateEnToutesLettres,
  encadrePiece,
  escapeHtml,
  paragraphe,
  phraseDeRole,
  type Expediteur,
  type QualiteSignataire,
} from './signature-email-commun';
import type { EmailRendu } from './signature-demande';

export interface SignatureExemplaireInput {
  signataireNom: string;
  qualiteSignataire: QualiteSignataire;
  piece: DocTypeSignable;
  /** Ce que l'objet nomme : l'organisation, ou l'apprenant. */
  concerne: string;
  /** L'organisation bénéficiaire, nommée dans la phrase de rôle. */
  organisation: string | null;
  libellePiece: string;
  formationTitre: string;
  sessionCode: string;
  /** `SignatureRequest.completedAt` — la date où la dernière signature est tombée. */
  signeLe: Date;
  /**
   * Les noms de fichiers RÉELLEMENT joints par l'appelant, dans l'ordre. Le
   * certificat de signature (`.audit-trail.pdf`) en fait partie : il n'est pas
   * optionnel, c'est la preuve opposable.
   */
  piecesJointes: string[];
  expediteur: Expediteur;
}

export function renderSignatureExemplaire(
  input: SignatureExemplaireInput,
  of: OfConfig,
): EmailRendu {
  const subject = `Votre exemplaire signé — ${input.libellePiece}`;
  const signeLe = dateEnToutesLettres(input.signeLe);

  const listeHtml = input.piecesJointes
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join('');

  const corps = [
    paragraphe(`Bonjour ${input.signataireNom},`),
    paragraphe(
      `Toutes les signatures ont été recueillies le ${signeLe}. Vous trouverez votre ` +
        `exemplaire en pièce jointe.`,
    ),
    encadrePiece(input.libellePiece, input.formationTitre, input.sessionCode),
    paragraphe(
      `Deux fichiers vous sont joints : le document signé, et son certificat de signature — ` +
        `c'est ce certificat qui prouve qui a signé, quand, et depuis quelle adresse. ` +
        `Conservez-le : un financeur peut le demander.`,
    ),
    `      <ul style="margin:0 0 16px 0; padding-left:18px; font-size:10pt;">${listeHtml}</ul>`,
    paragraphe(
      `${phraseDeRole(input.qualiteSignataire, input.organisation)} ` +
        `Aucune action n'est attendue de votre part.`,
    ),
  ].join('\n');

  const text = [
    `Bonjour ${input.signataireNom},`,
    ``,
    `Toutes les signatures ont été recueillies le ${signeLe}.`,
    `Vous trouverez votre exemplaire en pièce jointe.`,
    ``,
    `- Document : ${input.libellePiece}`,
    `- Formation : ${input.formationTitre}`,
    `- Session : ${input.sessionCode}`,
    ``,
    `Pièces jointes :`,
    ...input.piecesJointes.map((f) => `- ${f}`),
    ``,
    `Le certificat de signature prouve qui a signé, quand, et depuis quelle adresse.`,
    `Conservez-le : un financeur peut le demander.`,
    ``,
    phraseDeRole(input.qualiteSignataire, input.organisation),
    `Aucune action n'est attendue de votre part.`,
    ``,
    ...blocSignatureTexte(input.expediteur, of),
  ].join('\n');

  return {
    subject,
    html: coquilleHtml(
      { subject, titre: 'Votre exemplaire signé', corps, expediteur: input.expediteur },
      of,
    ),
    text,
  };
}
