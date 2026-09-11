import { describe, it, expect } from 'vitest';
import { grouperLeadsDormants, type LeadDormant } from '../lead-stale-digest';

/**
 * A-2 envoyait un email PAR lead dormant. Au premier passage sur un
 * historique — ou le lendemain d'un salon, quand trente contacts sont entrés
 * d'un coup — c'est une avalanche, et une avalanche ne se lit pas.
 *
 * Le regroupement se fait par ensemble de DESTINATAIRES, et non « un seul mail
 * pour tous » : le lead part à son commercial et aux managers en escalade.
 * Envoyer à chacun les leads des autres apprendrait à tout le monde à ignorer
 * l'alerte.
 *
 * Test de puissance : regrouper tous les leads dans un seul groupe, sans
 * regarder les destinataires, fait virer ROUGE « sépare deux commerciaux ».
 */

function lead(id: string, hoursIdle: number, ownerUserId: string | null): LeadDormant {
  return { id, nom: `Lead ${id}`, hoursIdle, source: null, ownerUserId };
}

/** Ciblage simplifié : l'owner s'il existe, plus le manager, toujours. */
const ciblage = (l: LeadDormant): string[] => (l.ownerUserId ? [l.ownerUserId, 'mgr'] : ['mgr']);

describe('grouperLeadsDormants', () => {
  it('réunit en UN seul envoi les leads qui vont aux mêmes personnes', () => {
    const groupes = grouperLeadsDormants([lead('a', 30, 'c1'), lead('b', 48, 'c1')], ciblage);

    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.leads.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('sépare deux commerciaux — personne ne reçoit les leads de l’autre', () => {
    const groupes = grouperLeadsDormants([lead('a', 30, 'c1'), lead('b', 30, 'c2')], ciblage);

    expect(groupes).toHaveLength(2);
    const parCle = new Map(groupes.map((g) => [g.userIds.join('|'), g.leads.map((l) => l.id)]));
    expect(parCle.get('c1|mgr')).toEqual(['a']);
    expect(parCle.get('c2|mgr')).toEqual(['b']);
  });

  it('trie le plus dormant en tête — c’est lui qu’il faut traiter d’abord', () => {
    const groupes = grouperLeadsDormants(
      [lead('a', 25, null), lead('b', 200, null), lead('c', 72, null)],
      ciblage,
    );

    expect(groupes[0]!.leads.map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('dédoublonne et trie les destinataires, pour que la clé soit stable', () => {
    const groupes = grouperLeadsDormants([lead('a', 30, 'mgr')], ciblage);

    expect(groupes[0]!.userIds).toEqual(['mgr']);
  });

  it('ignore un lead que personne ne doit recevoir', () => {
    // Sinon on poserait `staleAlertedAt` sur un lead dont personne n'a été
    // prévenu : l'alerte serait perdue pour de bon.
    expect(grouperLeadsDormants([lead('a', 30, null)], () => [])).toEqual([]);
  });

  it('rend une liste vide sans planter', () => {
    expect(grouperLeadsDormants([], ciblage)).toEqual([]);
  });
});
