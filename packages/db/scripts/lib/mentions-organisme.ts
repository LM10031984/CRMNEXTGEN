/**
 * Les MENTIONS D'ORGANISME — les reconnaître pour les sortir des déroulés de
 * modules (lot 1 du nettoyage de l'extraction Drive, 11/09/2026).
 *
 * ── Le problème ─────────────────────────────────────────────────────────────
 *
 * Le gabarit Qualiopi de Start Academy se termine par deux lignes
 * administratives — « QCM évaluation des acquis », « Questionnaire de
 * satisfaction et clôture de la formation » — et, sur trois programmes, par les
 * états de service des formateurs. L'extraction Drive les a avalées comme des
 * PUCES DU DÉROULÉ, parce qu'elles sont typographiées comme le reste.
 *
 * Ces lignes ne sont pas fausses : elles ont une place légitime, et elles y sont
 * déjà. La section « Modalités d'évaluation » du programme composé les porte, au
 * nom de l'ORGANISME. Dans le déroulé pédagogique d'un module remis à un
 * financeur, c'est du doublon — et un financeur le lit.
 *
 * Mesuré sur l'instantané commité : 101 lignes dans 52 modules, dont 81 en fin
 * de module et 19 en plein milieu.
 *
 * ── Pourquoi un ENSEMBLE FERMÉ, et jamais une recherche de sous-chaîne ───────
 *
 * C'est LA décision qui rend ce filtre sûr, et elle mérite d'être défendue ici
 * pour que personne ne la « simplifie » plus tard en un `/qcm|satisfaction/i`.
 *
 * Les mêmes mots servent de vraies étapes pédagogiques, dans les mêmes fichiers :
 *
 *   « Évaluation de fin de session : Mini-questionnaire ou QCM rapide pour
 *     valider la compréhension des concepts. »
 *   « Évaluation intermédiaire : simulation + mini QCM »
 *   « Quiz final. »  ← à deux lignes de « QCM final », qui est du gabarit
 *
 * Un motif large les détruirait. On compare donc la LIGNE ENTIÈRE normalisée à
 * un ensemble fermé de formes canoniques : une ligne est une mention quand elle
 * est une mention ET RIEN D'AUTRE. Ajouter une forme est un geste explicite, qui
 * se relit dans un `git diff`.
 *
 * ── Ce que ce filtre laisse volontairement passer ───────────────────────────
 *
 * • Les 3 LIGNES MIXTES (drive:024#11, drive:028#6, drive:055#10), où la mention
 *   est soudée à de la pédagogie dans la même phrase :
 *   « Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses ».
 *   Les retirer en entier détruirait du contenu ; les réécrire serait un
 *   arbitrage que Laurent n'a pas donné — il a demandé une suppression pure, sans
 *   arbitrage. Elles restent, et elles sont signalées.
 *
 * • « Remise des attestations », « Remise de l'attestation. » et les MOYENS
 *   PÉDAGOGIQUES de drive:058#6 (« Les formateurs proposeront… », « Un livret de
 *   formation sera remis… ») : mentions d'organisme probables, mais HORS des trois
 *   familles nommées par Laurent. Les retirer serait élargir le périmètre tout
 *   seul. Elles restent, et elles sont signalées.
 *
 * • TOUT le module `faros:SA-ADM-M001#1` « LIVRABLE 001 » (855 lignes) : il
 *   ENSEIGNE le montage du dossier AGEFICE/CFP, donc il parle légitimement
 *   d'attestation, d'émargement et du « nom du formateur ». Un filtre sur ces
 *   mots-là y détruirait le contenu réel. Un test le vérifie ligne par ligne.
 *
 * ── Où ce module est utilisé ────────────────────────────────────────────────
 *
 * • `extract-drive-catalog.ts` — au point de fabrication de `contentMd`. La
 *   normalisation se fait à l'EXTRACTION, JAMAIS par une correction en base :
 *   vérifié le 11/09/2026, un point final retiré à la main en base est revenu au
 *   premier `--apply`.
 * • `import-drive-catalog.ts` — pour décider si la garde « un import ne vide
 *   jamais un contenu écrit » s'applique (voir `doitProtegerLeContenu`).
 *
 * Fonctions PURES, zéro import de prisma, de fs ou de next : c'est ce qui permet
 * de les tester sans base et de les appeler des deux côtés.
 */

/**
 * Les SEPT formes canoniques — déjà normalisées, donc sans accent, sans
 * apostrophe courbe et sans ponctuation finale.
 *
 * Chacune couvre plusieurs écritures réelles : `normaliserLigne` absorbe les
 * variantes (les deux apostrophes, la présence ou l'absence de « d' », le point,
 * le point-virgule, les deux-points, les espaces surnuméraires, la puce
 * Markdown). Les 13 formes relevées dans l'instantané se replient sur ces sept.
 */
const MENTIONS_CANONIQUES: ReadonlySet<string> = new Set([
  // Famille 1 — le QCM du gabarit (46 occurrences, 5 écritures)
  'qcm evaluation des acquis',
  "qcm d'evaluation des acquis",
  'qcm final',
  // Famille 2 — le questionnaire de satisfaction (48 occurrences, 4 écritures)
  'questionnaire de satisfaction',
  'questionnaire de satisfaction et cloture de la formation',
  // Les deux familles soudées, sans une once de pédagogie (1 occurrence)
  "qcm d'evaluation des acquis et questionnaire de satisfaction",
  // Famille 3 — les états de service des formateurs (3 occurrences :
  // drive:016#3, drive:034#3, drive:039#3 — le cas « Gérer les objections »
  // relevé par Laurent sur le programme composé de DIAG-0001)
  "tous les formateurs de l'equipe start-academy ont minimum 8 annees d'experience dans l'immobilier, notamment dans le domaine de la vente de biens, de formation d'agents et de coaching individuel",
]);

/** Apostrophes rencontrées dans les .docx : courbe, modificatrice, droite. */
const APOSTROPHES = /[’ʼ´]/g;
/** Espaces « typographiques » : insécable, insécable fine, fine, demi-cadratin. */
const ESPACES_EXOTIQUES = /[     ]/g;
/** Les diacritiques, une fois le texte décomposé en NFD. */
const DIACRITIQUES = /[̀-ͯ]/g;

/**
 * Ramène une ligne à sa forme comparable.
 *
 * L'ordre compte : on décompose les accents APRÈS le passage en minuscules, et
 * on coupe la ponctuation finale AVANT le `trim()` final, sinon « …formation . »
 * ressort avec son point.
 */
export function normaliserLigne(ligne: string): string {
  return ligne
    .replace(/^\s*[-*•]\s+/, '') // la puce Markdown de tête
    .replace(APOSTROPHES, "'")
    .replace(ESPACES_EXOTIQUES, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,\s]+$/, '') // la ponctuation finale, qui ne porte aucun sens ici
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITIQUES, '')
    .trim();
}

/**
 * Cette ligne est-elle une mention d'organisme ET RIEN D'AUTRE ?
 *
 * Appartenance à l'ensemble fermé, sur la ligne ENTIÈRE. C'est ce test-là, et pas
 * une recherche de sous-chaîne, qui laisse vivre « Évaluation de fin de session :
 * Mini-questionnaire ou QCM rapide… » tout en retirant « QCM évaluation des
 * acquis ; », et qui fait partir « QCM final » sans emporter « Quiz final. ».
 */
export function estMentionOrganisme(ligne: string): boolean {
  const n = normaliserLigne(ligne);
  return n.length > 0 && MENTIONS_CANONIQUES.has(n);
}

/**
 * Retire les mentions d'un déroulé Markdown, et rend AUSSI ce qu'elle a retiré.
 *
 * La liste `retirees` n'est pas décorative : c'est elle qui alimente le warning de
 * l'extraction pour les modules que le filtre vide entièrement. Un module qui se
 * vide en silence est exactement ce qu'on ne veut pas.
 */
export function retirerMentionsOrganisme(contentMd: string | null | undefined): {
  contentMd: string;
  retirees: string[];
} {
  if (contentMd === null || contentMd === undefined || contentMd.length === 0) {
    return { contentMd: '', retirees: [] };
  }
  const lignes = contentMd.split('\n');
  const gardees: string[] = [];
  const retirees: string[] = [];
  for (const ligne of lignes) {
    if (estMentionOrganisme(ligne)) retirees.push(ligne);
    else gardees.push(ligne);
  }
  // Rien retiré ⇒ on rend la chaîne d'origine à l'identique, sans recomposition :
  // un module intact doit l'être au caractère près (cf. faros:SA-ADM-M001#1).
  if (retirees.length === 0) return { contentMd, retirees };
  const recompose = gardees.join('\n');
  return { contentMd: recompose.trim().length === 0 ? '' : recompose, retirees };
}

/**
 * Ce contenu n'est-il QUE des mentions d'organisme ?
 *
 * Vrai uniquement s'il portait quelque chose au départ et qu'il ne reste rien
 * après filtrage. Un contenu vide au départ rend `false` : il n'y avait rien à
 * vider, donc rien à dire.
 *
 * Quatre modules de l'instantané tombent ici — `drive:010#2`, `drive:014#4`,
 * `drive:027#2`, `drive:038#3`. Ce sont des modules FANTÔMES nés du pied de page :
 * leur « titre » est en réalité le dernier objectif de la liste précédente, et
 * leur déroulé n'était que les deux lignes du gabarit. Leur découpage est le
 * lot 3 — ce module-ci ne fait que constater.
 */
export function nEstQueDesMentions(contentMd: string | null | undefined): boolean {
  if (contentMd === null || contentMd === undefined) return false;
  if (contentMd.trim().length === 0) return false;
  return retirerMentionsOrganisme(contentMd).contentMd.trim().length === 0;
}

/**
 * La garde de l'import : faut-il conserver le contenu déjà en base ?
 *
 * La règle posée le 11/09/2026 n'est pas « ne jamais écraser » — ce serait faire
 * du Drive une source morte. C'est : **ne jamais remplacer un contenu non vide
 * par un contenu vide.** Un import qui VIDE un contenu ne peut pas avoir raison ;
 * un import qui le REMPLACE par autre chose, si.
 *
 * La nuance que ce lot ajoute, et c'est la moitié de son intérêt : **cette
 * protection protège la PÉDAGOGIE, pas le boilerplate.** Sans elle, les quatre
 * modules fantômes garderaient en base les deux lignes de pied de page que le
 * filtre vient tout juste de retirer de la source — du garbage protégeant du
 * garbage, et le critère de fin échouerait au premier `--apply`.
 *
 * Donc : si ce qui est en base, passé par le même filtre, ne laisse rien, il n'y
 * a RIEN à protéger → l'écriture passe. On ne réécrit pas la base à la main, on
 * ne normalise rien en base : on décide si la garde s'applique.
 *
 * Non-régression à ne jamais perdre : `drive:047#20` « Atelier pratique :
 * Simulation de réponse aux avis clients », 1540 caractères écrits par Laurent en
 * base alors que le Drive n'a pas de déroulé, reste PROTÉGÉ.
 */
export function doitProtegerLeContenu(
  enBase: string | null | undefined,
  entrant: string | null | undefined,
): boolean {
  const entrantVide = (entrant ?? '').trim().length === 0;
  if (!entrantVide) return false;
  const baseNonVide = (enBase ?? '').trim().length > 0;
  if (!baseNonVide) return false;
  return !nEstQueDesMentions(enBase);
}
