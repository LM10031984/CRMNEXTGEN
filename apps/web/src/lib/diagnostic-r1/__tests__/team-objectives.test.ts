import { describe, expect, it } from 'vitest';

import { buildTeamObjectives, type TeamObjectiveInput } from '../team-objectives';

/**
 * La page « performance de votre équipe » sortait avec deux colonnes de tirets
 * sur le premier audit réel. Ce qui est protégé ici : qu'elle dise quelque
 * chose quand les chiffres le permettent, qu'elle se taise quand ils ne le
 * permettent pas, et qu'elle n'écrase jamais ce qu'un humain a saisi.
 */

const p = (over: Partial<TeamObjectiveInput> = {}): TeamObjectiveInput => ({
  displayName: 'Anonyme',
  statut: 'INDEPENDANT',
  caN1: null,
  objectiveCa: null,
  strengths: null,
  priorityNeed: null,
  ...over,
});

/** Les quatre agents de DIAG-0001, l'agence visant 900 k€ contre 720 k€. */
const DIAG_0001 = {
  participants: [
    p({ displayName: 'Marie D.', caN1: 120_000 }),
    p({ displayName: 'Julien P.', caN1: 95_000 }),
    p({ displayName: 'Sophie L.', caN1: 80_000 }),
    p({ displayName: 'Karim B.', caN1: 42_000 }),
  ],
  revenueN1: 720_000,
  revenueGoal: 900_000,
};

describe('Objectif proposé', () => {
  it("applique l'ambition de l'agence à chaque production connue", () => {
    const { lines, growthRate } = buildTeamObjectives(DIAG_0001);
    expect(growthRate).toBeCloseTo(0.25, 5);
    expect(lines.map((l) => l.objectiveCa)).toEqual([150_000, 119_000, 100_000, 53_000]);
    expect(lines.every((l) => l.objectiveIsProposed)).toBe(true);
  });

  it("s'arrondit au millier — un objectif ne se dit pas à l'euro près", () => {
    const { lines } = buildTeamObjectives({
      participants: [p({ caN1: 97_531 })],
      revenueN1: 100_000,
      revenueGoal: 110_000,
    });
    expect(lines[0]!.objectiveCa).toBe(107_000);
  });

  it('laisse la main à ce qui a été saisi en rendez-vous', () => {
    const { lines } = buildTeamObjectives({
      ...DIAG_0001,
      participants: [p({ caN1: 120_000, objectiveCa: 200_000 })],
    });
    expect(lines[0]!.objectiveCa).toBe(200_000);
    expect(lines[0]!.objectiveIsProposed).toBe(false);
  });

  it('ne propose rien plutôt qu’une baisse quand l’objectif est sous le réalisé', () => {
    const { lines, growthRate } = buildTeamObjectives({
      participants: [p({ caN1: 120_000 })],
      revenueN1: 900_000,
      revenueGoal: 700_000,
    });
    expect(growthRate).toBeNull();
    expect(lines[0]!.objectiveCa).toBeNull();
  });

  it('ne propose rien sans production connue', () => {
    const { lines } = buildTeamObjectives({ ...DIAG_0001, participants: [p({ caN1: null })] });
    expect(lines[0]!.objectiveCa).toBeNull();
  });
});

describe('Constats & préconisation', () => {
  it('situe chacun par rapport à la moyenne de son équipe', () => {
    const { lines } = buildTeamObjectives(DIAG_0001);
    // Moyenne = 84 250 €. Karim (42 k€) est à 50 % : le plus gros écart.
    expect(lines[3]!.recommendation).toContain('50 %');
    expect(lines[3]!.recommendation).toContain('prospection');
    // Marie (120 k€) est à 142 % : la meilleure production.
    expect(lines[0]!.recommendation).toContain('Meilleure production');
  });

  it('reprend ce que le commercial a noté, sans le remplacer par la règle', () => {
    const { lines } = buildTeamObjectives({
      ...DIAG_0001,
      participants: [
        p({ caN1: 120_000, strengths: 'Excellente en découverte', priorityNeed: 'Exclusivité' }),
      ],
    });
    // \u202f : espace fine insécable avant les deux-points — sans elle, la
    // ligne casse devant « : » dans le tableau du rapport.
    expect(lines[0]!.recommendation).toBe(
      'Excellente en découverte — Besoin prioritaire\u202f: Exclusivité',
    );
  });

  it('se tait quand il n’y a rien de vérifiable à dire', () => {
    const { lines, hasContent } = buildTeamObjectives({
      participants: [p({ caN1: null })],
      revenueN1: null,
      revenueGoal: null,
    });
    expect(lines[0]!.recommendation).toBeNull();
    expect(hasContent).toBe(false);
  });
});

describe('hasContent — le signal qui décide de masquer les colonnes', () => {
  it('est vrai dès qu’une seule ligne porte quelque chose', () => {
    expect(buildTeamObjectives(DIAG_0001).hasContent).toBe(true);
  });

  it('est faux quand aucune ligne ne porte ni objectif ni constat', () => {
    const r = buildTeamObjectives({
      participants: [p({ statut: 'SALARIE' }), p({ statut: 'DIRIGEANT' })],
      revenueN1: 720_000,
      revenueGoal: 900_000,
    });
    expect(r.hasContent).toBe(false);
  });
});
