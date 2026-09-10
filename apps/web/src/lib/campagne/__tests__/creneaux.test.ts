import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';

import { conventionedHoursPerHalfDay } from '@/lib/proposition/pricing';
import type { FundingRuleValues } from '@/lib/financement/types';

import {
  CRENEAU_PRESETS,
  creneauDefaut,
  decrireCreneau,
  mesurerCreneau,
  presetDuCreneau,
} from '../creneaux';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

/** 4 h sur site, 2 formateurs — les valeurs d'usine de Start Academy. */
function creneau(debut: string, fin: string) {
  return { startsAt: new Date(`2026-10-05T${debut}:00`), endsAt: new Date(`2026-10-05T${fin}:00`) };
}

describe('mesurerCreneau — la demi-journée est l’unité, pas la journée', () => {
  it('4 h sur site = 1 demi-journée = 8 h conventionnées', () => {
    const m = mesurerCreneau(creneau('09:00', '13:00'), RULES);
    expect(m.onsiteHours).toBe(4);
    expect(m.halfDays).toBe(1);
    expect(m.conventionedHours).toBe(8);
  });

  it('09:00–17:00 n’est pas « une journée » : c’est 2 demi-journées, 16 h conventionnées', () => {
    const m = mesurerCreneau(creneau('09:00', '17:00'), RULES);
    expect(m.halfDays).toBe(2);
    expect(m.conventionedHours).toBe(16);
  });

  it('une journée avec pause déjeuner (09:00–18:00) reste 2 demi-journées', () => {
    // 9 h écoulées / 4 = 2,25 → arrondi au plus proche = 2. C'est le cas réel
    // d'une journée sur site : la pause n'ajoute pas une demi-journée vendue.
    expect(mesurerCreneau(creneau('09:00', '18:00'), RULES).halfDays).toBe(2);
  });

  it('un créneau plus court qu’une demi-journée compte quand même pour une (D-11, arrondi supérieur)', () => {
    expect(mesurerCreneau(creneau('09:00', '11:00'), RULES).halfDays).toBe(1);
    expect(mesurerCreneau(creneau('09:00', '09:30'), RULES).halfDays).toBe(1);
  });

  it('6 h = 1,5 demi-journée → 2 : aucun droit ne se perd (D-11)', () => {
    expect(mesurerCreneau(creneau('09:00', '15:00'), RULES).halfDays).toBe(2);
  });

  it('suit le paramètre tenant, jamais une constante en dur', () => {
    const surMesure = { ...RULES, HALF_DAY_ONSITE_HOURS: 3, TRAINER_COUNT_DEFAULT: 3 };
    const m = mesurerCreneau(creneau('09:00', '12:00'), surMesure);
    expect(m.halfDays).toBe(1);
    expect(m.conventionedHours).toBe(9);
  });
});

describe('ligne rouge §8.1 — une seule source pour les heures conventionnées', () => {
  it('la campagne dérive ses heures du même helper que le chiffrage', () => {
    for (const halfDays of [1, 2, 3, 4, 9]) {
      const m = mesurerCreneau(
        {
          startsAt: new Date('2026-10-05T08:00:00'),
          endsAt: new Date(
            new Date('2026-10-05T08:00:00').getTime() +
              halfDays * RULES.HALF_DAY_ONSITE_HOURS * 3_600_000,
          ),
        },
        RULES,
      );
      expect(m.halfDays).toBe(halfDays);
      // Exactement ce que `computePricing` porterait sur une ligne de N demi-journées.
      expect(m.conventionedHours).toBe(halfDays * conventionedHoursPerHalfDay(RULES));
    }
  });
});

describe('creneauDefaut — une demi-journée, pas une journée pleine', () => {
  it('propose le matin, calé sur la durée paramétrée', () => {
    expect(creneauDefaut(RULES)).toEqual({ debut: '09:00', fin: '13:00' });
  });

  it('un tenant à 3 h de demi-journée finit à 12:00', () => {
    expect(creneauDefaut({ ...RULES, HALF_DAY_ONSITE_HOURS: 3 })).toEqual({
      debut: '09:00',
      fin: '12:00',
    });
  });
});

describe('CRENEAU_PRESETS — ce que l’écran propose', () => {
  it('trois choix, dont la journée qui annonce ses 2 demi-journées', () => {
    const presets = CRENEAU_PRESETS(RULES);
    expect(presets.map((p) => p.key)).toEqual(['MATIN', 'APRES_MIDI', 'JOURNEE']);
    expect(presets.find((p) => p.key === 'JOURNEE')?.halfDays).toBe(2);
    expect(presets.find((p) => p.key === 'MATIN')).toMatchObject({
      debut: '09:00',
      fin: '13:00',
      halfDays: 1,
    });
    expect(presets.find((p) => p.key === 'APRES_MIDI')).toMatchObject({
      debut: '14:00',
      fin: '18:00',
      halfDays: 1,
    });
  });

  it('reconnaît le préréglage d’un créneau déjà enregistré', () => {
    expect(presetDuCreneau(creneau('09:00', '13:00'), RULES)).toBe('MATIN');
    expect(presetDuCreneau(creneau('14:00', '18:00'), RULES)).toBe('APRES_MIDI');
    expect(presetDuCreneau(creneau('09:00', '17:00'), RULES)).toBe('JOURNEE');
    expect(presetDuCreneau(creneau('10:15', '16:45'), RULES)).toBe('PERSONNALISE');
  });
});

describe('decrireCreneau — la phrase que lisent l’admin et le participant', () => {
  it('dit la demi-journée, les heures sur site et les heures conventionnées', () => {
    expect(decrireCreneau(mesurerCreneau(creneau('09:00', '13:00'), RULES))).toBe(
      '1 demi-journée · 4 h sur site · 8 h conventionnées',
    );
  });

  it('accorde le pluriel', () => {
    expect(decrireCreneau(mesurerCreneau(creneau('09:00', '17:00'), RULES))).toBe(
      '2 demi-journées · 8 h sur site · 16 h conventionnées',
    );
  });

  it('affiche les demi-heures sans virgule flottante bavarde', () => {
    expect(decrireCreneau(mesurerCreneau(creneau('09:00', '11:30'), RULES))).toBe(
      '1 demi-journée · 2,5 h sur site · 8 h conventionnées',
    );
  });
});
