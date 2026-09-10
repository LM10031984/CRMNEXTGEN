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
 * LE GARDE-FOU « RÉGIME INCOHÉRENT » (Laurent, 10/09/2026 — cas Florent
 * HAUSSWIRTH ; consigné en §5 lot C de la spec, amendement n°4). Un `NA` silencieux fait
 * DISPARAÎTRE un dossier de l'écran. Quand le dossier du participant porte les
 * signaux d'un régime que son sponsor n'ouvre pas, le module rend un
 * AVERTISSEMENT nommé — qui ne déclenche aucun envoi et invite à corriger la
 * donnée. Les signaux sont eux-mêmes de la donnée (`SignauxDossierPropre`) :
 * aucune comparaison sur un code financeur n'entre ici.
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

/**
 * Signaux d'un dossier PROPRE au participant (Laurent, 10/09/2026).
 *
 * Calculés par l'appelant à partir de la DONNÉE (liens juridiques, catalogues
 * des organisations rattachées), jamais d'un code financeur. C'est la
 * reformulation en donnée du signal BUG-11 : le code de la page session testait
 * un code financeur en dur ; ici on demande « une autre organisation dont le
 * catalogue ouvre la pièce », ce qui reste vrai au septième financeur.
 */
export interface SignauxDossierPropre {
  /** Un LegalLink `EI_SELF` vers une organisation qui n'est PAS le sponsor de cette session. */
  aLienEiSelfHorsSponsor: boolean;
  /** Les règles des AUTRES organisations rattachées au participant. */
  reglesAutresOrgs: RegleSignatureFinanceur[];
}

/**
 * Une pièce hors régime chez le sponsor, alors que le dossier du participant en
 * porte les signaux. Ce n'est PAS un blocage : rien n'était prévu, donc rien
 * n'échoue. C'est une invitation à corriger la donnée.
 */
export interface AvertissementRegime {
  docType: DocTypeSignable;
  raison: 'REGIME_INCOHERENT';
}

export interface ContexteRegime {
  /** Les 3 colonnes du financeur du participant. `null` = financeur inconnu → rien en régime. */
  regle: RegleSignatureFinanceur | null;
  participantId: string;
  /** L'organisation payeuse : `SessionParticipant.sponsorOrgId`. */
  sponsorOrgId: string | null;
  /**
   * ABSENT par défaut : les appelants du lot C.1 continuent de compiler et de
   * rendre exactement la même chose. Un appelant qui ne sait pas calculer les
   * signaux ne doit pas être forcé d'inventer des `false`.
   */
  signauxDossierPropre?: SignauxDossierPropre;
}

/**
 * Les pièces qu'un simple lien `EI_SELF` hors sponsor suffit à signaler.
 *
 * Une entreprise individuelle rattachée dont le financeur n'est pas renseigné
 * est elle-même une donnée à corriger : elle ne dit rien de l'assiduité, mais
 * elle dit tout du dossier de financement. Table de DONNÉES, comme
 * `COLONNE_PAR_DOCTYPE` : une pièce de plus = une ligne de plus.
 */
const PIECES_SIGNALEES_PAR_LIEN_EI: ReadonlySet<DocTypeSignable> = new Set<DocTypeSignable>([
  'AGEFICE',
]);

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
/**
 * Les pièces hors régime chez le sponsor que le dossier du participant réclame
 * pourtant — le cas Florent HAUSSWIRTH.
 *
 * Inscrit sous le financeur de l'agence qui l'emploie alors que son dossier est
 * celui d'un TNS : sans ce garde-fou, ses pièces sortent en `NA` et son dossier
 * DISPARAÎT de l'écran. Un dossier qui disparaît ne se corrige jamais.
 *
 * Deux signaux, tous deux tirés de la donnée : (a) une autre organisation
 * rattachée dont le catalogue OUVRE la pièce, (b) pour les seules pièces de
 * `PIECES_SIGNALEES_PAR_LIEN_EI`, un lien `EI_SELF` hors sponsor.
 */
function avertissementsRegimeIncoherent(ctx: ContexteRegime): AvertissementRegime[] {
  const signaux = ctx.signauxDossierPropre;
  if (signaux === undefined) return [];

  const horsRegime = docTypesHorsRegime(ctx.regle);
  const avertissements: AvertissementRegime[] = [];

  for (const docType of DOC_TYPES_SIGNABLES) {
    // En régime chez le sponsor : rien d'incohérent, la pièce part normalement.
    if (!horsRegime.has(docType)) continue;

    const ouvertePourUneAutreOrg = signaux.reglesAutresOrgs.some(
      (regle) => signataireDe(docType, regle) !== null,
    );
    const signaleeParLeLien =
      signaux.aLienEiSelfHorsSponsor && PIECES_SIGNALEES_PAR_LIEN_EI.has(docType);

    if (ouvertePourUneAutreOrg || signaleeParLeLien) {
      avertissements.push({ docType, raison: 'REGIME_INCOHERENT' });
    }
  }

  return avertissements;
}

export function resolveRegimeSignature(ctx: ContexteRegime): {
  pieces: PieceASigner[];
  blocages: BlocageRegime[];
  avertissements: AvertissementRegime[];
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

  // L'avertissement se calcule À PART et ne touche NI `pieces` NI `blocages` :
  // il ne déclenche aucun envoi, il rend l'anomalie bruyante.
  return { pieces, blocages, avertissements: avertissementsRegimeIncoherent(ctx) };
}
