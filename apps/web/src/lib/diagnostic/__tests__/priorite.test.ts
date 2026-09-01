/**
 * `prioriser` décide de l'ORDRE des appels du 10 septembre au matin. Une erreur
 * ici ne casse rien à l'écran — elle fait juste rappeler les mauvais en premier,
 * et personne ne s'en aperçoit. D'où une couverture règle par règle.
 */

import { describe, it, expect } from 'vitest';
import { prioriser, ligneSuiviCrm } from '../priorite';
import type { Reponses } from '../scoring';

/** Profil délibérément NEUTRE : aucun critère A ni B ne se déclenche. */
const NEUTRE: Reponses = {
  role: 'CONSEILLER',
  equipe: 'DE_2_A_5',
  temps_perdu: 'REDACTION',
  mandats: 'STABLE',
  usage_ia: 'PONCTUEL',
  origine_affaires: 'RECOMMANDATION',
  priorite: 'TEMPS',
  formation_annee: 'OUI',
};

function p(
  over: Reponses = {},
  rappel: Parameters<typeof prioriser>[0]['rappel'] = 'PLUS_TARD',
  telephone = '',
) {
  return prioriser({ reponses: { ...NEUTRE, ...over }, rappel, telephone });
}

describe('prioriser — niveau A', () => {
  it('« cette semaine » suffit, même sur un profil sans aucun autre signal', () => {
    const r = p({}, 'CETTE_SEMAINE');
    expect(r.niveau).toBe('A');
    expect(r.motifs).toContain('a demandé à être rappelé cette semaine');
  });

  it('un dirigeant est A même sans demande de rappel', () => {
    expect(p({ role: 'DIRIGEANT' }).niveau).toBe('A');
  });

  it('une équipe de 6+ est A', () => {
    expect(p({ equipe: 'DE_6_A_15' }).niveau).toBe('A');
    expect(p({ equipe: 'PLUS_DE_15' }).niveau).toBe('A');
  });

  it('une équipe de 2 à 5 ne suffit PAS', () => {
    expect(p({ equipe: 'DE_2_A_5' }).niveau).toBe('C');
  });

  it('mandats en baisse ET aucune formation cette année → A', () => {
    const r = p({ mandats: 'BAISSE', formation_annee: 'NON' });
    expect(r.niveau).toBe('A');
    expect(r.motifs).toContain('mandats en baisse et aucune formation cette année');
  });

  it('mandats en baisse SEULS ne font pas un A (la conjonction compte)', () => {
    expect(p({ mandats: 'BAISSE' }).niveau).toBe('C');
  });

  it('cumule tous les motifs déclenchés, pas seulement le premier', () => {
    const r = p({ role: 'DIRIGEANT', equipe: 'PLUS_DE_15' }, 'CETTE_SEMAINE');
    expect(r.niveau).toBe('A');
    expect(r.motifs).toHaveLength(3);
  });
});

describe('prioriser — niveau B', () => {
  it('aucune formation cette année → B (droits AGEFICE intacts)', () => {
    const r = p({ formation_annee: 'NON' });
    expect(r.niveau).toBe('B');
    expect(r.motifs[0]).toMatch(/AGEFICE/);
  });

  it('téléphone renseigné → B', () => {
    const r = p({}, 'PLUS_TARD', '06 31 05 63 90');
    expect(r.niveau).toBe('B');
    expect(r.motifs).toContain('téléphone renseigné');
  });

  it('un téléphone fait uniquement d’espaces ne compte pas', () => {
    expect(p({}, 'PLUS_TARD', '   ').niveau).toBe('C');
  });

  it('« la semaine prochaine » sans autre signal ne monte pas en A', () => {
    expect(p({}, 'SEMAINE_PROCHAINE').niveau).toBe('C');
  });
});

describe('prioriser — niveau C', () => {
  it('le profil neutre sans téléphone tombe en C', () => {
    const r = p();
    expect(r.niveau).toBe('C');
    expect(r.motifs).toEqual(['aucun signal fort — email seulement']);
  });

  it('« je ne sais pas » à la question formation ne vaut pas « non »', () => {
    expect(p({ formation_annee: 'INCONNU' }).niveau).toBe('C');
  });

  it('tolère des réponses manquantes sans planter', () => {
    expect(prioriser({ reponses: {}, rappel: null, telephone: '' }).niveau).toBe('C');
  });
});

describe('ligneSuiviCrm', () => {
  it('écrit le niveau EN TÊTE — c’est ce qui rend la colonne triable à l’œil', () => {
    const ligne = ligneSuiviCrm({
      niveau: 'A',
      dominante: 'PROSPECTION_MANDATS',
      rappel: 'CETTE_SEMAINE',
    });
    expect(ligne).toBe(
      '[A] Diagnostic — Rentrer plus de mandats, sans y passer ses journées — rappel cette semaine',
    );
  });

  it('reste lisible quand le prospect n’a pas répondu à la question de rappel', () => {
    expect(
      ligneSuiviCrm({ niveau: 'C', dominante: 'IA_PRODUCTIVITE', rappel: null }),
    ).toContain('rappel non précisé');
  });
});
