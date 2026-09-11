/**
 * Gabarits 3 et 4 — les relances J+3 et J+7 (D-5).
 *
 * ⚠ **CE GABARIT N'A ENCORE AUCUN APPELANT**, et c'est écrit ici pour que
 * personne ne le croie branché. Son déclencheur est le cron
 * `signature-reminders`, qui lit `SignatureRequest.sentAt` / `reminderCount` —
 * du lot C.3. Décision Laurent du 11/09/2026 : écrire et PROUVER les cinq
 * gabarits maintenant, en brancher deux, brancher les trois autres avec le
 * retour du prestataire. La preuve en dry-run
 * (`.planning/specs/evidence/signature-C/`) le dit explicitement.
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
  LIBELLE_QUALITE,
  coquilleHtml,
  dateEnToutesLettres,
  encadrePiece,
  paragraphe,
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
  const prefixe = dernier ? 'Dernier rappel' : 'Rappel';
  const subject = `${prefixe} — ${input.libellePiece} attend votre signature`;

  const envoyee = dateEnToutesLettres(input.envoyeeLe);
  const limite = dateEnToutesLettres(input.dateLimite);
  const cloture = dernier
    ? `C'est notre dernier rappel automatique : passé le ${limite}, le lien expire et ` +
      `le document devra être réémis.`
    : `Si vous avez déjà signé, ce message ne vous concerne plus.`;

  const corps = [
    paragraphe(`Bonjour ${input.signataireNom},`),
    paragraphe(
      `Un document envoyé le ${envoyee} attend toujours votre signature. Il reste ` +
        `signable jusqu'au ${limite}.`,
    ),
    encadrePiece(input.libellePiece, input.formationTitre, input.sessionCode),
    paragraphe(
      `Vous recevez ce message en qualité de ${LIBELLE_QUALITE[input.qualiteSignataire]}. ${cloture}`,
    ),
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
    `Vous recevez ce message en qualité de ${LIBELLE_QUALITE[input.qualiteSignataire]}.`,
    dernier
      ? `C'est notre dernier rappel automatique : passé cette date, le lien expire.`
      : `Si vous avez déjà signé, ce message ne vous concerne plus.`,
    ``,
    `Votre lien personnel de signature :`,
    input.signUrl,
    ``,
    `L'équipe ${of.name}`,
  ].join('\n');

  return {
    subject,
    html: coquilleHtml(
      {
        subject,
        titre: dernier ? 'Dernier rappel avant expiration' : 'Votre signature est attendue',
        corps,
        bouton: { href: input.signUrl, libelle: 'Signer le document' },
      },
      of,
    ),
    text,
  };
}
