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
import type { DocTypeSignable } from '@/lib/signature/regime';

export const BRAND_DARK = '#00527A';
export const BRAND_LIGHT_BG = '#F0F9FF';

/** Une chaîne utile, ou `null`. Un champ rempli d'espaces est un champ vide. */
export function texteUtile(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

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

/**
 * Le REPLI, quand l'organisation n'est pas connue. La phrase normale la NOMME
 * (cf. `phraseDeRole`) — c'est le retour n°1 de Laurent du 11/09/2026 : « en
 * qualité de responsable de l'organisation » est administratif, « en tant que
 * responsable de AGENCE MARTIN » parle à quelqu'un.
 */
export const LIBELLE_QUALITE: Record<QualiteSignataire, string> = {
  'responsable-organisation': "responsable de l'organisation",
  stagiaire: 'stagiaire',
  of: "signataire de l'organisme de formation",
};

/**
 * La phrase qui dit au destinataire POURQUOI il reçoit ce message.
 *
 * Une fonction, et non trois chaînes : les trois formes n'ont pas la même
 * structure — l'une interpole l'organisation, l'autre parle d'inscription, la
 * troisième est interne. Les aplatir en dictionnaire obligerait chaque gabarit
 * à recomposer, et c'est précisément ce qui finit écrit de trois façons.
 *
 * ⚠ Organisation inconnue ⇒ repli sur `LIBELLE_QUALITE`. Jamais « responsable
 * de null » dans un email que lira un financeur.
 */
export function phraseDeRole(qualite: QualiteSignataire, organisation: string | null): string {
  if (qualite === 'of') {
    return `Vous recevez ce message en qualité de ${LIBELLE_QUALITE.of}.`;
  }
  if (qualite === 'stagiaire') {
    return 'Vous recevez ce message en tant que stagiaire, pour votre propre inscription.';
  }
  const org = texteUtile(organisation);
  if (org === null) {
    return `Vous recevez ce message en tant que ${LIBELLE_QUALITE['responsable-organisation']}.`;
  }
  return `Vous recevez ce message en tant que responsable de ${org}.`;
}

/**
 * Le nom de la pièce, dans les DEUX formes dont les objets ont besoin.
 *
 * `titre` ouvre un objet (« Convention à signer — … ») ; `possessif` se glisse
 * après « votre » (« Rappel : votre convention attend votre signature »). Deux
 * formes parce que le français en a deux — les dériver l'une de l'autre par une
 * minuscule marcherait pour « Convention » et casserait sur « Dossier AGEFICE ».
 */
export const NOM_DE_PIECE: Record<DocTypeSignable, { titre: string; possessif: string }> = {
  CONVENTION: { titre: 'Convention', possessif: 'convention' },
  AGEFICE: { titre: 'Dossier AGEFICE', possessif: 'dossier AGEFICE' },
  ASSIDUITE: { titre: "Attestation d'assiduité", possessif: "attestation d'assiduité" },
};

/**
 * Qui signe l'email — retour n°4 de Laurent (11/09/2026). Une personne, jamais
 * « L'équipe » : le destinataire doit savoir à qui il répond, et pouvoir
 * décrocher son téléphone.
 *
 * Le nom vient des réglages tenant (`Tenant.signatoryName`, sinon le
 * responsable d'of-config) — le MÊME que celui qui signera le document. Deux
 * résolutions divergeraient, et l'email serait signé par quelqu'un d'autre que
 * le PDF.
 */
export interface Expediteur {
  nom: string;
  /** `null` quand aucun téléphone n'est configuré : la ligne disparaît. */
  telephone: string | null;
}

/**
 * La phrase qui rassure sur le GESTE — retour n°3 de Laurent (11/09/2026).
 *
 * ⚠ « Répondez simplement à ce message » n'est vrai que si l'expéditeur accepte
 * les réponses. `MAIL_FROM` / `MAIL_REPLY_TO` doivent pointer une boîte lue.
 * Une promesse d'email est aussi une promesse d'exploitation.
 */
export const RASSURANCE_SIGNATURE =
  'La signature prend deux minutes, depuis un ordinateur ou un téléphone, sans créer de ' +
  'compte. Une question ? Répondez simplement à ce message.';

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
  /**
   * Ce qui se lit APRÈS le bouton — la rassurance sur le geste. Après, et pas
   * avant : elle répond à la question qu'on se pose une fois le bouton vu.
   */
  apresBouton?: string;
  /** Qui signe. Obligatoire : un email de signature sans expéditeur nommé
   *  renvoie le destinataire vers personne. */
  expediteur: Expediteur;
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

  const apresBoutonHtml =
    input.apresBouton === undefined
      ? ''
      : `      <p style="margin:0 0 16px 0; font-size:10pt; color:#475569;">${escapeHtml(input.apresBouton)}</p>`;

  const telephone = texteUtile(input.expediteur.telephone);
  const signatureHtml = `      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        ${escapeHtml(input.expediteur.nom)} — ${escapeHtml(of.name)}${
          telephone === null ? '' : `<br>${escapeHtml(telephone)}`
        }
      </p>`;

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
${apresBoutonHtml}
${signatureHtml}
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

/** La signature, en texte brut. Mêmes lignes que la version HTML. */
export function blocSignatureTexte(expediteur: Expediteur, of: OfConfig): string[] {
  const telephone = texteUtile(expediteur.telephone);
  const lignes = [`${expediteur.nom} — ${of.name}`];
  if (telephone !== null) lignes.push(telephone);
  return lignes;
}

/** Un paragraphe de corps, échappé. */
export function paragraphe(texte: string): string {
  return `      <p style="margin:0 0 16px 0;">${escapeHtml(texte)}</p>`;
}
