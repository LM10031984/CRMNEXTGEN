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
