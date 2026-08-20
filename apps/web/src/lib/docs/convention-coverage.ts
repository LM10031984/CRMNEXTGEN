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

/** `Document.entityType` d'une convention groupe (String libre côté schéma). */
export const GROUP_CONVENTION_ENTITY_TYPE = 'organization';

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

/** Forme minimale d'un Document nécessaire au calcul de couverture. */
export interface CoverageDoc {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
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
 * Ne regarde que les documents de type CONVENTION en `entityType='organization'`
 * — les autres documents rattachés à une organisation sont ignorés.
 */
export function expandGroupConventions(
  docs: ReadonlyArray<CoverageDoc>,
  participants: ReadonlyArray<CoverageParticipant>,
): Map<string, string> {
  const byParticipant = new Map<string, string>();
  for (const d of docs) {
    if (d.type !== 'CONVENTION' || d.entityType !== GROUP_CONVENTION_ENTITY_TYPE) continue;
    for (const p of participants) {
      if (p.sponsorOrgId !== d.entityId) continue;
      // Premier document gagnant : l'appelant trie par récence s'il le souhaite.
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
