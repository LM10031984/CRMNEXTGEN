/**
 * Régime de signature — « qui signe quoi » pour un participant donné.
 * Spec signature 2026-09-04 §3 bis, décision D-10 (tranchée le 10/09/2026).
 *
 * LE PROBLÈME QUE CE MODULE SUPPRIME. Jusqu'ici la règle n'existait nulle part :
 * `OpcoCatalog.requiredDocs` est de la prose d'affichage (vide chez ATLAS et
 * OPCOMMERCE) qui ne dit jamais QUI signe, et le code tranchait par
 * `opcoCode === 'AGEFICE'` disséminé dans la page session, le pack de clôture et
 * l'archive apprenant. Un septième financeur aurait fait un septième `if`.
 *
 * LA RÈGLE VIENT DE LA DONNÉE. Trois colonnes typées d'`OpcoCatalog`
 * (`conventionSigner`, `ageficeSigner`, `assiduiteSigner`) portent le régime,
 * exactement comme `ProductFundingType` porte le taux horaire. Ici, la seule
 * chose qui ressemble à une table est `COLONNE_PAR_DOCTYPE` : elle dit quelle
 * COLONNE lire pour quelle pièce, jamais quel financeur mérite quel traitement.
 * Brancher une pièce de plus = une ligne de données, pas une branche de code.
 *
 * `null` NE VEUT PAS DIRE « pas renseigné » mais « pièce HORS RÉGIME » : elle
 * n'existe pas pour ce financeur. Dans la matrice c'est `NA`, jamais `MISSING` —
 * `MISSING` appelle une action, `NA` dit qu'il n'y a rien à faire, et confondre
 * les deux fait courir l'admin après des pièces qui n'existent pas.
 *
 * CE MODULE IGNORE ET PRISMA ET DOCUSEAL. Il ne lit pas la base : l'appelant
 * (lot C.2) charge `OpcoCatalog` et lui passe les trois colonnes. Il ne connaît
 * pas non plus le prestataire : il désigne QUI signe par son entité
 * (organisation ou participant), pas par un email — la résolution du `Contact`
 * dirigeant, et son blocage nominatif, sont le travail du lot C.2. C'est ce qui
 * le rend testable sans base, sans réseau et sans mock.
 */

/** Rôle qui signe. Miroir volontaire de l'enum Prisma `SignerRole` : le module ne connaît pas la base. */
export type SignerRole = 'DIRIGEANT' | 'STAGIAIRE';

/** Les 3 pièces qui partent en signature électronique (spec §3, décision O-2). */
export const DOC_TYPES_SIGNABLES = ['CONVENTION', 'AGEFICE', 'ASSIDUITE'] as const;
export type DocTypeSignable = (typeof DOC_TYPES_SIGNABLES)[number];

/** Les 3 colonnes d'`OpcoCatalog`, lues telles quelles. `null` = pièce hors régime. */
export interface RegleSignatureFinanceur {
  conventionSigner: SignerRole | null;
  ageficeSigner: SignerRole | null;
  assiduiteSigner: SignerRole | null;
}

/**
 * Qui signe, désigné par l'entité — pas encore par son email : la résolution du
 * Contact dirigeant (et son blocage nominatif) est le travail du lot C.2.
 */
export type CibleSignature =
  | { kind: 'ORGANISATION'; organizationId: string }
  | { kind: 'PARTICIPANT'; participantId: string };

export interface PieceASigner {
  docType: DocTypeSignable;
  role: SignerRole;
  cible: CibleSignature;
}

export interface BlocageRegime {
  docType: DocTypeSignable;
  raison: 'ORG_PAYEUSE_ABSENTE';
}

export interface ContexteRegime {
  /** Les 3 colonnes du financeur du participant. `null` = financeur inconnu → rien en régime. */
  regle: RegleSignatureFinanceur | null;
  participantId: string;
  /** L'organisation payeuse : `SessionParticipant.sponsorOrgId`. */
  sponsorOrgId: string | null;
}

/** LA table qui remplace les `if` : docType → colonne du financeur. Ajouter une pièce = une ligne ici. */
const COLONNE_PAR_DOCTYPE: Record<DocTypeSignable, keyof RegleSignatureFinanceur> = {
  CONVENTION: 'conventionSigner',
  AGEFICE: 'ageficeSigner',
  ASSIDUITE: 'assiduiteSigner',
};

/**
 * Le rôle qui signe cette pièce sous ce régime, ou `null` si elle est hors régime.
 *
 * Une règle absente (financeur inconnu, organisation sans `opcoCatalog`) rend
 * `null` pour TOUTES les pièces : l'inconnu ne vaut pas une signature par défaut.
 */
export function signataireDe(
  docType: DocTypeSignable,
  regle: RegleSignatureFinanceur | null,
): SignerRole | null {
  if (regle === null) return null;
  return regle[COLONNE_PAR_DOCTYPE[docType]];
}

/** Les pièces qui EXISTENT sous ce régime — celles dont une colonne porte un rôle. */
export function docTypesEnRegime(
  regle: RegleSignatureFinanceur | null,
): ReadonlySet<DocTypeSignable> {
  // Cas écrit explicitement, et pas laissé au hasard de la boucle : un financeur
  // inconnu ne met AUCUNE pièce en régime, et cette phrase doit se lire.
  if (regle === null) return new Set<DocTypeSignable>();
  return new Set(DOC_TYPES_SIGNABLES.filter((docType) => signataireDe(docType, regle) !== null));
}

/**
 * Les pièces SANS OBJET sous ce régime — `NA` dans la matrice, jamais `MISSING`.
 *
 * Financeur inconnu → les 3 pièces sont hors régime. C'est le complément exact
 * de `docTypesEnRegime`, écrit à part pour que l'appelant n'ait pas à inverser
 * un ensemble à la main.
 */
export function docTypesHorsRegime(
  regle: RegleSignatureFinanceur | null,
): ReadonlySet<DocTypeSignable> {
  if (regle === null) return new Set<DocTypeSignable>(DOC_TYPES_SIGNABLES);
  const enRegime = docTypesEnRegime(regle);
  return new Set(DOC_TYPES_SIGNABLES.filter((docType) => !enRegime.has(docType)));
}

/**
 * La cible d'un rôle, ou `null` quand elle ne peut pas être résolue.
 *
 * `switch` exhaustif avec branche `never` plutôt qu'un `if/else` : si un
 * troisième rôle apparaît un jour, `tsc` le dira au lieu de le laisser tomber
 * en silence dans le cas par défaut.
 */
function cibleDe(role: SignerRole, ctx: ContexteRegime): CibleSignature | null {
  switch (role) {
    case 'STAGIAIRE':
      return { kind: 'PARTICIPANT', participantId: ctx.participantId };
    case 'DIRIGEANT':
      return ctx.sponsorOrgId === null
        ? null
        : { kind: 'ORGANISATION', organizationId: ctx.sponsorOrgId };
    default: {
      const jamais: never = role;
      return jamais;
    }
  }
}

/**
 * Quelles pièces sont en régime pour ce participant, qui les signe, et de quel côté.
 *
 * Parcourt `DOC_TYPES_SIGNABLES` DANS L'ORDRE (l'ordre de l'envoi côté C.2), lit
 * la colonne du financeur via `COLONNE_PAR_DOCTYPE`, saute les pièces hors
 * régime, et construit la cible.
 *
 * Un rôle `DIRIGEANT` sans organisation payeuse ne produit PAS de pièce : il
 * produit un `BlocageRegime` nommé. Règle métier n°4 de `/signature` — les
 * signataires se résolvent, ils ne se devinent pas, et un envoi qui manque doit
 * être bruyant plutôt que muet.
 */
export function resolveRegimeSignature(ctx: ContexteRegime): {
  pieces: PieceASigner[];
  blocages: BlocageRegime[];
} {
  const pieces: PieceASigner[] = [];
  const blocages: BlocageRegime[] = [];

  for (const docType of DOC_TYPES_SIGNABLES) {
    const role = signataireDe(docType, ctx.regle);
    if (role === null) continue; // hors régime : rien à signer, rien à signaler

    const cible = cibleDe(role, ctx);
    if (cible === null) {
      blocages.push({ docType, raison: 'ORG_PAYEUSE_ABSENTE' });
      continue;
    }

    pieces.push({ docType, role, cible });
  }

  return { pieces, blocages };
}
