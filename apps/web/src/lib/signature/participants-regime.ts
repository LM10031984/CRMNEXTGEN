/**
 * Le régime d'un participant, lu depuis la donnée — module PUR, DEUX APPELANTS.
 * Spec signature 2026-09-04 §3 bis (D-10), lot C.2b-1.
 *
 * POURQUOI CE FICHIER EXISTE. Deux endroits répondent à « ce participant
 * relève-t-il d'AGEFICE ? » : la fiche session, qui décide ce que l'écran
 * propose, et `signature-envoi.ts`, qui décide ce qui part réellement en
 * signature. Tant qu'ils répondaient chacun de leur côté, l'écran promettait
 * des envois que `planifierEnvoi` ne planifiait pas — et inversement. C'est
 * exactement la divergence que le lot C.2a avait déjà supprimée pour
 * `representant.ts` (« le signataire ne peut pas diverger du nom que le PDF
 * imprime »). Un seul mapper, donc, et les deux ne peuvent plus se contredire.
 *
 * CE QU'IL REMPLACE. La dérivation élargie BUG-11 de la fiche session déclarait
 * `isAgefice = true` dès qu'un apprenant portait un lien `EI_SELF` ou une autre
 * organisation rattachée à ce financeur, même quand son inscription relevait
 * d'un tout autre financeur. Décision Laurent du 10/09/2026 : le régime se lit
 * sur le commanditaire DE CETTE INSCRIPTION, un seul financeur par participant.
 * La contrepartie est le garde-fou « régime incohérent » de `regime.ts`, qui
 * rend l'anomalie BRUYANTE au lieu de la faire disparaître.
 *
 * PUR : ni Prisma, ni réseau, ni horloge. La lecture d'`OpcoCatalog` vit à côté,
 * dans `catalogue-regime.ts`. Ce module est gardé par le test d'anti-`if`
 * financeur de `regime.test.ts` — la règle vient de la donnée, jamais d'un code
 * reconnu au passage.
 */

import {
  DOC_TYPES_SIGNABLES,
  docTypesHorsRegime,
  type DocTypeSignable,
  type RegleSignatureFinanceur,
} from './regime';
import type { ParticipantPourEnvoi } from './plan-envoi';

/** Un `LegalLink` réduit à ce que le régime en lit. */
export interface LienJuridiqueLu {
  role: string;
  organizationId: string;
  organization: { opcoCode: string | null } | null;
}

/**
 * Une inscription telle que la base la rend, réduite au strict nécessaire.
 *
 * `nomAffiche` est FOURNI, pas recalculé : la page et le moteur le composent
 * déjà tous deux en « Prénom NOM » (`nomAffiche()` de `representant.ts`). Le
 * recomposer ici en ferait une troisième source.
 */
export interface ParticipantLu {
  participantId: string;
  nomAffiche: string;
  sponsorOrgId: string | null;
  /** `brandName ?? legalName` — ce que l'admin reconnaît à l'écran. */
  sponsorOrgLabel: string | null;
  sponsorOpcoCode: string | null;
  liens: readonly LienJuridiqueLu[];
}

/** Une chaîne utile, ou `null`. Un champ rempli d'espaces est un champ vide. */
function codeUtile(valeur: string | null | undefined): string | null {
  const nettoye = (valeur ?? '').trim();
  return nettoye.length > 0 ? nettoye : null;
}

/**
 * Tous les codes financeurs rencontrés sur ces inscriptions : celui du
 * commanditaire ET ceux des organisations rattachées, qui servent au garde-fou
 * « régime incohérent ».
 *
 * Sert à ne faire qu'UN aller-retour vers `OpcoCatalog` pour toute une session,
 * quel que soit le nombre d'inscrits.
 */
export function codesFinanceursDe(participants: readonly ParticipantLu[]): string[] {
  const codes = new Set<string>();
  for (const participant of participants) {
    const duSponsor = codeUtile(participant.sponsorOpcoCode);
    if (duSponsor !== null) codes.add(duSponsor);
    for (const lien of participant.liens) {
      const duLien = codeUtile(lien.organization?.opcoCode);
      if (duLien !== null) codes.add(duLien);
    }
  }
  return [...codes];
}

/**
 * Les trois colonnes de ce financeur, ou `null`.
 *
 * `null` couvre les deux inconnus — code absent, code hors catalogue — et se
 * traduit, chez `resolveRegimeSignature`, par AUCUNE pièce en régime :
 * l'inconnu ne vaut pas trois signatures par défaut.
 */
export function regleDuFinanceur(
  code: string | null | undefined,
  regles: ReadonlyMap<string, RegleSignatureFinanceur>,
): RegleSignatureFinanceur | null {
  const cherche = codeUtile(code);
  if (cherche === null) return null;
  return regles.get(cherche) ?? null;
}

/**
 * L'inscription telle que le plan d'envoi la veut.
 *
 * Corps repris à l'identique du `chargerContexte` de `signature-envoi.ts`
 * (lot C.2a) : extraction à comportement constant, pas réécriture.
 */
export function participantPourEnvoi(
  participant: ParticipantLu,
  regles: ReadonlyMap<string, RegleSignatureFinanceur>,
): ParticipantPourEnvoi {
  const autresLiens = participant.liens.filter(
    (lien) => lien.organizationId !== participant.sponsorOrgId,
  );

  return {
    participantId: participant.participantId,
    nomAffiche: participant.nomAffiche,
    sponsorOrgId: participant.sponsorOrgId,
    sponsorOrgLabel: participant.sponsorOrgLabel,
    regle: regleDuFinanceur(participant.sponsorOpcoCode, regles),
    signauxDossierPropre: {
      aLienEiSelfHorsSponsor: autresLiens.some((lien) => lien.role === 'EI_SELF'),
      reglesAutresOrgs: autresLiens
        .map((lien) => regleDuFinanceur(lien.organization?.opcoCode, regles))
        .filter((regle): regle is RegleSignatureFinanceur => regle !== null),
    },
  };
}

/**
 * Les pièces qui existent QUEL QUE SOIT le financeur.
 *
 * TABLE DE DONNÉES, d'une ligne aujourd'hui, dans l'esprit de
 * `COLONNE_PAR_DOCTYPE` : la convention est une obligation légale
 * (Art. L6353-1), pas une règle de financeur — les six financeurs seedés
 * ouvrent d'ailleurs tous `conventionSigner`. Une pièce de plus ici = une ligne,
 * pas une branche.
 */
const PIECES_HORS_FINANCEUR: ReadonlySet<DocTypeSignable> = new Set<DocTypeSignable>([
  'CONVENTION',
]);

/**
 * Les pièces SANS OBJET **à l'écran** pour ce participant — le `NA` de la matrice.
 *
 * ⚠ CE N'EST PAS `docTypesHorsRegime`, ET C'EST VOULU (écart n°1 du lot C.2b-1,
 * constaté au contact du code le 10/09/2026).
 *
 * `docTypesHorsRegime(null)` rend les TROIS pièces. C'est le bon réflexe pour
 * l'ENVOI — un financeur inconnu ne justifie aucune signature — et le mauvais
 * pour l'AFFICHAGE : un commanditaire sans code financeur, c'est le cas courant
 * du « fonds propres » et de l'entreprise qui paye directement
 * (`FinancingMode.AUTOFINANCEMENT` / `ENTREPRISE`). Sa convention est due. Un
 * `NA` la ferait disparaître de la matrice — et le garde-fou « régime
 * incohérent » ne la rattraperait pas, puisqu'il ne se déclenche que sur les
 * signaux d'un dossier propre. Ce serait le `NA` silencieux que la spec
 * interdit, posé sur la seule pièce dont l'absence est une faute légale.
 *
 * Régime CONNU ⇒ complément exact des pièces en régime, sans exception : les
 * financeurs catalogués ouvrent tous la convention, la table ci-dessus n'a donc
 * rien à y corriger.
 */
export function docTypesSansObjet(
  regle: RegleSignatureFinanceur | null,
): ReadonlySet<DocTypeSignable> {
  if (regle !== null) return docTypesHorsRegime(regle);
  return new Set(DOC_TYPES_SIGNABLES.filter((docType) => !PIECES_HORS_FINANCEUR.has(docType)));
}

/**
 * La colonne AGEFICE de la matrice doit-elle être affichée ?
 *
 * TROIS RAISONS DE LA GARDER, et la deuxième est la contrepartie du changement
 * de règle : un dossier AGEFICE DÉJÀ GÉNÉRÉ ne doit jamais disparaître de
 * l'écran du seul fait que le régime a cessé de reconnaître son porteur. Un
 * dossier qui disparaît de l'écran ne se corrige jamais. La troisième garde
 * visible l'apprenant qui porte un avertissement « régime incohérent » : sans
 * elle, l'anomalie qu'on vient de rendre bruyante n'aurait nulle part où
 * s'afficher.
 */
export function colonneAgeficeVisible(a: {
  participants: readonly { participantId: string; enRegime: ReadonlySet<DocTypeSignable> }[];
  participantsAvecDocumentAgefice: ReadonlySet<string>;
  participantsAvertisAgefice: ReadonlySet<string>;
}): boolean {
  return a.participants.some(
    (participant) =>
      participant.enRegime.has('AGEFICE') ||
      a.participantsAvecDocumentAgefice.has(participant.participantId) ||
      a.participantsAvertisAgefice.has(participant.participantId),
  );
}
