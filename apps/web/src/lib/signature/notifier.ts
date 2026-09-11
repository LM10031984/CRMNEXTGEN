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
import type { QualiteSignataire } from '@/lib/mailer-templates/signature-email-commun';
import type { ResultatNotification, SignataireEnvoye } from './envoi-contrats';
import type { SignerRole } from './regime';

export type { MotifNonEnvoi, ResultatNotification } from './envoi-contrats';

export interface NotifierSignataireArgs {
  tenantId: string;
  sessionId: string;
  signatureRequestId: string;
  documentId: string;
  /** Le libellé du plan — « Convention — AGENCE MARTIN (2 participants) ». */
  libellePiece: string;
  formationTitre: string;
  sessionCode: string;
  /** `SignatureRequest.expiresAt`. */
  dateLimite: Date;
  /** Le rôle au sens du RÉGIME. Décide du MOT, jamais du destinataire. */
  role: SignerRole;
  /** DÉJÀ TRIÉE par ordre de signature. Le rang 0 est le destinataire. */
  signataires: readonly SignataireEnvoye[];
  of: OfConfig;
}

/** Une chaîne utile, ou `null`. Un lien fait d'espaces est un lien absent. */
function texteUtile(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
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
async function tracer(
  args: NotifierSignataireArgs,
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
    libellePiece: args.libellePiece,
    formationTitre: args.formationTitre,
    sessionCode: args.sessionCode,
    signUrl: lien,
    dateLimite: args.dateLimite,
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
