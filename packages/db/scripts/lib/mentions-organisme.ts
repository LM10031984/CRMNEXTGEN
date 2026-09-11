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
 * ── LA RÈGLE ────────────────────────────────────────────────────────────────
 *
 *   **Un déroulé de module porte des ÉTAPES D'ANIMATION, pas des mentions
 *   d'organisme.**
 *
 * C'est la formulation finale (arbitrage du 11/09/2026), et elle fait foi. Elle
 * s'est construite en trois temps — deux phrases nommées, puis « le bloc contigu
 * part entier », puis ce principe — et les deux premières formulations n'en étaient
 * que des cas particuliers. Le **titre de section orphelin est un COROLLAIRE** : si
 * on retire ce qu'un titre introduisait, le titre part avec, sinon on crée
 * sciemment un défaut. Ce n'est pas la règle.
 *
 * Le test qui tranche, pour une ligne donnée : **est-ce que ça se fait, à un moment
 * de la séance ?** « Mise en situation : répondre aux objections courantes » se
 * fait. « Présentation visuelle sur support Canva. » se constate — c'est un moyen
 * de l'organisme, qui a sa rubrique ailleurs dans le programme composé.
 *
 * ── Deux listes fermées, deux mécanismes ────────────────────────────────────
 *
 * • `MENTIONS_CANONIQUES` — des PHRASES, reconnues ligne à ligne. Une ligne qui
 *   est une mention et rien d'autre part, où qu'elle soit.
 * • `TITRES_GABARIT` — des TITRES de section, reconnus STRUCTURELLEMENT, pour le
 *   corollaire : un titre part avec son bloc, ou il ne part pas. Suivi de vraies
 *   étapes d'animation, le titre RESTE.
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
 * Ce ne sont plus des questions ouvertes : les arbitrages sont tombés le
 * 11/09/2026 (lot 1 bis). Chaque cas ci-dessous est une DÉCISION, et chacune est
 * verrouillée par un `it()` qui la nomme.
 *
 * • Les 3 LIGNES MIXTES (drive:024#11, drive:028#6, drive:055#10), où la mention
 *   est soudée à de la pédagogie dans la même phrase :
 *   « Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses ».
 *   DÉCISION : **reportées au lot 2**. Les retirer en entier détruirait du
 *   contenu, et les couper est un arbitrage de RÉDACTION. Au lot 2, Laurent relit
 *   déjà du texte (les titres de modules) : c'est là que la phrase se coupe, avec
 *   un œil humain sur la coupe, pas ici.
 *
 * • « Remise des attestations », « Remise des attestations de formation »,
 *   « Remise de l'attestation. » — DÉCISION du 11/09/2026 : **elles restent**.
 *   C'est un vrai moment de fin de session, pas de l'administratif d'organisme.
 *   Ce n'est plus « hors périmètre » : c'est tranché, et un test le verrouille.
 *
 * • Les 3 LIGNES MIXTES sont le SEUL report. Les moyens pédagogiques de
 *   drive:067#1, drive:068#1 et drive:069#1, un temps « laissés et signalés »,
 *   sont PARTIS : ils relèvent de la règle générale (famille 5 plus bas).
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
 * Les DIX-HUIT formes canoniques de MENTION — déjà normalisées, donc sans accent,
 * sans apostrophe courbe et sans ponctuation finale.
 *
 * Chacune couvre plusieurs écritures réelles : `normaliserLigne` absorbe les
 * variantes (les deux apostrophes, la présence ou l'absence de « d' », le point,
 * le point-virgule, les deux-points, les espaces surnuméraires, la puce
 * Markdown). Les 13 formes relevées dans l'instantané au lot 1 se replient sur
 * les sept premières ; le lot 1 bis en ajoute trois (famille 4, le pied de
 * document de drive:058#6) puis huit (famille 5, la tête de déroulé de
 * drive:067#1, drive:068#1 et drive:069#1).
 *
 * Le TITRE de section du bloc de la famille 4 n'est PAS ici : un titre ne se
 * retire jamais à plat, il se retire avec son bloc. Voir `TITRES_GABARIT`.
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

  // ── Famille 4 — les MOYENS PÉDAGOGIQUES du pied de document (lot 1 bis,
  //    arbitrage du 11/09/2026). 7 occurrences : les 4 lignes contiguës de
  //    drive:058#6, plus la seule ligne de modalité dans drive:067#1,
  //    drive:068#1 et drive:069#1.
  //
  // POURQUOI CE DÉFAUT EXISTE — et pourquoi on le corrige ICI et pas à la source.
  //
  // `/moyens pedagogiques et techniques/` est le 4ᵉ motif de `BODY_START` dans
  // `extract-drive-catalog.ts`, et il n'est dans AUCUN motif de `BODY_END`. Sur
  // `drive:058`, le corps a démarré plus tôt (`contenu detaille de la
  // formation`) : ce titre de pied de document tombe donc À L'INTÉRIEUR du corps,
  // et rien ne l'arrête. Les lignes qui le suivent sont avalées comme des puces
  // du déroulé.
  //
  // On ne touche PAS aux délimiteurs. Ajouter ce titre à `BODY_END` déplacerait
  // le découpage de TOUT le corpus — 76 programmes, 402 modules — pour réparer un
  // module. On retire par le FILTRE, qui agit ligne à ligne et se relit dans un
  // `git diff`.
  //
  // POURQUOI QUATRE LIGNES ET PAS DEUX — et pourquoi la RÈGLE, pas le cas.
  //
  // Laurent a nommé les deux dernières. Mais les quatre forment UN SEUL BLOC
  // CONTIGU en fin de module, introduit par son propre titre de section :
  //
  //   - LES MOYENS PÉDAGOGIQUES ET TECHNIQUES      ← le TITRE de la section
  //   - La formation se déroule en présentiel.      ← une modalité d'en-tête
  //   - Les formateurs proposeront des mises en situation…   ← nommée
  //   - Un livret de formation sera remis…                   ← nommée
  //
  // N'en retirer que deux laisserait, dans un déroulé qui part chez un financeur,
  // un titre de section ORPHELIN suivi d'une phrase isolée : on créerait sciemment
  // un défaut — « un défaut créé sciemment est pire que celui qu'on corrigeait »
  // (arbitrage du 11/09/2026). D'où la règle généralisée de `TITRES_GABARIT` plus
  // bas : le titre ne se traite PAS à plat ici, il se traite structurellement.
  //
  // La ligne de modalité, elle, EST une mention à plat. Motif de Laurent, à
  // consigner : « c'est une modalité : elle appartient aux mentions du programme,
  // pas à un déroulé. »
  //
  // Ce que l'élargissement emporte AILLEURS, et c'est à savoir : un ensemble fermé
  // agit sur tout le corpus. « La formation se déroule en présentiel. » ouvre le
  // même bloc avalé dans drive:067#1, drive:068#1 et drive:069#1, qui perdent donc
  // cette ligne aussi. Aucun ne se vide (32, 41 et 41 lignes). Les 5 autres lignes
  // de moyens pédagogiques de ces modules RESTENT — voir la liste des décisions en
  // tête de fichier.
  'la formation se deroule en presentiel',
  'les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des echanges sur les pratiques actuelles',
  'un livret de formation sera remis a chaque participant en debut de formation. le formateur deroulera sa formation avec une presentation canva projetee',

  // ── Famille 5 — les MOYENS PÉDAGOGIQUES en TÊTE de déroulé (15 occurrences
  //    dans drive:067#1, drive:068#1 et drive:069#1). Même arbitrage, appliqué à
  //    la règle générale : ces lignes se CONSTATENT, elles ne se font pas.
  //
  // Ici le bloc avalé n'est pas en pied mais en TÊTE, et il est borné de façon
  // nette : tout ce qui précède « PROGRAMME DÉTAILLÉ (…) » est du moyen
  // d'organisme, tout ce qui suit est de la séance horodatée. C'est cette borne
  // qui rend le retrait sûr — 067#1 passe de 32 à 26 puces, 068#1 et 069#1 de 41
  // à 35, et la première puce devient « PROGRAMME DÉTAILLÉ (…) ».
  //
  // ⚠ CE QUE CE RETRAIT COÛTE, et c'est consigné parce que ça ouvre une question
  // de modèle (D-29, ouverte le 11/09/2026) : plusieurs de ces lignes sont
  // SPÉCIFIQUES au programme — « études de cas réels issus du marché immobilier »,
  // « exercices guidés pas à pas sur la rédaction de prompts » —, alors que la
  // rubrique « Moyens pédagogiques et techniques » du programme composé se remplit
  // en GÉNÉRIQUE depuis l'organisme. On retire donc du spécifique qui n'a pas de
  // point de chute. Le texte exact est conservé, programme par programme, dans
  // `.planning/quick/260911-kwf-…/260911-kwf-SUMMARY-02.md`.
  'presentation visuelle sur support canva',
  'support pedagogique numerique remis a chaque participant',
  'formation orientee pilotage et prise de decision manageriale',
  'etudes de cas reels issus du marche immobilier',
  "ateliers d'analyse guides avec des outils d'intelligence artificielle",
  'formation interactive orientee pratique',
  "demonstrations en direct sur un outil d'intelligence artificielle",
  'exercices guides pas a pas sur la redaction de prompts',
]);

/**
 * Les TITRES DE GABARIT — la seconde liste FERMÉE (lot 1 bis, 11/09/2026).
 *
 * ── La règle qu'ils servent ─────────────────────────────────────────────────
 *
 * « Partout où une mention d'organisme est précédée de son titre de section, le
 * bloc part entier. » Un titre de gabarit est donc retiré quand TOUT ce qui le
 * suit dans le module — jusqu'à la fin du module, ou jusqu'au titre de gabarit
 * suivant — est soit une mention d'organisme, soit un autre titre de gabarit.
 * **Sinon il RESTE**, et c'est le bon comportement : un titre suivi de vraie
 * pédagogie n'est pas un pied de page, et on ne coupe pas du contenu pour faire
 * propre. Voir `retirerMentionsOrganisme`.
 *
 * ── D'où vient ce vocabulaire ───────────────────────────────────────────────
 *
 * Il n'est PAS inventé : ce sont les intitulés du gabarit Qualiopi que
 * l'extraction reconnaît déjà. `BODY_END` (`extract-drive-catalog.ts`) porte
 * `encadrement de l'action`, `moyens d'evaluation`, `modalites d'inscription`,
 * `accessibilite aux personnes`, `tarif`, `contact`, `delai d'acces` ; et
 * `moyens pedagogiques et techniques` est le 4ᵉ motif de `BODY_START`. Les formes
 * sont RECOPIÉES ici — on ne touche ni à `BODY_START` ni à `BODY_END`, dont le
 * moindre changement déplacerait le découpage des 402 modules.
 *
 * ── ⛔ Pourquoi une liste FERMÉE, et jamais « une ligne en majuscules » ──────
 *
 * C'est LA décision qui rend cette règle sûre. Les modules Faros portent des
 * lignes en CAPITALES qui sont du CONTENU légitime : `JEAN-GUY` (29×), `LAURENT`
 * (28×), `APPRENANT` (17×), `SOURCES` (4×), `LIVRABLE 001`, `PROMESSE
 * APPRENANT`, `RÉSULTAT OBSERVABLE`, `DÉCISION DE DIRECTION PÉDAGOGIQUE`,
 * `SA-ADM-M001`… Une heuristique « majuscules = titre de gabarit » détruirait
 * les 855 lignes de `faros:SA-ADM-M001#1`. Un test le verrouille ligne par ligne.
 *
 * Relevé sur le corpus (76 programmes, 402 modules, 11/09/2026) : la SEULE
 * occurrence d'un titre de gabarit dans un déroulé est
 * « LES MOYENS PÉDAGOGIQUES ET TECHNIQUES » dans `drive:058#6`. La règle ne
 * change donc rien d'autre aujourd'hui — elle sert pour demain, le jour où un
 * nouveau document du Drive ramènera son pied de page.
 */
const TITRES_GABARIT: ReadonlySet<string> = new Set([
  // Le 4ᵉ motif de BODY_START — celui qui a créé le défaut de drive:058#6.
  'les moyens pedagogiques et techniques',
  'moyens pedagogiques et techniques',
  'les moyens pedagogiques',
  'moyens pedagogiques',
  'les moyens techniques',
  'moyens techniques',
  // Les 7 motifs de BODY_END, en formes de LIGNE ENTIÈRE.
  "l'encadrement de l'action",
  "encadrement de l'action",
  "les moyens d'encadrement de l'action",
  "les moyens d'evaluation",
  "moyens d'evaluation",
  "les moyens d'evaluation de la formation",
  "modalites d'inscription",
  "les modalites d'inscription",
  'accessibilite aux personnes en situation de handicap',
  'accessibilite aux personnes handicapees',
  'accessibilite aux personnes',
  'tarif',
  'tarifs',
  'contact',
  'contacts',
  "delai d'acces",
  "delais d'acces",
  "les delais d'acces",
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
 * Cette ligne est-elle un TITRE DE GABARIT ?
 *
 * Appartenance à l'ensemble fermé `TITRES_GABARIT`, sur la ligne ENTIÈRE
 * normalisée — exactement la même doctrine que `estMentionOrganisme`, et pour la
 * même raison : une heuristique (« la ligne est en majuscules », « la ligne ne
 * finit pas par un point ») détruirait du contenu Faros légitime.
 *
 * Un titre n'est PAS une mention : il ne se retire jamais seul, il se retire avec
 * son bloc. C'est `retirerMentionsOrganisme` qui en décide.
 */
export function estTitreGabarit(ligne: string): boolean {
  const n = normaliserLigne(ligne);
  return n.length > 0 && TITRES_GABARIT.has(n);
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

  // Passe 1 — les MENTIONS, ligne à ligne.
  const aRetirer = new Set<number>();
  for (let i = 0; i < lignes.length; i++) {
    if (estMentionOrganisme(lignes[i]!)) aRetirer.add(i);
  }

  // Passe 2 — les TITRES DE GABARIT, structurellement : un titre part avec son
  // bloc, ou il ne part pas. On regarde ce qu'il introduit, jusqu'au titre
  // suivant ou jusqu'à la fin du module. Si tout y est du boilerplate, le titre
  // n'introduit plus rien : il part. Sinon il RESTE — un titre suivi de vraie
  // pédagogie n'est pas un pied de page.
  //
  // Le segment VIDE (titre en dernière ligne, ou titre immédiatement suivi d'un
  // autre titre) compte comme « tout est du boilerplate » : un titre qui
  // n'introduit rien est un résidu de pied de page.
  for (let i = 0; i < lignes.length; i++) {
    if (!estTitreGabarit(lignes[i]!)) continue;
    let toutEstBoilerplate = true;
    for (let j = i + 1; j < lignes.length; j++) {
      const suivante = lignes[j]!;
      if (estTitreGabarit(suivante)) break; // fin du segment : au suivant de décider
      if (suivante.trim().length === 0) continue; // une ligne vide ne dit rien
      if (!estMentionOrganisme(suivante)) {
        toutEstBoilerplate = false;
        break;
      }
    }
    if (toutEstBoilerplate) aRetirer.add(i);
  }

  const gardees: string[] = [];
  const retirees: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    if (aRetirer.has(i)) retirees.push(lignes[i]!);
    else gardees.push(lignes[i]!);
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
