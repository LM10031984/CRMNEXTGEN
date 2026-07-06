/**
 * Comptage « dossiers AGEFICE prêts / éligibles » pour le row de la fiche
 * session (étapes 2 et 4).
 *
 * HOTFIX 2 (2026-06-10) — Laurent a vu « (2/1) » sur SES-0093 : 2 docs AGEFICE
 * générés mais 1 seul TNS éligible (2 inscrits). Le numérateur comptait TOUS
 * les Document.type='AGEFICE' par participant, sans intersecter avec le set des
 * participants RÉELLEMENT éligibles. Un dossier généré pour un participant
 * devenu non-éligible (changement de financeur, désinscription, doublon)
 * gonflait le numérateur au-dessus du dénominateur — un « X/Y » avec X>Y est
 * incohérent par construction.
 *
 * Sémantique attendue : numérateur = nombre de participants ÉLIGIBLES qui ont
 * un dossier AGEFICE (donc borné par le nombre d'éligibles). Résultat sur
 * SES-0093 : (1/1).
 */

/**
 * @param ageficeDocParticipantIds participantIds (distincts) ayant un Document
 *   AGEFICE rattaché.
 * @param eligibleParticipantIds participantIds (distincts) éligibles AGEFICE
 *   (TNS : sponsor AGEFICE ou EI/agent commercial avec AgeficeProfile).
 * @returns nombre de participants éligibles disposant d'un dossier AGEFICE.
 *   Borné par `eligibleParticipantIds.length` (un X/Y avec X>Y est impossible).
 */
export function countAgeficeReady(
  ageficeDocParticipantIds: Iterable<string>,
  eligibleParticipantIds: Iterable<string>,
): number {
  const eligible = new Set(eligibleParticipantIds);
  const ready = new Set<string>();
  for (const id of ageficeDocParticipantIds) {
    if (eligible.has(id)) ready.add(id);
  }
  return ready.size;
}
