/**
 * Contrats du moteur d'envoi en signature — lot C.2a-2.
 *
 * Ce module ne fait rien : il DIT. Il porte (a) la table qui décrit ce que
 * chaque gabarit attend d'un envoi, (b) les raisons de refus nommées, (c) les
 * formes de résultat rendues par les deux server actions, et (d) les messages
 * que l'admin lira. Il est pur — ni base, ni réseau, ni horloge — pour que la
 * server action n'ait plus qu'à charger, appeler et écrire.
 *
 * POURQUOI UNE TABLE ET PAS DES `if`. « Qui signe cette pièce » et « qui garde
 * son tampon » sont la MÊME information, et elle appartient au gabarit, pas au
 * moteur. Le formulaire AGEFICE officiel porte déjà l'image de signature de
 * l'OF (`applyOfSignature`, apposée inconditionnellement) et n'ouvre qu'UNE
 * ancre, celle du demandeur : l'OF n'y re-signe pas. La convention et
 * l'attestation d'assiduité, elles, retirent le tampon en mode ancres et
 * ouvrent DEUX ancres. `ANCRES_PAR_PIECE` est la lecture de cette réalité, pas
 * une règle parallèle : elle se relit dans `convention-template.ts`,
 * `agefice-form-fill.ts` et `closure/agefice-attendance-template.ts`.
 *
 * LE NOM DE RÔLE VIENT DU GABARIT, PAS DU RÉGIME. Une ancre DocuSeal est
 * nominative (`role=Client`). Le gabarit de convention n'écrit QUE `Client`,
 * même quand c'est un indépendant qui signe pour lui-même ; les gabarits AGEFICE
 * et assiduité n'écrivent que `Stagiaire`. Déduire le nom du rôle du régime
 * (`DIRIGEANT` → `Client`, `STAGIAIRE` → `Stagiaire`) enverrait, pour la
 * convention d'un indépendant, un signataire `Stagiaire` sur un PDF qui n'a
 * qu'une ancre `Client` : le champ resterait non attribué et personne ne
 * signerait. C'est le gabarit qui nomme.
 */

import { SIGNATURE_ROLES } from './text-tags';
import type { DocTypeSignable, SignerRole } from './regime';
import type { AnomalieEnvoi } from './plan-envoi';
import type { SourceEmailRepresentant, SourceRepresentant } from './representant';

/**
 * Les deux camps d'un envoi. `CLIENT` désigne le côté bénéficiaire, quel que
 * soit son rôle au sens du régime (dirigeant d'entreprise ou stagiaire
 * lui-même) ; `OF` désigne le signataire de l'organisme (D-1).
 */
export type PartieSignataire = 'CLIENT' | 'OF';

export interface AncreDePiece {
  partie: PartieSignataire;
  /** Le nom de rôle EXACT écrit par le gabarit dans son ancre DocuSeal. */
  role: string;
}

/**
 * Ce que chaque gabarit ouvre comme ancres, dans l'ordre où le PDF les nomme.
 *
 * Ajouter une pièce signable = une ligne ici, jamais une branche dans le moteur.
 * L'absence de `OF` sur le dossier AGEFICE n'est pas un oubli : c'est la règle
 * « une seule partie y signe, l'OF a déjà son image apposée » (spec §3).
 */
export const ANCRES_PAR_PIECE: Record<DocTypeSignable, readonly AncreDePiece[]> = {
  CONVENTION: [
    { partie: 'CLIENT', role: SIGNATURE_ROLES.CLIENT },
    { partie: 'OF', role: SIGNATURE_ROLES.OF },
  ],
  AGEFICE: [{ partie: 'CLIENT', role: SIGNATURE_ROLES.STAGIAIRE }],
  ASSIDUITE: [
    { partie: 'CLIENT', role: SIGNATURE_ROLES.STAGIAIRE },
    { partie: 'OF', role: SIGNATURE_ROLES.OF },
  ],
};

/** Le nom de rôle que le gabarit attend pour le signataire côté bénéficiaire. */
export function roleAncreClient(docType: DocTypeSignable): string {
  const ancre = ANCRES_PAR_PIECE[docType].find((a) => a.partie === 'CLIENT');
  // Une pièce sans ancre client n'existe pas : la table ci-dessus en fait foi.
  // On rend malgré tout un nom plutôt que de lever — un envoi ne doit jamais
  // tomber en exception pour une table mal complétée.
  return ancre?.role ?? SIGNATURE_ROLES.CLIENT;
}

/**
 * L'organisme signe-t-il cette pièce ? Faux pour le dossier AGEFICE, dont
 * l'exemplaire porte déjà l'image de signature de l'OF.
 */
export function ofSigneLaPiece(docType: DocTypeSignable): boolean {
  return ANCRES_PAR_PIECE[docType].some((a) => a.partie === 'OF');
}

/** Le nom de rôle de l'OF pour cette pièce, ou `null` s'il n'y signe pas. */
export function roleAncreOf(docType: DocTypeSignable): string | null {
  return ANCRES_PAR_PIECE[docType].find((a) => a.partie === 'OF')?.role ?? null;
}

// ─── Refus, nommés ───────────────────────────────────────────────────────────

/**
 * Pourquoi une pièce ne part pas. Chaque raison a un message qui NOMME la pièce
 * et dit le geste à faire : un refus muet fait recliquer, un refus nommé fait
 * corriger.
 */
export type RaisonRefus =
  /** La clé envoyée ne figure pas dans le plan recalculé — l'aperçu a vieilli. */
  | 'CLE_INCONNUE'
  | 'DOC_NON_GENERE'
  /** Le PDF a changé depuis l'aperçu : ce n'est plus ce que l'admin a relu. */
  | 'DOCUMENT_MODIFIE'
  | 'DEJA_SIGNE'
  | 'ENVOI_EN_COURS'
  | 'SIGNATAIRE_SANS_EMAIL'
  | 'SIGNATAIRE_OF_INCOMPLET'
  | 'REGENERATION_IMPOSSIBLE'
  | 'AUCUN_CHAMP_DE_SIGNATURE'
  | 'ERREUR_PRESTATAIRE';

export interface Empechement {
  raison: RaisonRefus;
  message: string;
}

export interface RefusEnvoi extends Empechement {
  cle: string;
  docType: DocTypeSignable | null;
}

// ─── Ce que rend la préparation ──────────────────────────────────────────────

/** Le PDF EXACT qui partira — c'est lui que le récapitulatif affiche. */
export interface DocumentAEnvoyer {
  documentId: string;
  /** Clé bucket, pour servir l'aperçu. */
  pdfUrl: string;
  /** `Document.hashSha256`. C'est ce hash que l'envoi exigera de retrouver. */
  hash: string;
  /** Vrai si cette ouverture du récapitulatif vient de le régénérer. */
  regenere: boolean;
}

/** Le couple retenu, avec la provenance des DEUX moitiés — de quoi journaliser. */
export interface SignataireResolu {
  nom: string;
  email: string;
  sourceNom: SourceRepresentant;
  sourceEmail: SourceEmailRepresentant;
}

export interface EnvoiPrepare {
  cle: string;
  docType: DocTypeSignable;
  libelle: string;
  /** Le rôle au sens du RÉGIME (qui doit signer), pas le nom d'ancre. */
  role: SignerRole;
  participantIds: string[];
  document: DocumentAEnvoyer | null;
  signataire: SignataireResolu | null;
  /** Vide ⇒ prêt à partir. Non vide ⇒ ce qui reste à corriger, nommé. */
  empechements: Empechement[];
}

export type PreparerEnvoiSignatureResult =
  | {
      ok: true;
      sessionId: string;
      envois: EnvoiPrepare[];
      blocages: AnomalieEnvoi[];
      avertissements: AnomalieEnvoi[];
    }
  | { ok: false; error: string };

// ─── Ce que rend l'envoi ─────────────────────────────────────────────────────

export interface EnvoiEffectue {
  cle: string;
  docType: DocTypeSignable;
  signatureRequestId: string;
  providerId: string;
  documentId: string;
  /** Le hash de ce qui est RÉELLEMENT parti — celui qui a été confirmé. */
  hash: string;
  signataire: { nom: string; email: string; source: SourceEmailRepresentant };
}

export type SendForSignatureResult =
  | { ok: true; envoyes: EnvoiEffectue[]; refus: RefusEnvoi[] }
  | { ok: false; error: string };

// ─── Messages ────────────────────────────────────────────────────────────────

/**
 * Le refus qui tient la promesse « le clic confirme CE PDF-là ».
 *
 * Il ne dit pas « erreur » : il dit ce qui s'est passé (le document a changé),
 * ce qui n'a PAS eu lieu (aucun envoi), et le geste (rouvrir le récapitulatif).
 * Sans la troisième phrase, l'admin recliquerait sur Envoyer.
 */
export function messageDocumentModifie(libelle: string): string {
  return (
    `« ${libelle} » a changé depuis l'aperçu : rien n'a été envoyé. Le document que ` +
    `vous avez relu n'est plus celui qui partirait — quelqu'un d'autre l'a peut-être ` +
    `régénéré entre-temps. Rouvrez le récapitulatif pour revoir la version exacte, puis ` +
    `relancez l'envoi.`
  );
}

export function messageEnvoiEnCours(libelle: string): string {
  return (
    `« ${libelle} » est déjà partie en signature et attend son signataire. Rien n'a été ` +
    `renvoyé : un second envoi ferait deux demandes concurrentes sur la même pièce. ` +
    `Annulez l'envoi en cours avant d'en relancer un.`
  );
}

export function messageDejaSigne(libelle: string): string {
  return (
    `« ${libelle} » est déjà signée. Rien n'a été renvoyé : réémettre une pièce signée ` +
    `remplacerait une preuve par une demande. Utilisez le renvoi forcé si la pièce doit ` +
    `réellement repartir.`
  );
}

export function messageDocNonGenere(libelle: string): string {
  return (
    `« ${libelle} » n'existe pas encore : générez-la depuis la fiche session avant de ` +
    `l'envoyer en signature.`
  );
}

export function messageRegenerationImpossible(libelle: string, cause: string): string {
  return (
    `« ${libelle} » n'a pas pu être régénérée avec ses zones de signature : ${cause} ` +
    `Rien n'a été envoyé — le document sans ancre ne serait signable par personne.`
  );
}

export function messageAucunChampDeSignature(libelle: string): string {
  return (
    `« ${libelle} » ne porte aucune zone de signature : le prestataire n'a créé aucun ` +
    `champ à partir du PDF. La demande a été annulée chez lui et rien n'a été enregistré — ` +
    `sans cette annulation, une demande fantôme resterait ouverte et le prochain envoi ` +
    `ferait doublon. Régénérez la pièce, puis rouvrez le récapitulatif.`
  );
}

export function messageErreurPrestataire(libelle: string, cause: string): string {
  return `« ${libelle} » n'a pas pu être envoyée au prestataire de signature : ${cause}`;
}

export function messageCleInconnue(cle: string): string {
  return (
    `La pièce « ${cle} » ne fait plus partie des envois possibles pour cette session : ` +
    `l'inscription ou son financeur ont changé depuis l'aperçu. Rouvrez le récapitulatif.`
  );
}
