import { describe, it, expect } from 'vitest';
import { ProgrammeSchema } from '../programme-schema';

function buildConformeProgramme() {
  return {
    objectives: [
      'Identifier les phases d\'un appel de prospection téléphonique.',
      'Rédiger un script personnalisé adapté à son agence.',
      'Évaluer la qualité d\'un appel selon une grille critériée.',
    ],
    targetAudience: 'Agents commerciaux et négociateurs en immobilier.',
    prerequisites: 'Aucun.',
    pedagogicalMethods: 'Apports théoriques, démonstrations et mises en situation filmées.',
    pedagogicalSupport: 'Livret remis aux participants + accès Canva diaporama.',
    evaluationMethods: 'QCM final 13 questions, grille d\'observation, restitution écrite.',
    trainerProfile: 'Formateur expert en prospection avec 10 ans d\'expérience terrain.',
    accessibility: 'Salle PMR accessible, supports adaptables sur demande, référent handicap : Laurent Marx.',
    accessConditions: 'Inscription au moins 7 jours avant la session via formulaire en ligne.',
    programMd:
      '## Jour 1 — Prospection téléphonique\n### Matin\n- Phases d\'un appel\n- Démonstration du formateur\n### Après-midi\n- Mise en situation\n- Restitution sur grille',
  };
}

describe('ProgrammeSchema : chemin heureux', () => {
  it('Test 1 — un programme conforme passe la validation', () => {
    const r = ProgrammeSchema.safeParse(buildConformeProgramme());
    expect(r.success).toBe(true);
  });
});

describe('ProgrammeSchema : objectifs Bloom (indicateur 2)', () => {
  it('Test 2 — un objectif "Comprendre les bases" est rejeté avec message explicite', () => {
    const data = buildConformeProgramme();
    data.objectives[0] = 'Comprendre les bases de la prospection.';
    const r = ProgrammeSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path[0] === 'objectives' && i.path[1] === 0,
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('comprendre');
      expect(issue?.message).toMatch(/Bloom|verbe/i);
    }
  });

  it('Test 3 — un objectif sans verbe Bloom (nominal) est rejeté', () => {
    const data = buildConformeProgramme();
    data.objectives[1] = 'Les principes du script de prospection.';
    const r = ProgrammeSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path[0] === 'objectives' && i.path[1] === 1,
      );
      expect(issue).toBeDefined();
    }
  });

  it('Test 4 — moins de 2 objectifs est rejeté (forme minimale Qualiopi)', () => {
    const data = buildConformeProgramme();
    data.objectives = ['Identifier les phases d\'un appel de prospection.'];
    const r = ProgrammeSchema.safeParse(data);
    expect(r.success).toBe(false);
  });

  it('Test 5 — accepte un mélange Bloom + autres lignes nominales si la 1ère ligne est Bloom', () => {
    const data = buildConformeProgramme();
    data.objectives[2] =
      'Élaborer un plan de relance commercial sur 30 jours.\nUtiliser des indicateurs de pilotage.';
    const r = ProgrammeSchema.safeParse(data);
    expect(r.success).toBe(true);
  });
});
