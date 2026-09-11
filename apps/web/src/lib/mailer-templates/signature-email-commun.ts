/**
 * La mise en page PARTAGÉE des emails de la chaîne de signature — lot C.2c.
 *
 * POURQUOI UN SEUL BLOC DE MISE EN PAGE POUR CINQ GABARITS. Deux mises en page
 * divergent au premier ajustement : une couleur corrigée ici, un pied de page
 * complété là, et la demande de signature ne ressemble plus à l'exemplaire
 * signé qui la clôt — alors que le destinataire, lui, les reçoit à la suite.
 *
 * POURQUOI LE VOCABULAIRE VIT ICI, ET PAS DANS CHAQUE GABARIT. « Responsable de
 * l'organisation » est écrit dans des pièces que des financeurs liront. Une
 * chaîne recopiée à cinq endroits finit écrite de cinq façons. Un seul
 * dictionnaire, `LIBELLE_QUALITE`, et une garde exécutable qui interdit le mot
 * « dirigeant » dans tout ce que ce lot produit (spec §3 ter, Laurent
 * 11/09/2026) : le champ `Organization.representative` dit seulement qui
 * représente l'organisation et signe ses conventions — il n'affirme aucune
 * qualité juridique.
 *
 * PUR : ni réseau, ni base, ni horloge implicite. Les dates sont REÇUES.
 */

import type { OfConfig } from '@/lib/of-config';

export const BRAND_DARK = '#00527A';
export const BRAND_LIGHT_BG = '#F0F9FF';

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Comment on nomme le destinataire. REÇUE par le gabarit, jamais re-dérivée :
 * le rôle d'ancre du PDF dit `Client` y compris pour un indépendant qui signe
 * sa propre convention (`ANCRES_PAR_PIECE`), donc le déduire de lui
 * l'appellerait « responsable de l'organisation » alors qu'il est le stagiaire.
 * C'est l'amendement n°6 du lot C, revenu par la porte du vocabulaire.
 */
export type QualiteSignataire = 'responsable-organisation' | 'stagiaire' | 'of';

export const LIBELLE_QUALITE: Record<QualiteSignataire, string> = {
  'responsable-organisation': "responsable de l'organisation",
  stagiaire: 'stagiaire',
  of: "signataire de l'organisme de formation",
};

/**
 * Une date en toutes lettres. Fuseau FIXÉ à Europe/Paris : sans lui, le même
 * envoi rendrait « 11 octobre » sur le Mac et « 10 octobre » sur un serveur en
 * UTC-5, et c'est une date limite contractuelle.
 */
export function dateEnToutesLettres(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(d);
}

export interface CoquilleInput {
  subject: string;
  titre: string;
  /** Fragments HTML déjà échappés par l'appelant. */
  corps: string;
  /** Le SEUL bouton de l'email, quand il y en a un. */
  bouton?: { href: string; libelle: string };
}

/**
 * L'enveloppe HTML commune. Elle ne pose AUCUN lien d'elle-même — ni vers
 * QualiOF, ni vers un site : le responsable d'une agence n'a pas de compte, et
 * un second lien dans un email de signature est un second endroit où cliquer
 * par erreur. Le seul `href` possible est celui que l'appelant passe.
 */
export function coquilleHtml(input: CoquilleInput, of: OfConfig): string {
  const { subject, titre, corps, bouton } = input;
  const boutonHtml =
    bouton === undefined
      ? ''
      : `<div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(bouton.href)}" style="display:inline-block; background:${BRAND_DARK}; color:white; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:11pt;">
          ${escapeHtml(bouton.libelle)}
        </a>
      </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#F1F5F9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">
  <div style="max-width:600px; margin:24px auto; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${BRAND_DARK}; padding:28px 32px; text-align:center; color:white;">
      <h1 style="margin:0; font-size:18pt; font-weight:700; letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>

    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0; font-size:16pt; color:${BRAND_DARK};">${escapeHtml(titre)}</h2>
${corps}
${boutonHtml}
      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        L&#39;équipe ${escapeHtml(of.name)}
      </p>
    </div>

    <div style="background:#F8FAFC; padding:16px 32px; border-top:1px solid #E2E8F0; font-size:9pt; color:#64748B; text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
      ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
    </div>
  </div>
</body>
</html>`;
}

/** Le bloc « de quelle pièce parle-t-on » — identique dans les cinq gabarits. */
export function encadrePiece(libellePiece: string, formationTitre: string, sessionCode: string): string {
  return `      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:16px 0;">
        <strong style="font-size:12pt; color:${BRAND_DARK};">${escapeHtml(libellePiece)}</strong>
        <ul style="margin:8px 0 0 0; padding-left:18px; font-size:10pt;">
          <li>Formation : ${escapeHtml(formationTitre)}</li>
          <li>Session : ${escapeHtml(sessionCode)}</li>
        </ul>
      </div>`;
}

/** Un paragraphe de corps, échappé. */
export function paragraphe(texte: string): string {
  return `      <p style="margin:0 0 16px 0;">${escapeHtml(texte)}</p>`;
}
