/**
 * L'ORDRE DE SIGNATURE, tel qu'il s'écrit à l'écran — demande n°2 de Laurent
 * (11/09/2026, après vérification d'écran).
 *
 * POURQUOI CE MODULE EXISTE. Le moteur envoie DEUX signataires sur la
 * convention et l'attestation d'assiduité depuis le lot C.2a — vérifié sur les
 * envois réellement enregistrés en base. Aucun des deux écrans ne le montrait :
 * le récapitulatif annonçait « Signera : Paul MARTIN », l'écran résultat
 * « Signataire : Paul MARTIN ». Un admin ne pouvait donc pas savoir qu'une
 * seconde signature suivrait la première, ni que la pièce n'est pas close au
 * premier paraphe.
 *
 * IL NE DÉCIDE PAS QUI SIGNE. « L'organisme signe-t-il cette pièce » est une
 * question à laquelle `ANCRES_PAR_PIECE` répond déjà, et c'est la lecture des
 * gabarits. Ce module l'INTERROGE (`ofSigneLaPiece`) ; il ne la recopie pas.
 * Une seconde table serait la septième règle en dur que `regime.ts` a
 * supprimée, et l'écran finirait par annoncer un ordre différent de celui qui
 * part réellement.
 *
 * PUR ET SÉRIALISABLE : ni Prisma, ni réseau, ni horloge. Il est appelé depuis
 * un composant client (`recapitulatif-envoi.tsx`).
 *
 * ⚠ CE QU'IL NE PEUT PAS SAVOIR, ET QU'IL DIT. « Dès que le client a signé »
 * suppose de SAVOIR qu'il a signé. Cette information vient du webhook du
 * prestataire, livré au lot C.3 : d'ici là `SignatureRequest.signers[].signedAt`
 * reste nul et `status` reste `SENT`. Le lien « Signer maintenant » est donc
 * adossé à la DONNÉE (`signedAt` du signataire CLIENT), jamais au fait d'avoir
 * envoyé — et quand il manque, `mentionAttenteOf` dit pourquoi, sans promettre
 * que l'écran se mettra à jour tout seul.
 *
 * POURQUOI `signedAt` DU CLIENT ET PAS LE STATUT `PARTIALLY_SIGNED`. Les deux
 * disent presque la même chose, mais pas tout à fait : si l'organisme signe en
 * premier (`signatoryOrder: 'BEFORE'`), la demande est `PARTIALLY_SIGNED` alors
 * que le client n'a rien signé — et c'est l'OF qui n'a plus rien à faire. La
 * date du signataire concerné est strictement plus juste que le statut de la
 * demande, et c'est une seule règle au lieu de deux.
 */

import { ofSigneLaPiece, type PartieSignataire } from '@/lib/signature/envoi-contrats';
import type { SignataireEnvoye } from '@/lib/signature/envoi-contrats';
import type { DocTypeSignable } from '@/lib/signature/regime';
import type { SignatoryOrder } from '@qualiof/shared';

/**
 * La QUALITÉ de l'organisme, écrite à UN seul endroit.
 *
 * Deux écrans qui épellent différemment la même qualité font douter qu'il
 * s'agisse du même signataire — même motif que `formatFunderCode` pour les
 * financeurs (UX-12).
 */
export const QUALITE_OF = 'organisme de formation';

/**
 * COMMENT l'organisme signe, selon son rang.
 *
 * « depuis le CRM » n'est pas décoratif : c'est ce qui distingue son geste de
 * celui du client. Le client reçoit un lien à ouvrir ; l'organisme signe depuis
 * cet écran, sans quitter QualiOF.
 */
export const MENTION_OF_DERNIER = 'signe en dernier depuis le CRM';
export const MENTION_OF_PREMIER = 'signe en premier depuis le CRM';

/**
 * Le séparateur de la ligne d'ordre, dans la forme dictée par Laurent.
 *
 * EXPORTÉ depuis le 11/09/2026 : le bloc « Signature » rend chaque rang dans
 * son propre élément — l'adresse du client doit rester lisible en entier au
 * survol, même quand la ligne est longue (correction n°4). Il lui faut donc le
 * séparateur, et il le prend ICI plutôt que de réécrire ` · ` dans du JSX.
 */
export const SEPARATEUR_ORDRE = ' · ';

/**
 * Le libellé qui introduit l'ordre, écrit à UN seul endroit.
 *
 * Le récapitulatif l'affichait déjà ; le bloc l'affiche désormais aussi. Deux
 * formulations pour la même information sur deux écrans, c'est exactement ce
 * que ce lot est en train de corriger — autant ne pas le réintroduire par la
 * porte du libellé.
 */
export const LIBELLE_ORDRE_SIGNATURE = 'Ordre de signature';

export interface SignataireAffiche {
  /** 1, 2 — le rang RÉEL de signature. Jamais un index de tableau. */
  rang: number;
  partie: PartieSignataire;
  nom: string;
  email: string;
  /** La ligne complète, prête à lire. Composée ici, pas dans le JSX. */
  texte: string;
  /** Le lien de signature de CE signataire, quand le prestataire en a rendu un. */
  signUrl: string | null;
  aSigne: boolean;
  /**
   * Vrai ⇔ le lien « Signer maintenant » doit être rendu pour ce signataire.
   * Faux pour le client : lui reçoit son lien, il ne signe pas depuis le CRM.
   */
  signerMaintenant: boolean;
  /**
   * Non nul ⇔ le lien n'est PAS exposable, et voici pourquoi. Une absence
   * inexpliquée passe pour une panne ; une absence nommée se comprend.
   */
  attente: string | null;
}

/** La ligne du client : son nom et l'adresse qui recevra le lien. */
function texteClient(rang: number, nom: string, email: string): string {
  return `${rang}. ${nom} — ${email}`;
}

/** La ligne de l'organisme : sa qualité, et comment il signe. */
function texteOf(rang: number, nom: string, mention: string): string {
  return `${rang}. ${nom} (${QUALITE_OF}), ${mention}`;
}

/**
 * La ligne d'ordre assemblée, telle que le récapitulatif l'affiche.
 *
 * « 1. Paul DURAND — paul.durand@… · 2. Laurent MARX (organisme de formation),
 *   signe en dernier depuis le CRM »
 */
export function texteOrdreSignataires(ordre: readonly SignataireAffiche[]): string {
  return ordre.map((s) => s.texte).join(SEPARATEUR_ORDRE);
}

/**
 * L'ordre PRÉVU d'une pièce — ce que le récapitulatif annonce AVANT le clic.
 *
 * Deux abstentions volontaires :
 *
 *  • **OF non résolu** (`of: null`, Paramètres organisme incomplet) : on rend la
 *    seule ligne sûre. Le moteur pousse déjà un empêchement `SIGNATAIRE_OF_INCOMPLET`
 *    nominatif, rendu tel quel à côté — inventer « (organisme inconnu) » ferait
 *    chercher un réglage sans dire lequel.
 *  • **client non résolu** : AUCUNE ligne. Numéroter l'OF « 1. » puis écrire
 *    « signe en dernier » produirait une ligne qui se contredit elle-même ; et
 *    la pièce ne partira pas de toute façon.
 */
export function ordreSignatairesPrevu(a: {
  docType: DocTypeSignable;
  client: { nom: string; email: string } | null;
  of: { nom: string; email: string; ordre: SignatoryOrder } | null;
}): SignataireAffiche[] {
  if (a.client === null) return [];

  // ⚠ LA TABLE DES ANCRES TRANCHE, pas la présence d'un signataire OF résolu.
  // Le formulaire AGEFICE officiel porte déjà l'image de signature de
  // l'organisme et n'ouvre qu'UNE ancre : y annoncer un second signataire
  // ferait attendre une signature qui ne viendra jamais.
  const of = ofSigneLaPiece(a.docType) ? a.of : null;
  const ofAvant = of !== null && of.ordre === 'BEFORE';

  const lignes: SignataireAffiche[] = [];
  const pousserOf = (rang: number) => {
    if (of === null) return;
    lignes.push({
      rang,
      partie: 'OF',
      nom: of.nom,
      email: of.email,
      texte: texteOf(rang, of.nom, ofAvant ? MENTION_OF_PREMIER : MENTION_OF_DERNIER),
      // Avant l'envoi, aucun lien n'existe : le prestataire ne les rend qu'à la
      // création de la demande.
      signUrl: null,
      aSigne: false,
      signerMaintenant: false,
      attente: null,
    });
  };

  if (ofAvant) pousserOf(1);
  const rangClient = ofAvant ? 2 : 1;
  lignes.push({
    rang: rangClient,
    partie: 'CLIENT',
    nom: a.client.nom,
    email: a.client.email,
    texte: texteClient(rangClient, a.client.nom, a.client.email),
    signUrl: null,
    aSigne: false,
    signerMaintenant: false,
    attente: null,
  });
  if (!ofAvant) pousserOf(2);

  return lignes;
}

/**
 * Pourquoi le lien « Signer maintenant » n'est pas là — ou `null` s'il l'est.
 *
 * Les deux absences ne s'expliquent pas pareil, et n'appellent pas le même
 * geste : attendre quelqu'un, ou aller chercher le lien chez le prestataire.
 * Un message unique ferait patienter dans le second cas.
 */
export function mentionAttenteOf(a: {
  nomClient: string;
  clientASigne: boolean;
  signUrlOf: string | null;
}): string | null {
  if (!a.clientASigne) {
    return (
      `Le lien « Signer maintenant » s’ouvrira ici quand ${a.nomClient} aura signé. ` +
      `QualiOF n’apprend une signature que par le retour du prestataire, branché au ` +
      `lot C.3 : tant qu’il ne l’est pas, cet état ne changera pas tout seul sur cet ` +
      `écran — c’est chez le prestataire qu’il se constate.`
    );
  }
  if ((a.signUrlOf ?? '').trim().length === 0) {
    return (
      `${a.nomClient} a signé, mais le prestataire n’a rendu aucun lien de signature pour ` +
      `l’organisme : ouvrez la demande chez lui pour signer.`
    );
  }
  return null;
}

/**
 * L'ordre RÉELLEMENT parti — ce que l'écran résultat affiche.
 *
 * L'ordre d'entrée est celui du moteur (`signers` trié par `order` avant
 * l'appel au prestataire) : on ne le retrie pas ici. Le retrier serait une
 * seconde décision sur « qui signe en premier », et c'est le moteur qui l'a
 * prise — avec `signatoryOrder`, que cet écran ne lit pas.
 */
export function ordreSignatairesEnvoyes(a: {
  signataires: readonly SignataireEnvoye[];
}): SignataireAffiche[] {
  const indexClient = a.signataires.findIndex((s) => s.partie === 'CLIENT');
  const client = indexClient < 0 ? null : a.signataires[indexClient]!;
  const clientASigne = client !== null && client.signedAt !== null;

  return a.signataires.map((signataire, index) => {
    const rang = index + 1;
    const aSigne = signataire.signedAt !== null;

    if (signataire.partie === 'CLIENT') {
      return {
        rang,
        partie: signataire.partie,
        nom: signataire.nom,
        email: signataire.email,
        texte: texteClient(rang, signataire.nom, signataire.email),
        signUrl: signataire.signUrl,
        aSigne,
        // Le client ne signe pas depuis le CRM : il reçoit un lien à ouvrir.
        signerMaintenant: false,
        attente: null,
      };
    }

    // L'organisme. « En dernier » ou « en premier » se LIT sur les rangs
    // réellement partis, jamais sur `signatoryOrder` relu une seconde fois.
    const apresLeClient = indexClient >= 0 && index > indexClient;
    const aUnLien = (signataire.signUrl ?? '').trim().length > 0;

    return {
      rang,
      partie: signataire.partie,
      nom: signataire.nom,
      email: signataire.email,
      texte: texteOf(rang, signataire.nom, apresLeClient ? MENTION_OF_DERNIER : MENTION_OF_PREMIER),
      signUrl: signataire.signUrl,
      aSigne,
      // ⚠ LA CONDITION, ET SES TROIS TERMES. Le client a signé (donc la
      // séquence est arrivée à l'organisme), l'organisme n'a pas encore signé
      // (sinon il n'a plus rien à faire), et le prestataire a rendu un lien
      // (sinon il n'y a rien à ouvrir).
      signerMaintenant: clientASigne && !aSigne && aUnLien,
      attente: aSigne
        ? null
        : mentionAttenteOf({
            nomClient: client?.nom ?? 'le client',
            clientASigne,
            signUrlOf: signataire.signUrl,
          }),
    };
  });
}
