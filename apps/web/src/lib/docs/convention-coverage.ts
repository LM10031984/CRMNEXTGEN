/**
 * Couverture « convention » d'un participant — SOURCE UNIQUE.
 *
 * Depuis la quick 260817-mm0, une convention peut prendre deux formes :
 *  - **individuelle** : Document `entityType='participant'`, `participantId` renseigné
 *    (auto-payeur — l'apprenant paye sa formation) ;
 *  - **groupe** : Document `entityType='organization'`, `entityId=sponsorOrgId`,
 *    `participantId=null` — UNE convention signée par le chef d'entreprise pour
 *    tous ses salariés (règle figée le 12/08 : jamais une par stagiaire).
 *
 * La revue Codex de la PR #13 a montré le coût d'avoir traité un seul
 * consommateur : la fiche session voyait la convention groupe, mais ni le
 * dossier OPCO, ni le statut de préparation, ni la garde anti-doublon du
 * générateur individuel. Un salarié d'OPTIMMO était donc annoncé « convention
 * manquante » dans son dossier OPCO alors que le document existait.
 *
 * D'où ce module : **tout code qui demande « ce participant a-t-il une
 * convention ? » doit passer par ici**, jamais par un filtre `participantId`
 * écrit à la main.
 *
 * MODULE NEUTRE : ni 'use server' ni 'use client'. Un fichier `'use server'` ne
 * peut exporter que des fonctions async, or ces helpers sont synchrones et
 * doivent être importables depuis un cœur sans auth comme depuis une page RSC.
 */

/**
 * Forme d'ÉCRITURE d'une convention groupe (`Document.entityType` est un String
 * libre côté schéma). Tout nouveau document de groupe s'écrit ainsi : elle
 * porte le commanditaire (`entityId = sponsorOrgId`), indispensable dès qu'une
 * session réunit plusieurs entreprises.
 */
export const GROUP_CONVENTION_ENTITY_TYPE = 'organization';

/**
 * Formes RECONNUES EN LECTURE (quick 260821-md8).
 *
 * `'session'` est la forme produite par les scripts `_gen-*` : `entityId =
 * sessionId`, `participantId = null`, portée = la session entière, aucun
 * commanditaire porté. Elle existe en production sur SES-0107 / SES-0108 et
 * doit être vue — sinon l'appli annonce « convention manquante » sur un
 * document qui existe, et propose l'action de masse qui régénère des
 * conventions nominatives.
 *
 * Découverte du 21/08 : les deux formes cohabitaient sans se connaître, ce qui
 * mettait DEUX conventions d'entreprise sur la même session.
 */
export const GROUP_CONVENTION_ENTITY_TYPES = ['organization', 'session'] as const;

export type GroupConventionEntityType = (typeof GROUP_CONVENTION_ENTITY_TYPES)[number];

/**
 * Clause Prisma identifiant LA convention groupe d'un commanditaire sur une
 * session. À réutiliser partout plutôt que de recomposer le quadruplet.
 */
export function groupConventionWhere(
  tenantId: string,
  sessionId: string,
  sponsorOrgId: string,
) {
  return {
    tenantId,
    type: 'CONVENTION' as const,
    entityType: GROUP_CONVENTION_ENTITY_TYPE,
    entityId: sponsorOrgId,
    sessionId,
  };
}

/**
 * Clause Prisma reconnaissant LES DEUX formes de convention groupe sur une
 * session. À utiliser en LECTURE (gardes anti-doublon, statuts) ; l'écriture
 * reste en `GROUP_CONVENTION_ENTITY_TYPE`.
 *
 * Toujours scopée `tenantId` + `sessionId` + type CONVENTION : la branche
 * `session` ne porte pas de commanditaire, c'est la session qui la borne.
 */
export function groupConventionAnyShapeWhere(
  tenantId: string,
  sessionId: string,
  sponsorOrgId: string,
) {
  return {
    tenantId,
    type: 'CONVENTION' as const,
    sessionId,
    OR: [
      { entityType: GROUP_CONVENTION_ENTITY_TYPE, entityId: sponsorOrgId },
      { entityType: 'session', participantId: null },
    ],
  };
}

/** Forme minimale d'un Document nécessaire au calcul de couverture. */
export interface CoverageDoc {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
}

/**
 * true si ce Document est une convention de groupe, quelle que soit sa forme
 * de stockage. À préférer à toute comparaison d'`entityType` écrite à la main :
 * c'est elle qui distingue une convention nominative (`participant`) d'un
 * document de groupe, et qui écarte les autres types rattachés à une
 * organisation ou à une session (check-list, facture…).
 */
export function isGroupConventionDoc(d: CoverageDoc): boolean {
  return (
    d.type === 'CONVENTION' &&
    (GROUP_CONVENTION_ENTITY_TYPES as readonly string[]).includes(d.entityType)
  );
}

/** Forme minimale d'un participant nécessaire au calcul de couverture. */
export interface CoverageParticipant {
  id: string;
  sponsorOrgId: string;
}

/**
 * Projette les conventions GROUPE sur chaque participant qu'elles couvrent.
 *
 * Retourne `Map<participantId, documentId>` ne contenant QUE les participants
 * couverts par une convention groupe — à fusionner avec les conventions
 * individuelles déjà connues, sans jamais les écraser (une convention
 * individuelle déjà émise reste la pièce du participant).
 *
 * Ne regarde que les documents de type CONVENTION, dans l'une des deux formes
 * de `GROUP_CONVENTION_ENTITY_TYPES` — les autres documents rattachés à une
 * organisation ou à une session sont ignorés.
 *
 * Les deux formes n'ont pas la même PORTÉE :
 *  - `organization` → apparie sur `sponsorOrgId` : couvre les salariés de CE
 *    commanditaire, et eux seuls ;
 *  - `session` (scripts `_gen-*`) → couvre TOUS les participants reçus. Le
 *    document ne porte aucun commanditaire permettant de discriminer.
 *    ⚠ PRÉCONDITION D'APPEL : ne passer que les participants de la session
 *    concernée. Passer ceux d'une autre session les couvrirait à tort.
 *
 * Deux passes, `organization` d'abord : quand les deux formes cohabitent (cas
 * SES-0107 / SES-0108), c'est la forme d'écriture — celle qui porte le
 * commanditaire — qui fait foi, et chaque inscrit n'est compté qu'une fois.
 */
export function expandGroupConventions(
  docs: ReadonlyArray<CoverageDoc>,
  participants: ReadonlyArray<CoverageParticipant>,
): Map<string, string> {
  const byParticipant = new Map<string, string>();

  // Passe 1 — forme d'écriture, portée « commanditaire ».
  for (const d of docs) {
    if (!isGroupConventionDoc(d) || d.entityType !== GROUP_CONVENTION_ENTITY_TYPE) continue;
    for (const p of participants) {
      if (p.sponsorOrgId !== d.entityId) continue;
      // Premier document gagnant : l'appelant trie par récence s'il le souhaite.
      if (!byParticipant.has(p.id)) byParticipant.set(p.id, d.id);
    }
  }

  // Passe 2 — forme script, portée « session entière ».
  for (const d of docs) {
    if (!isGroupConventionDoc(d) || d.entityType === GROUP_CONVENTION_ENTITY_TYPE) continue;
    for (const p of participants) {
      if (!byParticipant.has(p.id)) byParticipant.set(p.id, d.id);
    }
  }

  return byParticipant;
}

/**
 * true si ce participant est couvert par l'une des conventions groupe fournies.
 * Raccourci de lisibilité pour les gardes (anti-doublon, statut de préparation).
 */
export function isCoveredByGroupConvention(
  docs: ReadonlyArray<CoverageDoc>,
  participant: CoverageParticipant,
): boolean {
  return expandGroupConventions(docs, [participant]).has(participant.id);
}
