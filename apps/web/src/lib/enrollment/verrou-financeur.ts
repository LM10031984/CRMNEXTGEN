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

export type VerrouFinanceur =
  | { bloque: false }
  | { bloque: true; motif: 'DOSSIER_PARTI' | 'PIECE_SIGNEE'; message: string };

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

  return { bloque: false };
}
