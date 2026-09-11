/**
 * Plan d'envoi en signature d'une session — lot C.2a, tâche 2.
 *
 * RÉPOND À UNE SEULE QUESTION, sans base et sans réseau : « qui doit signer quoi
 * sur cette session, et qu'est-ce qui bloque ». La server action charge la
 * donnée et exécute ; le récapitulatif de C.2b affiche. Ni l'une ni l'autre ne
 * refait la règle.
 *
 * POURQUOI PUR. Les cas qui comptent sont les cas tordus — le TNS inscrit sous
 * le financeur de son agence, l'inscription sans organisation bénéficiaire, deux
 * salariés facturés à des payeurs différents. Un plan qui exigerait une base
 * pour être testé ne serait testé que sur le cas facile.
 *
 * D-4 AMENDÉ (Laurent, 10/09/2026). La spec prévoyait « 1 SignatureRequest
 * portant la CONVENTION + les dossiers de financement ». On sépare : UN ENVOI
 * PORTE UN DOCUMENT. Une convention par organisation bénéficiaire (elle couvre
 * tous ses inscrits), et un dossier de financement par participant. Motif : un
 * dossier de financement n'a qu'UN signataire — le grouper ferait dépendre sa
 * complétion de celle du dirigeant, et un dossier prêt resterait bloqué derrière
 * une signature qui ne le concerne pas.
 *
 * L'ORGANISATION BÉNÉFICIAIRE, JAMAIS LE PAYEUR. La convention se rattache à
 * `sponsorOrg` — le champ que la convention imprime déjà comme bénéficiaire. Qui
 * FACTURE ne dit rien de qui SIGNE, et un test de contrat garde cette frontière.
 *
 * LE FINANCEUR N'EST JAMAIS SIGNATAIRE. Il n'existe ici que comme une règle
 * (`RegleSignatureFinanceur`) lue dans la donnée : aucune comparaison sur un
 * code financeur, garde de test à l'appui.
 */

import {
  DOC_TYPES_SIGNABLES,
  resolveRegimeSignature,
  type CibleSignature,
  type DocTypeSignable,
  type RegleSignatureFinanceur,
  type SignauxDossierPropre,
  type SignerRole,
} from './regime';

/** Les deux moments d'envoi : avant la formation, après. */
export type ScopeEnvoi = 'BEFORE' | 'AFTER';

/**
 * Quelles pièces relèvent de quel moment. Table de DONNÉES : brancher une pièce
 * de plus se fait ici, pas dans un `if` au milieu de la boucle. Les pièces hors
 * scope sont ignorées SANS BRUIT — l'onglet AVANT n'a pas à signaler qu'il ne
 * s'occupe pas de l'assiduité.
 */
const PIECES_PAR_SCOPE: Record<ScopeEnvoi, ReadonlySet<DocTypeSignable>> = {
  BEFORE: new Set<DocTypeSignable>(['CONVENTION', 'AGEFICE']),
  AFTER: new Set<DocTypeSignable>(['ASSIDUITE']),
};

/**
 * Comment chaque pièce se nomme : en titre d'envoi, et dans une phrase.
 * Les messages sont lus par l'admin — « Impossible de savoir qui signe la
 * convention » se comprend, « docType=CONVENTION » non.
 */
const PIECE: Record<DocTypeSignable, { titre: string; designation: string }> = {
  CONVENTION: { titre: 'Convention', designation: 'la convention' },
  AGEFICE: { titre: 'Dossier AGEFICE', designation: 'le dossier AGEFICE' },
  ASSIDUITE: { titre: "Attestation d'assiduité", designation: "l'attestation d'assiduité" },
};

/** Un participant, réduit à ce dont le plan a besoin. Aucune trace de facturation. */
export interface ParticipantPourEnvoi {
  participantId: string;
  /** « Prénom NOM » — sert aux messages nominatifs et aux libellés. */
  nomAffiche: string;
  /** L'organisation BÉNÉFICIAIRE de l'inscription (`SessionParticipant.sponsorOrgId`). */
  sponsorOrgId: string | null;
  /** `brandName ?? legalName` — ce que l'admin reconnaît à l'écran. */
  sponsorOrgLabel: string | null;
  /** Les 3 colonnes du financeur de cette organisation. `null` = financeur inconnu. */
  regle: RegleSignatureFinanceur | null;
  signauxDossierPropre?: SignauxDossierPropre;
}

export interface EnvoiPlanifie {
  /**
   * Clé stable et idempotente : `CONVENTION:org-1` ou `AGEFICE:part-3`. C'est
   * elle que l'UI coche et que la server action reçoit — pas un index de
   * tableau, qui changerait au premier participant ajouté.
   */
  cle: string;
  /** D-4 AMENDÉ : UN document par envoi. */
  docType: DocTypeSignable;
  role: SignerRole;
  cible: CibleSignature;
  /** Au moins un ; plusieurs seulement pour une convention de groupe. */
  participantIds: string[];
  /** « Convention — AGENCE MARTIN (3 participants) ». */
  libelle: string;
}

/** Un blocage ou un avertissement, toujours rattaché à QUELQU'UN. */
export interface AnomalieEnvoi {
  participantId: string;
  nomAffiche: string;
  docType: DocTypeSignable;
  message: string;
}

/** Groupe en cours de constitution : les libellés attendent d'être comptés. */
interface EnvoiEnConstruction {
  cle: string;
  docType: DocTypeSignable;
  role: SignerRole;
  cible: CibleSignature;
  participantIds: string[];
  labelOrganisation: string | null;
  nomPremierParticipant: string;
}

function clefEnvoi(docType: DocTypeSignable, cible: CibleSignature): string {
  const suffixe = cible.kind === 'ORGANISATION' ? cible.organizationId : cible.participantId;
  return `${docType}:${suffixe}`;
}

/**
 * Le blocage nominatif. Il nomme la personne, la pièce, et LE GESTE à faire :
 * un blocage qui ne dit pas quoi faire laisse l'admin devant un écran rouge.
 */
function messageBlocage(p: ParticipantPourEnvoi, docType: DocTypeSignable): string {
  return (
    `${p.nomAffiche} : aucune organisation bénéficiaire rattachée à cette inscription. ` +
    `Impossible de savoir qui signe ${PIECE[docType].designation} : rattachez l'organisation ` +
    `sur la fiche session avant l'envoi.`
  );
}

/**
 * L'avertissement « régime incohérent ». Il dit explicitement que RIEN n'est
 * parti : sans cette phrase, l'admin pourrait croire la pièce envoyée.
 */
function messageAvertissement(p: ParticipantPourEnvoi, docType: DocTypeSignable): string {
  const organisation = p.sponsorOrgLabel === null ? "l'inscription" : `« ${p.sponsorOrgLabel} »`;
  return (
    `${p.nomAffiche} : le financeur rattaché à ${organisation} n'ouvre pas ` +
    `${PIECE[docType].designation}, alors que le dossier de cet apprenant en porte les ` +
    `signaux (entreprise individuelle rattachée, ou autre organisation dont le financeur ` +
    `l'ouvre). Corrigez l'organisation commanditaire de l'inscription : rien n'a été envoyé ` +
    `pour cette pièce.`
  );
}

function libelleDe(envoi: EnvoiEnConstruction): string {
  const titre = PIECE[envoi.docType].titre;
  if (envoi.cible.kind === 'PARTICIPANT') return `${titre} — ${envoi.nomPremierParticipant}`;

  const nombre = envoi.participantIds.length;
  const organisation = envoi.labelOrganisation ?? 'organisation sans nom';
  return `${titre} — ${organisation} (${nombre} participant${nombre > 1 ? 's' : ''})`;
}

/**
 * Le plan d'envoi d'une session, pour un moment donné.
 *
 * Un participant bloqué ne produit AUCUN envoi et n'entre dans aucun groupe :
 * la convention de son organisation part sans lui plutôt qu'avec un signataire
 * indéterminé.
 *
 * L'ordre de sortie est DÉTERMINISTE — pièces dans l'ordre de
 * `DOC_TYPES_SIGNABLES`, puis clé triée. Un plan qui changerait d'ordre d'un
 * appel à l'autre rendrait tout diff illisible et ferait clignoter l'écran.
 */
export function planifierEnvoi(a: { scope: ScopeEnvoi; participants: ParticipantPourEnvoi[] }): {
  envois: EnvoiPlanifie[];
  blocages: AnomalieEnvoi[];
  avertissements: AnomalieEnvoi[];
} {
  const dansLeScope = PIECES_PAR_SCOPE[a.scope];
  const groupes = new Map<string, EnvoiEnConstruction>();
  const blocages: AnomalieEnvoi[] = [];
  const avertissements: AnomalieEnvoi[] = [];

  for (const participant of a.participants) {
    const regime = resolveRegimeSignature({
      regle: participant.regle,
      participantId: participant.participantId,
      sponsorOrgId: participant.sponsorOrgId,
      signauxDossierPropre: participant.signauxDossierPropre,
    });

    for (const blocage of regime.blocages) {
      if (!dansLeScope.has(blocage.docType)) continue;
      blocages.push({
        participantId: participant.participantId,
        nomAffiche: participant.nomAffiche,
        docType: blocage.docType,
        message: messageBlocage(participant, blocage.docType),
      });
    }

    for (const avertissement of regime.avertissements) {
      if (!dansLeScope.has(avertissement.docType)) continue;
      avertissements.push({
        participantId: participant.participantId,
        nomAffiche: participant.nomAffiche,
        docType: avertissement.docType,
        message: messageAvertissement(participant, avertissement.docType),
      });
    }

    for (const piece of regime.pieces) {
      if (!dansLeScope.has(piece.docType)) continue;

      const cle = clefEnvoi(piece.docType, piece.cible);
      const existant = groupes.get(cle);
      if (existant === undefined) {
        groupes.set(cle, {
          cle,
          docType: piece.docType,
          role: piece.role,
          cible: piece.cible,
          participantIds: [participant.participantId],
          labelOrganisation: participant.sponsorOrgLabel,
          nomPremierParticipant: participant.nomAffiche,
        });
        continue;
      }
      // Même clé = même pièce, même cible : c'est une convention de groupe qui
      // couvre un inscrit de plus. Rien d'autre ne se regroupe (D-4 amendé).
      existant.participantIds.push(participant.participantId);
    }
  }

  const envois = [...groupes.values()]
    .map((envoi) => ({
      cle: envoi.cle,
      docType: envoi.docType,
      role: envoi.role,
      cible: envoi.cible,
      // Trié : l'ordre d'entrée des inscrits ne doit pas transparaître.
      participantIds: [...envoi.participantIds].sort(),
      libelle: libelleDe(envoi),
    }))
    .sort((gauche, droite) => {
      const parPiece =
        DOC_TYPES_SIGNABLES.indexOf(gauche.docType) - DOC_TYPES_SIGNABLES.indexOf(droite.docType);
      if (parPiece !== 0) return parPiece;
      if (gauche.cle === droite.cle) return 0;
      return gauche.cle < droite.cle ? -1 : 1;
    });

  return { envois, blocages, avertissements };
}
