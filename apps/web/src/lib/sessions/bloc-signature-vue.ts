/**
 * La VUE du bloc « Signature » des onglets Avant / Après — lot C.2b-2, tâche 2.
 *
 * POURQUOI UN MODULE À PART. Trois décisions de Laurent se jouent ici, et
 * aucune ne doit dépendre du rendu : le bouton EXISTE ou n'existe pas (jamais
 * grisé), une pièce signée sort du jeu quelle que soit l'origine du signé, et
 * une pièce partie n'est ni renvoyable ni oubliable. Une règle écrite dans le
 * JSX n'est vérifiable qu'à l'œil ; écrite ici, elle est vérifiable en une
 * ligne — et la mutation qui la casse rougit.
 *
 * PUR ET SÉRIALISABLE. Ni Prisma, ni réseau, ni horloge : `page.tsx` (composant
 * serveur) le calcule et passe le résultat en props à un composant client. Tout
 * ce qui sort d'ici est du JSON — pas de `Map` ni de `Set` en sortie, qui ne
 * traverseraient pas la frontière RSC.
 *
 * IL NE REFAIT PAS LE PLAN. `planifierEnvoi` (C.2a) dit qui doit signer quoi ;
 * ce module ne fait que croiser ce plan avec l'état RÉEL des documents. Deux
 * règles pour une question, c'est exactement ce que le lot C.2b-1 vient de
 * supprimer entre la fiche session et le moteur.
 */

import type { AnomalieEnvoi, EnvoiPlanifie } from '@/lib/signature/plan-envoi';
import type { DocTypeSignable } from '@/lib/signature/regime';

/**
 * Où en est la pièce, du point de vue de la signature.
 *
 * Distinct de `CellState` (la matrice) : celle-ci répond « le document
 * existe-t-il ? », celui-ci « peut-il encore partir en signature ? ».
 */
export type EtatPiece = 'ABSENT' | 'GENERE' | 'ENVOYE' | 'SIGNE';

/** Le `Document` de la pièce, réduit à ce que la signature en lit. */
export interface DocumentDeLaPiece {
  id: string;
  /** `generated` | `sent_for_signature` | `signed` | … (colonne String, §4.1). */
  status: string;
  /** Clé bucket du PDF signé — e-signature (C.3) comme scan déposé (lot A). */
  signedPdfUrl: string | null;
  /**
   * La demande en cours, quand il y en a une. C'est elle — pas le document —
   * que `annulerEnvoiSignature` annule : une demande peut couvrir plusieurs
   * pièces. Sans elle, l'annulation livrée en C.2b-bis reste inatteignable et
   * `messageEnvoiEnCours` continue de promettre « Annulez l'envoi en cours ».
   */
  signatureRequestId: string | null;
}

export interface LigneSignature {
  cle: string;
  docType: DocTypeSignable;
  /** Celui du plan — il dit déjà « (3 participants) ». Jamais reformulé. */
  libelle: string;
  participantIds: string[];
  /**
   * Non nul UNIQUEMENT quand la pièce est NOMINATIVE, c'est-à-dire quand la
   * cible du plan est un participant. Porte la coexistence de la décision n°4 :
   * « Déposer le scan » n'a de sens que sur la pièce d'UNE personne.
   *
   * ⚠ Se lit sur la CIBLE, pas sur `participantIds.length`. Une convention de
   * groupe qui ne couvre qu'un salarié reste signée par le dirigeant de
   * l'organisation : y proposer un dépôt de scan « pour cet apprenant » ferait
   * déposer la preuve sous le mauvais nom.
   */
  participantIdUnique: string | null;
  etat: EtatPiece;
  documentId: string | null;
  signatureRequestId: string | null;
  /** Vrai ⇒ l'envoi est proposable. Faux pour `ENVOYE` et `SIGNE`. */
  envoyable: boolean;
}

export interface VueSignature {
  lignes: LigneSignature[];
  /** Rendus TELS QUELS : leurs messages sont déjà nominatifs et complets. */
  avertissements: AnomalieEnvoi[];
  blocages: AnomalieEnvoi[];
  /**
   * Le RBAC, décidé une fois côté serveur. Le composant ne le re-dérive pas :
   * `ADMIN | MANAGER` (`canEdit`), surtout PAS `canWrite`, qui inclut
   * `COMMERCIAL` — un rôle que les trois server actions de signature refusent.
   * Un bouton visible pour un rôle refusé est un bouton qui ment.
   */
  canSign: boolean;
  /**
   * Décision Laurent n°3 : le bouton d'envoi du bloc EXISTE ou n'existe pas.
   * Jamais `disabled` — un bouton grisé laisse croire qu'il manque un réglage,
   * alors qu'ici il n'y a simplement rien à envoyer.
   */
  boutonVisible: boolean;
  nbEnvoyables: number;
}

/** Une chaîne réellement remplie. Un `signedPdfUrl` vide n'est pas une preuve. */
function rempli(valeur: string | null | undefined): boolean {
  return (valeur ?? '').trim().length > 0;
}

/**
 * Où en est cette pièce.
 *
 * L'ORDRE DE LECTURE EST LA RÈGLE. « Signé » se teste EN PREMIER et par ses
 * TROIS origines (décision n°4 : « quelle qu'en soit l'origine ») :
 *  1. `docStatus[docType].state === 'MANUAL_OK'` — le scan déposé au lot A,
 *     que `deriveCellState` lit déjà en premier lui aussi ;
 *  2. `Document.signedPdfUrl` — le retour du webhook (lot C.3) ;
 *  3. `Document.status === 'signed'`.
 *
 * N'en lire qu'une reproposerait l'envoi d'une pièce déjà signée à la main —
 * et `sendForSignature` la refuserait (`DEJA_SIGNE`), après avoir fait cliquer.
 */
export function etatDeLaPiece(a: {
  docStatusEtat?: string | null;
  document?: DocumentDeLaPiece | null;
}): EtatPiece {
  const document = a.document ?? null;
  if (a.docStatusEtat === 'MANUAL_OK') return 'SIGNE';
  if (document === null) return 'ABSENT';
  if (rempli(document.signedPdfUrl)) return 'SIGNE';
  if (document.status === 'signed') return 'SIGNE';
  if (document.status === 'sent_for_signature') return 'ENVOYE';
  return 'GENERE';
}

/**
 * Croise le plan d'envoi avec l'état réel des documents.
 *
 * Une pièce ABSENTE reste envoyable : c'est l'ouverture du récapitulatif qui la
 * génère (`preparerEnvoiSignature` régénère avant d'afficher). Refuser l'envoi
 * d'une pièce non encore générée obligerait à un aller-retour « générer, puis
 * revenir » que rien ne justifie.
 */
export function construireVueSignature(a: {
  plan: { envois: EnvoiPlanifie[]; blocages: AnomalieEnvoi[]; avertissements: AnomalieEnvoi[] };
  documentParCle: ReadonlyMap<string, DocumentDeLaPiece>;
  docStatusParCle: ReadonlyMap<string, string | null>;
  canSign: boolean;
}): VueSignature {
  const lignes: LigneSignature[] = a.plan.envois.map((envoi) => {
    const document = a.documentParCle.get(envoi.cle) ?? null;
    const etat = etatDeLaPiece({
      docStatusEtat: a.docStatusParCle.get(envoi.cle) ?? null,
      document,
    });
    return {
      cle: envoi.cle,
      docType: envoi.docType,
      libelle: envoi.libelle,
      participantIds: envoi.participantIds,
      participantIdUnique:
        envoi.cible.kind === 'PARTICIPANT' ? envoi.cible.participantId : null,
      etat,
      documentId: document?.id ?? null,
      signatureRequestId: document?.signatureRequestId ?? null,
      envoyable: etat === 'ABSENT' || etat === 'GENERE',
    };
  });

  const nbEnvoyables = lignes.filter((ligne) => ligne.envoyable).length;

  return {
    lignes,
    avertissements: a.plan.avertissements,
    blocages: a.plan.blocages,
    canSign: a.canSign,
    boutonVisible: a.canSign && nbEnvoyables > 0,
    nbEnvoyables,
  };
}
