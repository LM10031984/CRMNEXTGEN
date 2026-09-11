/**
 * Le SEUL point d'envoi des emails de la chaîne de signature — lot C.2c.
 *
 * POURQUOI UN SEUL. `sendForSignature` l'appelle aujourd'hui ; le cron des
 * relances et le webhook de complétion l'appelleront au lot C.3. Deux points
 * d'envoi finiraient par diverger sur la catégorie, sur le masquage des
 * adresses ou sur la trace — et c'est un email qui sort de la maison, vers un
 * destinataire dont l'adresse entrera dans un certificat de signature.
 *
 * QUI EST PRÉVENU : `signataires[0]`, et rien d'autre. La liste est DÉJÀ TRIÉE
 * par ordre de signature côté `sendForSignature` (`signers.sort` sur `order`),
 * lui-même posé par la règle D-3/D-8. Chercher ici « celui dont la partie vaut
 * CLIENT » serait une SECONDE règle de choix : avec `signatoryOrder = BEFORE`,
 * c'est l'organisme qui signe en premier, et prévenir le client à sa place lui
 * enverrait un lien qui ne s'ouvrira qu'après le passage de l'autre.
 *
 * QUALITÉ DU DESTINATAIRE : traduite UNE fois, ici, depuis le `SignerRole` du
 * RÉGIME — jamais depuis le nom d'ancre. Le gabarit de convention n'écrit que
 * `Client`, y compris pour un indépendant qui signe pour lui-même : dériver de
 * l'ancre l'appellerait « responsable de l'organisation » alors qu'il est le
 * stagiaire. C'est l'amendement n°6 du lot C, revenu par le vocabulaire.
 *
 * CE MODULE N'ÉCHOUE PAS L'ENVOI. Un SMTP en panne ne doit pas faire annuler
 * une demande créée chez le prestataire : ce serait disproportionné, et le lien
 * reste copiable à l'écran. Il rend donc toujours un `ResultatNotification`.
 */

import { prisma } from '@qualiof/db';
import type { OfConfig } from '@/lib/of-config';
import { sendMail } from '@/lib/mailer';
import {
  renderSignatureDemandeClient,
  renderSignatureDemandeOf,
  type SignatureDemandeInput,
} from '@/lib/mailer-templates/signature-demande';
import { renderSignatureExemplaire } from '@/lib/mailer-templates/signature-exemplaire';
import {
  renderSignatureRelance,
  type RangRelance,
} from '@/lib/mailer-templates/signature-relance';
import type {
  Expediteur,
  QualiteSignataire,
} from '@/lib/mailer-templates/signature-email-commun';
import type { ResultatNotification, SignataireEnvoye } from './envoi-contrats';
import type { DocTypeSignable, SignerRole } from './regime';

export type { MotifNonEnvoi, ResultatNotification } from './envoi-contrats';

export interface NotifierSignataireArgs {
  tenantId: string;
  sessionId: string;
  signatureRequestId: string;
  documentId: string;
  /** Le libellé du plan — « Convention — AGENCE MARTIN (2 participants) ». */
  libellePiece: string;
  /** Le TYPE de pièce : décide de l'objet (« Convention à signer — … »). */
  piece: DocTypeSignable;
  /** QUI la pièce concerne : l'organisation pour une convention, l'apprenant sinon. */
  concerne: string;
  /** L'organisation bénéficiaire, nommée dans la phrase de rôle. `null` si inconnue. */
  organisation: string | null;
  formationTitre: string;
  sessionCode: string;
  /** `SignatureRequest.expiresAt`. */
  dateLimite: Date;
  /** Le rôle au sens du RÉGIME. Décide du MOT, jamais du destinataire. */
  role: SignerRole;
  /** DÉJÀ TRIÉE par ordre de signature. Le rang 0 est le destinataire. */
  signataires: readonly SignataireEnvoye[];
  of: OfConfig;
  /**
   * Le nom du signataire de l'ORGANISME, tel que `resoudreSignataireOf` l'a
   * résolu pour cet envoi (`Tenant.signatoryName`, sinon le responsable
   * d'of-config). `null` quand la pièce n'ouvre pas d'ancre organisme et que la
   * résolution n'a donc pas eu lieu.
   *
   * ⚠ REÇU, jamais re-résolu ici. L'email doit être signé par la personne qui
   * signe le document : deux résolutions de la même question finiraient par
   * donner deux noms, et le destinataire verrait l'un dans sa boîte et l'autre
   * dans le PDF.
   */
  signataireOfNom: string | null;
}

/** Une chaîne utile, ou `null`. Un lien fait d'espaces est un lien absent. */
function texteUtile(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

/**
 * Qui signe l'email — retour n°4 de Laurent (11/09/2026) : une personne, jamais
 * « L'équipe ». Le nom vient des réglages tenant ; à défaut, du responsable
 * d'of-config ; en dernier recours, du nom de l'organisme — un email doit
 * toujours être signé par quelque chose de nommable.
 */
function expediteurDe(of: OfConfig, signataireOfNom: string | null): Expediteur {
  const respNom = texteUtile(
    `${texteUtile(of.resp?.prenom) ?? ''} ${texteUtile(of.resp?.nom) ?? ''}`.trim(),
  );
  return {
    nom: texteUtile(signataireOfNom) ?? respNom ?? of.name,
    telephone: texteUtile(of.resp?.phone) ?? texteUtile(of.phone),
  };
}

/**
 * Le mot employé pour nommer le destinataire. Deux entrées seulement du côté
 * bénéficiaire : le régime ne connaît que `DIRIGEANT` et `STAGIAIRE`.
 *
 * ⚠ `DIRIGEANT` est la valeur d'ENUM, elle ne bouge pas (renommage textuel,
 * jamais structurel — spec §3 ter). C'est le LIBELLÉ qui dit « responsable de
 * l'organisation ».
 */
function qualiteDe(partie: SignataireEnvoye['partie'], role: SignerRole): QualiteSignataire {
  if (partie === 'OF') return 'of';
  return role === 'DIRIGEANT' ? 'responsable-organisation' : 'stagiaire';
}

/**
 * Écrit la trace, et ne relance JAMAIS. L'email EST parti : perdre la trace est
 * ennuyeux, faire croire à un échec le serait davantage. Modèle exact de
 * `tracerDocumentsEnvoyes` dans `mailer.ts`.
 *
 * ⚠ Le destinataire y est EN CLAIR, comme dans `signature.sent` : un journal
 * d'audit qui masquerait ne prouverait plus rien.
 */
interface ContexteTrace {
  tenantId: string;
  sessionId: string;
  signatureRequestId: string;
  documentId: string;
  libellePiece: string;
}

async function tracer(
  args: ContexteTrace,
  signataire: SignataireEnvoye,
  resultat: ResultatNotification,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        entity: 'Document',
        entityId: args.documentId,
        action: 'signature.notified',
        diff: {
          signatureRequestId: args.signatureRequestId,
          sessionId: args.sessionId,
          libelle: args.libellePiece,
          partie: signataire.partie,
          role: signataire.role,
          destinataire: signataire.email,
          envoye: resultat.envoye,
          motif: resultat.motif,
        },
      },
    });
  } catch (e) {
    console.error(
      '[signature:notifier] trace non enregistrée :',
      e instanceof Error ? e.message : e,
    );
  }
}

export async function notifierSignataire(
  args: NotifierSignataireArgs,
): Promise<ResultatNotification> {
  const signataire = args.signataires[0];
  if (signataire === undefined) {
    // Inatteignable en pratique : un envoi sans signataire est refusé bien
    // avant (`SIGNATAIRE_SANS_EMAIL`). On rend un résultat plutôt que de lever.
    return { envoye: false, destinataire: '', partie: 'CLIENT', motif: 'aucun-lien' };
  }

  const lien = texteUtile(signataire.signUrl);
  if (lien === null) {
    const resultat: ResultatNotification = {
      envoye: false,
      destinataire: signataire.email,
      partie: signataire.partie,
      motif: 'aucun-lien',
    };
    await tracer(args, signataire, resultat);
    return resultat;
  }

  const entree: SignatureDemandeInput = {
    signataireNom: signataire.nom,
    qualiteSignataire: qualiteDe(signataire.partie, args.role),
    piece: args.piece,
    concerne: args.concerne,
    organisation: args.organisation,
    libellePiece: args.libellePiece,
    formationTitre: args.formationTitre,
    sessionCode: args.sessionCode,
    signUrl: lien,
    dateLimite: args.dateLimite,
    expediteur: expediteurDe(args.of, args.signataireOfNom),
  };
  const rendu =
    signataire.partie === 'OF'
      ? renderSignatureDemandeOf(entree, args.of)
      : renderSignatureDemandeClient(entree, args.of);

  const envoi = await sendMail({
    to: signataire.email,
    subject: rendu.subject,
    html: rendu.html,
    text: rendu.text,
    context: {
      tenantId: args.tenantId,
      category: 'signature',
      sessionId: args.sessionId,
      // ⚠ PAS de `documentIds` : rien n'est joint à cet email. Un `documentIds`
      // non vide écrirait une ligne `EmailMessage` affirmant qu'un PDF a quitté
      // la maison — et cette ligne est précisément ce qui gèle la régénération
      // d'un document « engagé ». C'est un LIEN qui est parti, pas un PDF.
      relatedEntity: `signatureRequest:${args.signatureRequestId}`,
    },
  });

  const resultat: ResultatNotification = {
    envoye: envoi.ok === true && envoi.dryRun !== true,
    destinataire: signataire.email,
    partie: signataire.partie,
    motif: null,
  };
  if (!resultat.envoye) {
    // L'ordre compte : une suppression par réglages arrive elle aussi avec
    // `dryRun: true`. C'est `suppressed` qui les sépare, et les deux n'appellent
    // pas le même geste — recocher une case, ou configurer un SMTP.
    if (envoi.ok !== true) resultat.motif = 'erreur-smtp';
    else if (envoi.suppressed === true) resultat.motif = 'categorie-decochee';
    else resultat.motif = 'dry-run-env';
  }

  await tracer(args, signataire, resultat);
  return resultat;
}

// ─── L'exemplaire signé (lot C.3) ────────────────────────────────────────────

/** Un fichier réellement joint à l'email — nom ET octets. */
export interface PieceJointeEnvoyee {
  filename: string;
  content: Buffer;
}

export interface NotifierExemplaireArgs {
  tenantId: string;
  sessionId: string;
  signatureRequestId: string;
  documentId: string;
  piece: DocTypeSignable;
  concerne: string;
  organisation: string | null;
  libellePiece: string;
  formationTitre: string;
  sessionCode: string;
  signeLe: Date;
  /**
   * Le régime qui a décidé l'envoi, mémorisé sur la demande. `null` ⇒ on
   * n'envoie RIEN : voir ci-dessous.
   */
  role: SignerRole | null;
  /** TOUS les signataires de la pièce — et personne d'autre. */
  destinataires: readonly SignataireEnvoye[];
  of: OfConfig;
  signataireOfNom: string | null;
  piecesJointes: readonly PieceJointeEnvoyee[];
}

/**
 * « Voici votre exemplaire signé » — un email par SIGNATAIRE de la pièce.
 *
 * AUX SEULS SIGNATAIRES, et c'est une règle, pas une limite. Une session de six
 * salariés financés OPCO EP produit DEUX emails : un au responsable de
 * l'organisation, un à l'organisme. Zéro aux six stagiaires — ils ne signent
 * rien, leur information passe par la convocation, et leur envoyer la convention
 * d'entreprise ferait entrer leur email dans un dossier qui nomme quelqu'un
 * d'autre (amendement n°3 du lot C).
 *
 * ⚠ ICI, `documentIds` EST PASSÉ — contrairement à la demande de signature. Ce
 * n'est pas une incohérence : un PDF quitte RÉELLEMENT la maison, et la ligne
 * `EmailMessage` qui en résulte est la seule preuve que l'application en garde.
 * C'est elle qui alimente ensuite la règle « document engagé ».
 *
 * ⚠ `role === null` ⇒ AUCUN EMAIL. Le régime est ce qui décide du mot employé
 * pour nommer le destinataire ; sans lui, on l'appellerait « responsable de
 * l'organisation » alors qu'il est peut-être le stagiaire qui signe sa propre
 * convention. Une pièce lue par un financeur ne se devine pas. Le cas ne peut
 * survenir que sur une demande créée avant la migration `signerRole`.
 */
export async function notifierExemplaireSigne(
  args: NotifierExemplaireArgs,
): Promise<ResultatNotification[]> {
  if (args.role === null) {
    return args.destinataires.map((s) => ({
      envoye: false,
      destinataire: s.email,
      partie: s.partie,
      motif: 'regime-inconnu' as const,
    }));
  }

  const expediteur = expediteurDe(args.of, args.signataireOfNom);
  const attachments = args.piecesJointes.map((f) => ({
    filename: f.filename,
    content: f.content,
    contentType: 'application/pdf',
  }));

  const resultats: ResultatNotification[] = [];
  for (const signataire of args.destinataires) {
    const rendu = renderSignatureExemplaire(
      {
        signataireNom: signataire.nom,
        qualiteSignataire: qualiteDe(signataire.partie, args.role),
        piece: args.piece,
        concerne: args.concerne,
        organisation: args.organisation,
        libellePiece: args.libellePiece,
        formationTitre: args.formationTitre,
        sessionCode: args.sessionCode,
        signeLe: args.signeLe,
        piecesJointes: args.piecesJointes.map((f) => f.filename),
        expediteur,
      },
      args.of,
    );

    const envoi = await sendMail({
      to: signataire.email,
      subject: rendu.subject,
      html: rendu.html,
      text: rendu.text,
      attachments,
      context: {
        tenantId: args.tenantId,
        category: 'signature',
        sessionId: args.sessionId,
        documentIds: [args.documentId],
        relatedEntity: `signatureRequest:${args.signatureRequestId}`,
      },
    });

    const resultat: ResultatNotification = {
      envoye: envoi.ok === true && envoi.dryRun !== true,
      destinataire: signataire.email,
      partie: signataire.partie,
      motif: null,
    };
    if (!resultat.envoye) {
      if (envoi.ok !== true) resultat.motif = 'erreur-smtp';
      else if (envoi.suppressed === true) resultat.motif = 'categorie-decochee';
      else resultat.motif = 'dry-run-env';
    }
    resultats.push(resultat);

    await tracer(args, signataire, resultat);
  }
  return resultats;
}

// ─── La relance (lot C.3, D-5) ───────────────────────────────────────────────

export interface NotifierRelanceArgs extends NotifierSignataireArgs {
  /** 1 = J+3, 2 = J+7 (dernier rappel). Au-delà, plus rien ne part. */
  rang: RangRelance;
  /** `SignatureRequest.sentAt` — la relance rappelle QUAND la demande est partie. */
  envoyeeLe: Date;
}

/**
 * Relance le signataire dont c'est le tour — même chemin, même catégorie, même
 * trace que la demande initiale.
 *
 * ⚠ ELLE RENVOIE LE MÊME LIEN, jamais un lien régénéré : en fabriquer un second
 * ouvrirait une seconde demande chez le prestataire, et le premier lien
 * continuerait de vivre. Deux liens sur une pièce contractuelle, c'est deux
 * preuves possibles.
 */
export async function notifierRelance(args: NotifierRelanceArgs): Promise<ResultatNotification> {
  const signataire = args.signataires[0];
  if (signataire === undefined) {
    return { envoye: false, destinataire: '', partie: 'CLIENT', motif: 'aucun-lien' };
  }
  const lien = texteUtile(signataire.signUrl);
  if (lien === null) {
    const resultat: ResultatNotification = {
      envoye: false,
      destinataire: signataire.email,
      partie: signataire.partie,
      motif: 'aucun-lien',
    };
    await tracer(args, signataire, resultat);
    return resultat;
  }

  const rendu = renderSignatureRelance(
    {
      signataireNom: signataire.nom,
      qualiteSignataire: qualiteDe(signataire.partie, args.role),
      piece: args.piece,
      concerne: args.concerne,
      organisation: args.organisation,
      libellePiece: args.libellePiece,
      formationTitre: args.formationTitre,
      sessionCode: args.sessionCode,
      signUrl: lien,
      dateLimite: args.dateLimite,
      expediteur: expediteurDe(args.of, args.signataireOfNom),
      rang: args.rang,
      envoyeeLe: args.envoyeeLe,
    },
    args.of,
  );

  const envoi = await sendMail({
    to: signataire.email,
    subject: rendu.subject,
    html: rendu.html,
    text: rendu.text,
    context: {
      tenantId: args.tenantId,
      category: 'signature',
      sessionId: args.sessionId,
      relatedEntity: `signatureRequest:${args.signatureRequestId}`,
    },
  });

  const resultat: ResultatNotification = {
    envoye: envoi.ok === true && envoi.dryRun !== true,
    destinataire: signataire.email,
    partie: signataire.partie,
    motif: null,
  };
  if (!resultat.envoye) {
    if (envoi.ok !== true) resultat.motif = 'erreur-smtp';
    else if (envoi.suppressed === true) resultat.motif = 'categorie-decochee';
    else resultat.motif = 'dry-run-env';
  }
  await tracer(args, signataire, resultat);
  return resultat;
}
