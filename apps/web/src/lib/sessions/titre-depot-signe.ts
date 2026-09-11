/**
 * Le titre de la zone de dépôt des scans signés — correction n°5 du retour
 * d'écran Laurent (11/09/2026).
 *
 * POURQUOI UNE TABLE, ET PAS UNE CONCATÉNATION. L'en-tête se composait
 * jusqu'ici en `Déposer les ${libellé du type} signés`, le libellé venant de
 * l'option `<select>` passée en minuscules. Sur la convention, cela donnait
 * « Déposer les convention signés » : ni pluriel, ni accord. Ce n'est pas une
 * faute isolée — une concaténation qui porte le pluriel et l'accord EN DUR en
 * produira une au prochain type branché, et personne ne la verra avant qu'un
 * utilisateur ne la signale.
 *
 * Ici, le pluriel et l'accord sont écrits DANS LA DONNÉE, une fois, à côté du
 * type qu'ils qualifient. Brancher une pièce de plus = une ligne, comme
 * `COLONNE_PAR_DOCTYPE` dans `regime.ts`.
 *
 * PUR ET SANS DÉPENDANCE : la zone de dépôt est un composant client, ce module
 * ne doit rien traîner avec lui.
 */

/**
 * Les types réellement proposés par les deux onglets.
 *
 *  - Avant  : CONVENTION, AGEFICE, CONVOCATION (`AVANT_SIGNABLE_DOC_TYPES`)
 *  - Après  : EMARGEMENT, ASSIDUITE
 *
 * Clés `string` et non `DocType` : la zone de dépôt reçoit un `docType: string`
 * (les clés de `SessionParticipant.docStatus` sont plus larges que l'enum
 * Prisma, cf. `doc-scope.ts`). Un type non branché retombe sur le titre neutre.
 */
export const TITRE_DEPOT_PAR_DOCTYPE: Record<string, string> = {
  CONVENTION: 'Déposer les conventions signées',
  AGEFICE: 'Déposer les dossiers AGEFICE signés',
  CONVOCATION: 'Déposer les convocations signées',
  EMARGEMENT: 'Déposer les feuilles d’émargement signées',
  ASSIDUITE: 'Déposer les attestations d’assiduité signées',
};

/** Le titre neutre : jamais un accord deviné sur un libellé quelconque. */
const TITRE_PAR_DEFAUT = 'Déposer les documents signés';

export function titreDepotSigne(docType: string): string {
  return TITRE_DEPOT_PAR_DOCTYPE[docType] ?? TITRE_PAR_DEFAUT;
}

/* ── Les mots de la zone repliée ──────────────────────────────────────────── */

/**
 * Demande n°4 de Laurent (11/09/2026) — la zone de dépôt rejoint le bloc
 * « Signature électronique », en section repliée sous les lignes.
 *
 * POURQUOI ICI ET PAS DANS LE COMPOSANT. Trois raisons, toutes vérifiées dans
 * ce dépôt : (1) le composant est un client component, ses chaînes ne sont
 * autrement testables qu'en montant du DOM ; (2) une chaîne recopiée dans un
 * test se pique d'apostrophes typographiques et finit par garder autre chose
 * que ce qui s'affiche ; (3) ces mots sont une DÉCISION de Laurent, au mot
 * près — ils méritent une valeur gardée littéralement, pas une inspection
 * visuelle.
 */

/**
 * Le titre est une QUESTION, pas un nom de rubrique.
 *
 * « Déposer les conventions signées » décrit un geste ; « Exemplaire signé à la
 * main ? » désigne une SITUATION, et c'est ce qui permet à l'admin de savoir
 * en un coup d'œil si cette section le concerne. Les titres par type de
 * document (`TITRE_DEPOT_PAR_DOCTYPE`) restent en service à l'intérieur, là où
 * les fichiers atterrissent — c'est là qu'il faut nommer la pièce.
 */
export const TITRE_DEPOT_MANUEL = 'Exemplaire signé à la main ?';

/**
 * L'aide, dictée par Laurent au mot près.
 *
 * Elle dit les DEUX chemins de rattachement dans leur ordre réel (le nom du
 * fichier d'abord, `autoAssignFiles` ; la liste ensuite, quand il n'a pas
 * reconnu), puis la TROISIÈME porte d'entrée — la cellule de la matrice. Sans
 * cette dernière phrase, le menu de la cellule reste un geste que personne ne
 * découvre.
 */
export const AIDE_DEPOT_MANUEL =
  'Glissez le PDF : il sera rattaché au participant dont le nom figure dans le nom du ' +
  'fichier, sinon vous choisissez dans la liste. Vous pouvez aussi le déposer ' +
  'directement sur la cellule du participant dans la matrice.';

/**
 * POURQUOI CETTE ZONE NE SERT QU'AU PAPIER.
 *
 * Sans cette phrase, un admin qui vient d'envoyer une convention en signature
 * se demande s'il doit aussi en déposer le scan ici — et finit par le faire.
 * Or déposer un scan sur une pièce partie ANNULE l'envoi chez le prestataire
 * (décision n°4, garde fail-closed de C.2b-3) : le geste le mieux intentionné
 * défait le précédent.
 *
 * Elle est écrite au FUTUR et nomme le lot : le retour automatique n'existe pas
 * encore. Promettre au présent ce que le webhook n'apporte pas ferait attendre
 * un signé qui ne remontera pas.
 */
export const MENTION_RETOUR_AUTOMATIQUE =
  'Les pièces envoyées en signature électronique n’ont pas à passer par ici : elles ' +
  'reviendront automatiquement une fois signées, dès que le retour du prestataire sera ' +
  'branché (lot C.3). Cette zone ne sert qu’au papier.';
