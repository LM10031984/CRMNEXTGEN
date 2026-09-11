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
import { DOC_TYPES_SIGNABLES, type DocTypeSignable } from '@/lib/signature/regime';
// L'ordre affiché est COMPOSÉ ailleurs, et il l'était déjà : `ordre-signataires.ts`
// (lot C.2b-7) sert le récapitulatif et l'écran résultat. La vue l'appelle —
// elle ne réécrit ni la composition, ni la règle « l'OF signe-t-il cette
// pièce », qui reste `ofSigneLaPiece` / `ANCRES_PAR_PIECE`.
import {
  ordreSignatairesPrevu,
  type SignataireAffiche,
} from '@/lib/sessions/ordre-signataires';
import type { SignataireOfPrevu } from '@/lib/signature/envoi-contrats';

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
   * groupe qui ne couvre qu'un salarié reste signée par le RESPONSABLE DE
   * L'ORGANISATION : y proposer un dépôt de scan « pour cet apprenant » ferait
   * déposer la preuve sous le mauvais nom.
   *
   * ⚠ « responsable », pas « dirigeant » (Laurent, 11/09/2026). Le second
   * affirme une qualité juridique que la donnée ne porte pas : le champ
   * `representative` dit seulement qui représente l'organisation et signe ses
   * conventions — souvent le responsable d'agence, salarié lui aussi.
   */
  participantIdUnique: string | null;
  etat: EtatPiece;
  documentId: string | null;
  signatureRequestId: string | null;
  /** Vrai ⇒ l'envoi est proposable. Faux pour `ENVOYE` et `SIGNE`. */
  envoyable: boolean;
  /**
   * QUI SIGNE, ET À QUELLE ADRESSE — lisible sur la ligne, avant tout clic
   * (correction n°4, Laurent 11/09/2026 : « c'est ce qui permet de repérer une
   * mauvaise adresse d'un coup d'œil »).
   *
   * ⚠ RÉSOLU AILLEURS, jamais ici : `signataire-de-la-piece.ts`, le module que
   * le MOTEUR appelle aussi. Le résoudre dans la vue en ferait une seconde
   * règle, et l'écran finirait par annoncer un signataire différent de celui
   * qui reçoit le lien.
   *
   * `null` = la cascade n'a pas abouti (représentant inconnu, aucune adresse).
   * La ligne le DIT ; elle n'invente pas un nom, et le récapitulatif rendra le
   * refus nominatif complet.
   */
  signataire: { nom: string; email: string } | null;
  /**
   * L'ORDRE COMPLET DE SIGNATURE, numéroté — « 1. client · 2. OF » (Laurent,
   * 11/09/2026, après relecture d'écran).
   *
   * POURQUOI SUR LA LIGNE, alors que le récapitulatif le disait déjà. Le
   * récapitulatif s'atteint APRÈS avoir décidé d'envoyer ; le bloc est l'écran
   * qu'on regarde AVANT de cliquer. Tant qu'il n'annonçait que le signataire
   * client, un admin pouvait croire la convention close au premier paraphe,
   * alors que le moteur y envoie DEUX signataires depuis le lot C.2a.
   *
   * ⚠ COMPOSÉ, PAS DÉCIDÉ. `ordreSignatairesPrevu` interroge
   * `ofSigneLaPiece(docType)` — la table des ancres, lecture des gabarits. Une
   * pièce sans ancre OF (le dossier AGEFICE, dont l'exemplaire officiel porte
   * déjà l'image de signature de l'organisme) n'a qu'UN rang, et le composant
   * n'a rien à en déduire.
   *
   * Vide ⇔ le signataire client n'a pas été résolu : la ligne le DIT (« signataire
   * à déterminer ») plutôt que d'attribuer un « 1. » à l'organisme, ce qui
   * contredirait le « signe en dernier » de la même phrase.
   */
  ordre: SignataireAffiche[];
}

/**
 * Ce que la VUE doit savoir d'un participant pour ÉCRIRE son avertissement.
 *
 * Rien ici n'est une règle : ce sont trois faits que la page a déjà sous la
 * main (le commanditaire de l'inscription, son financeur, les financeurs des
 * organisations rattachées). La DÉCISION « cette pièce est incohérente » reste
 * entièrement dans `regime.ts` ; on se contente de nommer les choses que
 * `AnomalieEnvoi` ne transporte pas.
 */
export interface ContexteAvertissement {
  /**
   * L'id du commanditaire de CETTE inscription — la fiche à ouvrir dans le cas
   * A. Sans lui, le lien n'aurait aucune destination et l'avertissement
   * retomberait sur le formulaire d'inscription, c'est-à-dire sur le
   * comportement que la correction n°7 bis supprime.
   */
  sponsorOrgId: string | null;
  /** `brandName ?? legalName` du commanditaire de CETTE inscription. */
  sponsorOrgLabel: string | null;
  /**
   * Vrai quand le financeur du commanditaire n'ouvre AUCUNE pièce — financeur
   * absent, ou hors catalogue. C'est ce qui distingue « n'a aucun régime de
   * financement » de « n'ouvre pas ces pièces », et les deux phrases n'appellent
   * pas la même correction.
   */
  financeurSansRegime: boolean;
  /** Codes financeurs des AUTRES organisations rattachées à l'apprenant. */
  financeursRattaches: string[];
}

/**
 * UN encart, UN participant — retour d'écran Laurent du 11/09/2026.
 *
 * Le moteur rend une `AnomalieEnvoi` PAR PIÈCE, et c'est juste de son point de
 * vue : chaque pièce a son sort. À l'écran, c'est la même anomalie racontée
 * deux fois, pour une seule correction à faire.
 */
export interface AvertissementParticipant {
  participantId: string;
  nomAffiche: string;
  /** Dans l'ordre de `DOC_TYPES_SIGNABLES`, sans doublon. */
  docTypes: DocTypeSignable[];
  /** Composé par `composerAvertissementRegime`. Rendu tel quel par le bloc. */
  message: string;
  /**
   * OÙ VA LE LIEN — décidé ici, pas dans le JSX. Le composant se contente de
   * choisir entre deux `<Link>` : la règle, elle, reste sous test unitaire.
   */
  correction: CorrectionAvertissement;
}

/**
 * Les DEUX destinations de l'avertissement — correction n°7 bis (Laurent,
 * 11/09/2026, après vérification d'écran).
 *
 * L'avertissement envoyait TOUJOURS vers le formulaire d'inscription. C'est
 * faux dans la moitié des cas :
 *
 *  • **cas A** — le commanditaire est le BON, il lui manque son code financeur
 *    (Camille ROUSSEL, Marion MAINO en production). Il n'y a RIEN à corriger
 *    sur l'inscription : y envoyer l'admin, c'est lui faire changer un champ
 *    déjà juste. Destination : la fiche organisation.
 *  • **cas B** — le commanditaire LUI-MÊME est incohérent avec les signaux du
 *    dossier (Clothilde MANUEL : commanditaire Sigma / OPCO_EP, apprenante
 *    rattachée AGEFICE). Destination : le formulaire d'inscription, inchangé.
 */
export type CorrectionAvertissement =
  | {
      cible: 'ORGANISATION';
      organizationId: string;
      /** Peut être vide : le lien a alors une formulation de repli. */
      libelleOrganisation: string;
    }
  | { cible: 'INSCRIPTION' };

/**
 * Laquelle des deux corrections, pour ce participant.
 *
 * ⚠ LE DISCRIMINANT EXISTE DÉJÀ, ON N'EN INVENTE PAS UN SECOND.
 * `financeurSansRegime` a été posé par la correction n°3 pour distinguer « n'a
 * aucun régime de financement » de « n'ouvre pas ces pièces » — c'est
 * exactement la même frontière. Deux règles pour une question est précisément
 * ce que le lot C.2b-1 vient de supprimer entre la fiche session et le moteur.
 *
 * Sans contexte, ou sans id d'organisation, on retombe sur l'inscription : on
 * ne fabrique pas un lien vers une fiche qu'on ne sait pas nommer.
 */
export function correctionAvertissement(
  contexte?: ContexteAvertissement | undefined,
): CorrectionAvertissement {
  if (contexte === undefined || contexte.financeurSansRegime !== true) {
    return { cible: 'INSCRIPTION' };
  }
  const organizationId = (contexte.sponsorOrgId ?? '').trim();
  if (organizationId.length === 0) return { cible: 'INSCRIPTION' };
  return {
    cible: 'ORGANISATION',
    organizationId,
    libelleOrganisation: (contexte.sponsorOrgLabel ?? '').trim(),
  };
}

export interface VueSignature {
  lignes: LigneSignature[];
  /** UN par participant, pièces listées — jamais un par pièce (correction n°2). */
  avertissements: AvertissementParticipant[];
  /** Rendus TELS QUELS : leurs messages sont déjà nominatifs et complets. */
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

/* ── L'avertissement « régime incohérent », tel qu'il se lit ──────────────── */

/**
 * Comment chaque pièce se nomme DANS UNE ÉNUMÉRATION.
 *
 * Distinct des libellés du plan (« Convention — AGENCE MARTIN (3 participants) »)
 * et de ses désignations (« la convention ») : ici on écrit une liste, et une
 * liste ne porte pas d'articles. Table de DONNÉES — une pièce de plus = une
 * ligne, jamais une concaténation qui finirait par produire une faute d'accord.
 */
const PIECE_EN_LISTE: Record<DocTypeSignable, string> = {
  CONVENTION: 'convention',
  AGEFICE: 'dossier AGEFICE',
  ASSIDUITE: 'attestation d’assiduité',
};

/**
 * L'avertissement « régime incohérent », dans la forme imposée par Laurent le
 * 11/09/2026.
 *
 * DEUX PHRASES : **le problème**, puis **l'action**. Puis les pièces, puis la
 * réassurance. Le texte précédent (45 mots, « n'ouvre pas la convention »,
 * « en porte les signaux ») décrivait la mécanique du moteur ; celui-ci dit ce
 * qui cloche dans la donnée et le geste qui le corrige.
 *
 * ⚠ LE NOM DE L'ORGANISATION ET LE FINANCEUR RATTACHÉ VIENNENT DE LA DONNÉE.
 * Aucun code financeur n'est reconnu ici : `financeursRattaches` est recopié tel
 * qu'il sort du catalogue. Un `if (code === 'AGEFICE')` dans cette fonction
 * serait la septième règle en dur que `regime.ts` a supprimée.
 *
 * Le contexte est OPTIONNEL : un appelant qui ne sait pas le calculer obtient
 * un message plus court, mais jamais un message faux. Inventer « (organisation
 * inconnue) » ferait chercher une organisation qui n'existe pas.
 */
export function composerAvertissementRegime(a: {
  nomAffiche: string;
  docTypes: readonly DocTypeSignable[];
  contexte?: ContexteAvertissement | undefined;
}): string {
  const organisation = (a.contexte?.sponsorOrgLabel ?? '').trim();
  const entreParentheses = organisation.length > 0 ? ` (${organisation})` : '';

  // ⚠ DEUX PROBLÈMES DISTINCTS, DEUX PHRASES DISTINCTES, ET DEUX GESTES
  // DISTINCTS (correction n°7 bis). Cas A : c'est l'organisation qui n'a pas de
  // financeur — on va le RENSEIGNER sur sa fiche. Cas B : elle en a un, mais il
  // n'ouvre pas ces pièces — c'est le rattachement de l'inscription qui est à
  // revoir. Un texte unique pour les deux faisait mentir l'un des deux.
  const casA = a.contexte?.financeurSansRegime === true;

  const probleme = casA
    ? `${a.nomAffiche} — son organisation commanditaire${entreParentheses} ` +
      `n’a aucun régime de financement`
    : `${a.nomAffiche} — le financeur de son organisation commanditaire${entreParentheses} ` +
      `n’ouvre pas ces pièces`;

  const action = casA
    ? 'Renseignez le financeur de cette organisation.'
    : 'Corrigez l’organisation commanditaire de l’inscription.';

  // Le « alors que » n'existe QUE s'il repose sur un fait. Sans contexte, on
  // s'arrête au problème : une demi-phrase vraie vaut mieux qu'une phrase
  // complète qui suppose un rattachement dont on ne sait rien.
  const codes = a.contexte?.financeursRattaches ?? [];
  const rattachement =
    a.contexte === undefined
      ? ''
      : codes.length === 0
        ? ', alors que son dossier est rattaché à une entreprise individuelle'
        : codes.length === 1
          ? `, alors que son dossier est rattaché à une entreprise financée ${codes[0]}`
          : `, alors que son dossier est rattaché à des entreprises financées ${codes.join(', ')}`;

  const pieces = DOC_TYPES_SIGNABLES.filter((docType) => a.docTypes.includes(docType));
  const liste = pieces.map((docType) => PIECE_EN_LISTE[docType]).join(', ');
  const entete = pieces.length > 1 ? 'Pièces concernées' : 'Pièce concernée';

  return (
    `${probleme}${rattachement}. ${action} ` + `${entete} : ${liste}. Rien n’a été envoyé.`
  );
}

/**
 * Les avertissements du moteur, REGROUPÉS par participant.
 *
 * L'ordre des participants est celui de leur première apparition — celui du
 * plan, donc celui de la liste des inscrits. L'ordre des pièces, lui, est celui
 * du référentiel : deux plans successifs ne doivent pas faire clignoter la
 * phrase « convention, dossier AGEFICE ».
 */
export function regrouperAvertissements(
  avertissements: readonly AnomalieEnvoi[],
  contexteParParticipant: ReadonlyMap<string, ContexteAvertissement> = new Map(),
): AvertissementParticipant[] {
  const groupes = new Map<string, { nomAffiche: string; docTypes: Set<DocTypeSignable> }>();

  for (const anomalie of avertissements) {
    const existant = groupes.get(anomalie.participantId);
    if (existant === undefined) {
      groupes.set(anomalie.participantId, {
        nomAffiche: anomalie.nomAffiche,
        docTypes: new Set([anomalie.docType]),
      });
      continue;
    }
    existant.docTypes.add(anomalie.docType);
  }

  return [...groupes.entries()].map(([participantId, groupe]) => {
    const docTypes = DOC_TYPES_SIGNABLES.filter((docType) => groupe.docTypes.has(docType));
    const contexte = contexteParParticipant.get(participantId);
    return {
      participantId,
      nomAffiche: groupe.nomAffiche,
      docTypes,
      message: composerAvertissementRegime({
        nomAffiche: groupe.nomAffiche,
        docTypes,
        contexte,
      }),
      // Le message et la destination sont tirés du MÊME contexte : un encart qui
      // dirait « renseignez le financeur » en menant à l'inscription serait pire
      // que l'ancien comportement.
      correction: correctionAvertissement(contexte),
    };
  });
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
  /**
   * Ce que `AnomalieEnvoi` ne transporte pas et que l'avertissement doit dire :
   * le commanditaire de l'inscription et les financeurs rattachés. Optionnel —
   * un appelant qui ne le calcule pas obtient un message plus court.
   */
  contexteAvertissementParParticipant?: ReadonlyMap<string, ContexteAvertissement>;
  /**
   * Le couple nom + adresse DÉJÀ RÉSOLU, par clé de pièce. Une clé absente vaut
   * « non résolu » : la vue ne rattrape rien, elle transporte.
   */
  signataireParCle?: ReadonlyMap<string, { nom: string; email: string }>;
  /**
   * Le signataire de l'ORGANISME, résolu UNE fois par `resoudreSignataireOf`
   * (`@/lib/signature/signataire-of`) — le même module que le moteur d'envoi.
   *
   * ⚠ La vue ne le résout pas et ne le devine pas : elle le transporte. Absent
   * ou `null` ⇒ les lignes n'annoncent que le client, et l'empêchement
   * `SIGNATAIRE_OF_INCOMPLET` du récapitulatif dira quel réglage manque.
   */
  signataireOf?: SignataireOfPrevu | null;
}): VueSignature {
  const lignes: LigneSignature[] = a.plan.envois.map((envoi) => {
    const document = a.documentParCle.get(envoi.cle) ?? null;
    const etat = etatDeLaPiece({
      docStatusEtat: a.docStatusParCle.get(envoi.cle) ?? null,
      document,
    });
    const signataire = a.signataireParCle?.get(envoi.cle) ?? null;
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
      signataire,
      ordre: ordreSignatairesPrevu({
        docType: envoi.docType,
        client: signataire,
        of: a.signataireOf ?? null,
      }),
    };
  });

  const nbEnvoyables = lignes.filter((ligne) => ligne.envoyable).length;

  return {
    lignes,
    avertissements: regrouperAvertissements(
      a.plan.avertissements,
      a.contexteAvertissementParParticipant ?? new Map(),
    ),
    blocages: a.plan.blocages,
    canSign: a.canSign,
    boutonVisible: a.canSign && nbEnvoyables > 0,
    nbEnvoyables,
  };
}
