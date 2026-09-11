/**
 * Gabarits 3 et 4 — les relances J+3 et J+7 (D-5).
 *
 * ⚠ **CE GABARIT N'A ENCORE AUCUN APPELANT**, et c'est écrit ici pour que
 * personne ne le croie branché. Son déclencheur est le cron
 * `signature-reminders`, qui lit `SignatureRequest.sentAt` / `reminderCount` —
 * du lot C.3. Décision Laurent du 11/09/2026 : écrire et PROUVER les cinq
 * gabarits maintenant, en brancher deux, brancher les trois autres avec le
 * retour du prestataire.
 *
 * UN SEUL GABARIT POUR LES DEUX RELANCES, paramétré par le rang. Deux fichiers
 * auraient divergé au premier ajustement de ton, et le destinataire, lui, les
 * reçoit à quatre jours d'intervalle.
 *
 * LE LIEN NE SE RÉGÉNÈRE PAS. La relance renvoie le `signUrl` déjà persisté
 * dans `SignatureRequest.signers[]` : en fabriquer un second ouvrirait une
 * seconde demande chez le prestataire, et le premier lien continuerait de vivre.
 */

import type { OfConfig } from '@/lib/of-config';
import {
  NOM_DE_PIECE,
  RASSURANCE_SIGNATURE,
  blocSignatureTexte,
  coquilleHtml,
  dateEnToutesLettres,
  encadrePiece,
  paragraphe,
  phraseDeRole,
} from './signature-email-commun';
import type { EmailRendu, SignatureDemandeInput } from './signature-demande';

/** 1 = J+3 (rappel), 2 = J+7 (dernier rappel). Au-delà, plus rien ne part. */
export type RangRelance = 1 | 2;

export interface SignatureRelanceInput extends SignatureDemandeInput {
  rang: RangRelance;
  /** `SignatureRequest.sentAt` — la relance rappelle QUAND la demande est partie. */
  envoyeeLe: Date;
}

export function renderSignatureRelance(input: SignatureRelanceInput, of: OfConfig): EmailRendu {
  const dernier = input.rang === 2;
  const possessif = NOM_DE_PIECE[input.piece].possessif;
  const subject = `${dernier ? 'Dernier rappel' : 'Rappel'} : votre ${possessif} attend votre signature`;

  const envoyee = dateEnToutesLettres(input.envoyeeLe);
  const limite = dateEnToutesLettres(input.dateLimite);
  /**
   * ⚠ « nous vous renverrons une nouvelle demande », et non « le document devra
   * être réémis » (retour n°4 de Laurent, 11/09/2026). La seconde formule met
   * la charge sur le destinataire et décrit une mécanique interne ; la première
   * dit qui fait quoi. Personne, dehors, ne « réémet » un document.
   */
  const cloture = dernier
    ? `C'est notre dernier rappel automatique : passé le ${limite}, le lien expire et nous ` +
      `vous renverrons une nouvelle demande.`
    : `Si vous avez déjà signé, ce message ne vous concerne plus.`;

  const role = phraseDeRole(input.qualiteSignataire, input.organisation);

  const corps = [
    paragraphe(`Bonjour ${input.signataireNom},`),
    paragraphe(
      `Un document envoyé le ${envoyee} attend toujours votre signature. Il reste ` +
        `signable jusqu'au ${limite}.`,
    ),
    encadrePiece(input.libellePiece, input.formationTitre, input.sessionCode),
    paragraphe(`${role} ${cloture}`),
  ].join('\n');

  const text = [
    `Bonjour ${input.signataireNom},`,
    ``,
    `Un document envoyé le ${envoyee} attend toujours votre signature.`,
    `Il reste signable jusqu'au ${limite}.`,
    ``,
    `- Document : ${input.libellePiece}`,
    `- Formation : ${input.formationTitre}`,
    `- Session : ${input.sessionCode}`,
    ``,
    role,
    cloture,
    ``,
    `Votre lien personnel de signature :`,
    input.signUrl,
    ``,
    RASSURANCE_SIGNATURE,
    ``,
    ...blocSignatureTexte(input.expediteur, of),
  ].join('\n');

  return {
    subject,
    html: coquilleHtml(
      {
        subject,
        titre: dernier ? 'Dernier rappel avant expiration' : 'Votre signature est attendue',
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
