/**
 * « Peut-on encore changer le financeur de cette inscription ? » — module PUR.
 *
 * POURQUOI CE FICHIER EXISTE. Jusqu'ici, une inscription rattachée au mauvais
 * commanditaire était INCORRIGIBLE : `EditParticipantButton` éditait le prix, le
 * statut, la date et le MODE de financement, jamais `sponsorOrgId`. Le seul
 * recours était de désinscrire puis réinscrire — donc de perdre la ligne, ses
 * documents rattachés et son historique. Décision Laurent du 11/09/2026
 * (retours d'écran C.2b, point 7) : le champ devient éditable.
 *
 * MAIS PAS TOUJOURS. Le commanditaire n'est pas un champ de confort : c'est lui
 * que `participants-regime.ts` lit (`sponsorOrg.opcoCode`) pour décider QUI
 * signe QUOI, c'est lui que la convention imprime, et c'est lui que le dossier
 * de prise en charge désigne. Deux situations où le changer après coup
 * fabriquerait un mensonge plutôt que de corriger une erreur :
 *
 *  1. UN DOSSIER EST DÉJÀ PARTI CHEZ LE FINANCEUR. `SENT`, `ACK_RECEIVED`,
 *     `APPROVED`, `REIMBURSED` : quelqu'un, dehors, a reçu ce dossier au nom de
 *     cette organisation. Changer l'inscription de son côté ferait diverger
 *     l'inscription et le dossier sans que personne ne le voie.
 *     `DRAFT`, `REJECTED`, `CANCELED` ne bloquent PAS, et c'est délibéré : un
 *     brouillon n'est parti nulle part, et un dossier refusé ou annulé est
 *     EXACTEMENT celui qu'on veut re-rattacher correctement avant de le
 *     resoumettre. Interdire là serait interdire la réparation.
 *
 *  2. UNE PIÈCE EST DÉJÀ SIGNÉE. Une convention signée nomme l'entreprise
 *     bénéficiaire. Le PDF signé fait foi (spec signature §4.4) ; on ne peut
 *     pas le contredire en base.
 *
 *  3. UNE PIÈCE EST PARTIE EN SIGNATURE ÉLECTRONIQUE (11/09/2026, lot C.2b-10).
 *     `Document.status = 'sent_for_signature'` : une demande est ouverte chez le
 *     prestataire et le PDF que le signataire a sous les yeux nomme DÉJÀ
 *     l'entreprise bénéficiaire. Changer le commanditaire pendant ce temps, ce
 *     n'est pas corriger une erreur : c'est faire signer un document qui ne
 *     correspond plus à la base — et si la signature aboutit, le mur n°2 se
 *     referme dessus sans que personne n'ait vu passer la divergence.
 *
 *     ⚠ CE MUR-LÀ A UNE PORTE, et c'est pour ça qu'il est nommé EN DERNIER.
 *     `annulerEnvoiSignature` (lot C.2b-bis) le fait tomber d'un clic depuis le
 *     bloc « Signature » de la fiche session. Le nommer avant les deux autres
 *     enverrait l'admin annuler un envoi pour découvrir juste après une
 *     convention signée que rien ne lève : un mur derrière l'autre. On nomme
 *     toujours le refus le plus dur en premier.
 *
 * PUR : ni Prisma, ni réseau, ni horloge. L'action `changerFinanceurInscription`
 * lit la base et lui passe ce qu'elle a lu. Le refus est TOUJOURS nominatif —
 * jamais un `return { ok: false }` muet : l'admin doit savoir QUI est bloqué,
 * par QUOI, et quoi faire ensuite.
 */

import { DOC_TYPE_LABELS } from '@/lib/doc-scope';

/**
 * Les statuts `OpcoSubmissionStatus` qui interdisent le changement : le dossier
 * est sorti de la maison.
 */
export const STATUTS_OPCO_BLOQUANTS = [
  'SENT',
  'ACK_RECEIVED',
  'APPROVED',
  'REIMBURSED',
] as const;

/**
 * Les statuts qui n'interdisent RIEN. Écrits en dur ici (plutôt que déduits par
 * complément) pour que l'ajout d'un statut à l'enum Prisma ne les fasse pas
 * basculer silencieusement d'un camp à l'autre : un nouveau statut inconnu sera
 * non bloquant ET absent de cette liste, ce que le test de sanité repère.
 */
export const STATUTS_OPCO_NON_BLOQUANTS = ['DRAFT', 'REJECTED', 'CANCELED'] as const;

/** Libellés FR des statuts bloquants — le refus cite le statut, pas son code. */
const LIBELLE_STATUT_OPCO: Record<string, string> = {
  SENT: 'envoyé au financeur',
  ACK_RECEIVED: 'accusé de réception reçu',
  APPROVED: 'accord de prise en charge reçu',
  REIMBURSED: 'remboursé',
};

/** Le statut `Document.status` qui vaut signature, même sans PDF signé stocké. */
export const STATUT_DOCUMENT_SIGNE = 'signed';

/**
 * Le statut posé par `sendForSignature` et levé par `annulerEnvoiSignature` ou
 * par le webhook du lot C.3. Même chaîne que `STATUT_ENVOYE` de
 * `server/actions/signature-envoi.ts` : la colonne est une String (§4.1), il n'y
 * a pas d'enum Prisma à importer ici — et ce module reste pur.
 */
export const STATUT_DOCUMENT_ENVOYE = 'sent_for_signature';

/** Un dossier de prise en charge, réduit à ce que le verrou en lit. */
export interface DossierFinanceurLu {
  id: string;
  status: string;
  /** `brandName ?? legalName` du destinataire, ou `null` si inconnu. */
  financeurLabel: string | null;
}

/** Une pièce produite pour cette inscription, réduite à ce que le verrou en lit. */
export interface PieceLue {
  id: string;
  /** `DocType` Prisma — sert à nommer la pièce dans le refus. */
  type: string;
  status: string;
  signedPdfUrl: string | null;
}

export type MotifVerrouFinanceur = 'DOSSIER_PARTI' | 'PIECE_SIGNEE' | 'PIECE_ENVOYEE';

export type VerrouFinanceur =
  | { bloque: false }
  | { bloque: true; motif: MotifVerrouFinanceur; message: string };

/** Une chaîne utile, ou `null`. Un champ rempli d'espaces est un champ vide. */
function texteUtile(valeur: string | null | undefined): string | null {
  const nettoye = (valeur ?? '').trim();
  return nettoye.length > 0 ? nettoye : null;
}

/** Un dossier est « parti » si son statut est l'un des quatre bloquants. */
export function dossierEstParti(statut: string): boolean {
  return (STATUTS_OPCO_BLOQUANTS as readonly string[]).includes(statut);
}

/**
 * Une pièce est signée si elle porte un PDF signé (scan manuel OU retour
 * prestataire) ou si son statut le dit. Les deux, parce que les deux existent :
 * `signedPdfUrl` est posé au dépôt du scan, `status` au retour du webhook.
 */
export function pieceEstSignee(piece: PieceLue): boolean {
  return texteUtile(piece.signedPdfUrl) !== null || piece.status === STATUT_DOCUMENT_SIGNE;
}

/**
 * Une pièce est PARTIE si une demande de signature est ouverte sur elle et
 * qu'aucune preuve n'est encore revenue. Les deux prédicats ne se recouvrent
 * jamais : depuis C.2b-3, déposer un scan sur une pièce en attente annule
 * l'envoi (« une pièce, un seul chemin ouvert »), donc `sent_for_signature` et
 * `signedPdfUrl` ne cohabitent pas. On le vérifie quand même, parce qu'un statut
 * qui traîne après une annulation ratée ne doit pas faire dire « annulez
 * l'envoi » devant une pièce déjà signée.
 */
export function pieceEstPartieEnSignature(piece: PieceLue): boolean {
  return piece.status === STATUT_DOCUMENT_ENVOYE && !pieceEstSignee(piece);
}

export function verrouChangementFinanceur(input: {
  nomParticipant: string;
  dossiers: readonly DossierFinanceurLu[];
  pieces: readonly PieceLue[];
}): VerrouFinanceur {
  const nom = texteUtile(input.nomParticipant) ?? 'cet apprenant';

  // Le dossier d'abord : c'est le blocage qui a une sortie (annuler / faire
  // rejeter), donc celui qu'il est le plus utile de nommer en premier.
  const dossierParti = input.dossiers.find((d) => dossierEstParti(d.status));
  if (dossierParti) {
    const financeur = texteUtile(dossierParti.financeurLabel);
    const chez = financeur === null ? 'chez le financeur' : `chez ${financeur}`;
    const statut = LIBELLE_STATUT_OPCO[dossierParti.status] ?? dossierParti.status;
    return {
      bloque: true,
      motif: 'DOSSIER_PARTI',
      message:
        `Financeur non modifiable pour ${nom} : son dossier de prise en charge ${chez} ` +
        `est déjà parti (statut « ${statut} »). Faites annuler ou refuser ce dossier ` +
        `(statut Annulé ou Refusé) avant de re-rattacher l'inscription — sinon le dossier ` +
        `et l'inscription ne désigneraient plus le même financeur.`,
    };
  }

  const pieceSignee = input.pieces.find((p) => pieceEstSignee(p));
  if (pieceSignee) {
    const libelle = DOC_TYPE_LABELS[pieceSignee.type]?.long ?? pieceSignee.type;
    return {
      bloque: true,
      motif: 'PIECE_SIGNEE',
      message:
        `Financeur non modifiable pour ${nom} : la pièce « ${libelle} » est déjà signée ` +
        `et nomme l'entreprise bénéficiaire — la changer maintenant la ferait mentir. ` +
        `Désinscrivez puis réinscrivez ${nom} avec le bon financeur, ou faites annuler ` +
        `cette signature, avant de corriger.`,
    };
  }

  // En dernier, et c'est délibéré (cf. point 3 du docblock) : seul mur des trois
  // qu'un clic fait tomber, donc seul mur qu'il serait trompeur de nommer avant
  // un autre qui, lui, ne tomberait pas.
  const piecePartie = input.pieces.find((p) => pieceEstPartieEnSignature(p));
  if (piecePartie) {
    const libelle = DOC_TYPE_LABELS[piecePartie.type]?.long ?? piecePartie.type;
    return {
      bloque: true,
      motif: 'PIECE_ENVOYEE',
      message:
        `Financeur non modifiable pour ${nom} : la pièce « ${libelle} » est partie en ` +
        `signature électronique et le document que le signataire a sous les yeux nomme ` +
        `déjà l'entreprise bénéficiaire. Annulez d'abord l'envoi en cours, depuis le bloc ` +
        `« Signature » de la fiche session, puis corrigez le financeur et renvoyez.`,
    };
  }

  return { bloque: false };
}
