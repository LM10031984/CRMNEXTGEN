import { describe, it, expect } from 'vitest';
import { parseProgrammeToDeroule } from '../parse-programme-to-deroule';

/**
 * Quick task 260525-pzl — parser parse-programme-to-deroule.
 *
 * Garanties testees :
 *  - Retro-compat anciennes normes pause dejeuner (12h00-13h00, 11h30-13h00, 12h-13h30)
 *  - Nouvelle norme Start Academy 13h00-14h00 (regle Laurent 25/05/2026)
 *  - Frontiere : pause apres 14h30 = "Pause" (pas dejeuner)
 *  - Modes : multi-jours (header "Jour 1") + mono-jour (sections Matin/Apres-midi)
 */

function findPauseDejeuner(content: ReturnType<typeof parseProgrammeToDeroule>) {
  if (!content) return null;
  const all = content.jours.flatMap((j) => j.sequences);
  return all.find((s) => s.isPause === true) ?? null;
}

describe('parse-programme-to-deroule — retro-compat anciennes normes pause', () => {
  it('gap 12h30 -> 13h00 (30 min, endMin=750) classe "Pause dejeuner"', () => {
    const programme = `
Jour 1 : Cadrage commercial
9h00 – 10h30 : Module 1 introduction
10h30 – 12h30 : Module 2 prospection
13h00 – 14h30 : Module 3 negociation
14h30 – 16h00 : Module 4 closing
`;
    const r = parseProgrammeToDeroule(programme);
    expect(r).not.toBeNull();
    const pause = findPauseDejeuner(r);
    expect(pause).not.toBeNull();
    expect(pause!.objectifs).toBe('Pause déjeuner');
  });

  it('gap 11h30 -> 14h00 (60 min, endMin=690) classe "Pause dejeuner"', () => {
    const programme = `
Jour 1 : Marketing immobilier
9h00 – 10h30 : Module A
10h30 – 11h30 : Module B
14h00 – 16h00 : Module C
`;
    const r = parseProgrammeToDeroule(programme);
    expect(r).not.toBeNull();
    const pause = findPauseDejeuner(r);
    expect(pause).not.toBeNull();
    expect(pause!.objectifs).toBe('Pause déjeuner');
  });

  it('gap matinal 10h30 -> 10h45 (endMin=630) classe "Pause" simple', () => {
    // Cas mono-jour avec ≥3 sequences (fillGapsWithPauses) :
    // ici on veut un gap >=30 min hors plage midi
    const programme = `
Jour 1 : Test pauses matinales
9h00 – 10h30 : Module 1
11h00 – 12h30 : Module 2
13h00 – 14h30 : Module 3
14h30 – 16h00 : Module 4
`;
    const r = parseProgrammeToDeroule(programme);
    expect(r).not.toBeNull();
    const seqs = r!.jours[0]!.sequences;
    // 1ere pause = 10h30-11h00 (endMin=630), 2eme pause = 12h30-13h00 (endMin=750)
    const pauses = seqs.filter((s) => s.isPause);
    expect(pauses.length).toBeGreaterThanOrEqual(2);
    const matinPause = pauses.find((p) => p.duree.startsWith('10h30'));
    expect(matinPause).toBeDefined();
    expect(matinPause!.objectifs).toBe('Pause');
  });
});

describe('parse-programme-to-deroule — nouvelle norme 13h-14h', () => {
  it('gap 13h00 -> 14h00 (60 min, endMin=780) classe "Pause dejeuner" (cas Laurent canonique)', () => {
    const programme = `
Jour 1 : Programme Start Academy 8h
9h00 – 10h30 : Module 1
10h45 – 13h00 : Module 2
14h00 – 15h30 : Module 3
15h45 – 18h00 : Module 4
`;
    const r = parseProgrammeToDeroule(programme);
    expect(r).not.toBeNull();
    const pause = findPauseDejeuner(r);
    expect(pause).not.toBeNull();
    expect(pause!.objectifs).toBe('Pause déjeuner');
    expect(pause!.duree).toContain('13h00 – 14h00');
  });

  it('gap 14h00 -> 15h00 (60 min, endMin=840) classe "Pause dejeuner" (limite haute)', () => {
    const programme = `
Jour 1 : Cas limite borne haute
9h00 – 11h00 : Module 1
11h00 – 14h00 : Module 2 prolonge
15h00 – 16h30 : Module 3
16h30 – 17h30 : Module 4
`;
    const r = parseProgrammeToDeroule(programme);
    expect(r).not.toBeNull();
    const pause = findPauseDejeuner(r);
    expect(pause).not.toBeNull();
    expect(pause!.objectifs).toBe('Pause déjeuner');
  });
});

describe('parse-programme-to-deroule — hors plage = "Pause" simple', () => {
  it('gap 15h00 -> 15h30 (endMin=900) classe "Pause" simple (apres 14h30)', () => {
    const programme = `
Jour 1 : Test pause tardive
9h00 – 11h00 : Module 1
11h00 – 13h00 : Module 2
14h00 – 15h00 : Module 3
15h30 – 17h00 : Module 4
`;
    const r = parseProgrammeToDeroule(programme);
    expect(r).not.toBeNull();
    const seqs = r!.jours[0]!.sequences;
    const pauseTardive = seqs.find((s) => s.isPause && s.duree.startsWith('15h00'));
    expect(pauseTardive).toBeDefined();
    expect(pauseTardive!.objectifs).toBe('Pause');
  });
});

describe('parse-programme-to-deroule — mode mono-jour', () => {
  it('detecte pause 13h-14h en mode mono-jour (sections Matinee/Apres-midi)', () => {
    const programme = `
Matinée :
9h00 – 10h30 : Cadrage strategique
10h45 – 13h00 : Approfondissement
Après-midi :
14h00 – 15h30 : Mise en pratique
15h45 – 18h00 : Cloture et evaluation
`;
    const r = parseProgrammeToDeroule(programme, 'Formation Test 8h');
    expect(r).not.toBeNull();
    expect(r!.jours).toHaveLength(1);
    const pause = findPauseDejeuner(r);
    expect(pause).not.toBeNull();
    expect(pause!.objectifs).toBe('Pause déjeuner');
  });
});
