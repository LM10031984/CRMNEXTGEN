import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';

import { conventionedHoursPerHalfDay } from '@/lib/proposition/pricing';
import type { FundingRuleValues } from '@/lib/financement/types';

import {
  CRENEAU_PRESETS,
  creneauDefaut,
  decrireCreneau,
  decrireCreneauParticipant,
  decrireDureeProduit,
  decrireDureeProduitParticipant,
  formaterHeureOf,
  mesurerCreneau,
  presetDuCreneau,
} from '../creneaux';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

/**
 * 4 h sur site, 2 formateurs — les valeurs d'usine de Start Academy.
 *
 * Le décalage est écrit en clair (`+02:00`, le 5 octobre 2026 est en heure
 * d'été) : une fixture qui s'appuierait sur le fuseau de la machine passerait
 * à Paris et échouerait en CI, ce qui est exactement le défaut qu'on corrige.
 */
function creneau(debut: string, fin: string) {
  return {
    startsAt: new Date(`2026-10-05T${debut}:00+02:00`),
    endsAt: new Date(`2026-10-05T${fin}:00+02:00`),
  };
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

describe('decrireCreneau — la phrase que lit l’admin', () => {
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

describe('decrireCreneauParticipant — la phrase que lit le participant', () => {
  it('dit la demi-journée et les heures sur site, jamais les heures conventionnées', () => {
    expect(decrireCreneauParticipant(mesurerCreneau(creneau('09:00', '13:00'), RULES))).toBe(
      '1 demi-journée · 4 h sur site',
    );
    expect(decrireCreneauParticipant(mesurerCreneau(creneau('09:00', '17:00'), RULES))).toBe(
      '2 demi-journées · 8 h sur site',
    );
  });

  it('ne contient jamais le mot « conventionnées » — relecture du 11/09/2026', () => {
    for (const [d, f] of [['09:00', '13:00'], ['09:00', '17:00'], ['09:00', '11:30']] as const) {
      expect(decrireCreneauParticipant(mesurerCreneau(creneau(d, f), RULES))).not.toMatch(
        /conventionn/,
      );
    }
    expect(decrireDureeProduitParticipant(72, RULES)).toBe('36 h sur site');
    expect(decrireDureeProduitParticipant(8, RULES)).toBe('4 h sur site');
    expect(decrireDureeProduitParticipant(0, RULES)).toBeNull();
    expect(decrireDureeProduitParticipant(null, RULES)).toBeNull();
  });

  it('la phrase admin est la phrase participant complétée — une seule source', () => {
    const m = mesurerCreneau(creneau('09:00', '13:00'), RULES);
    expect(decrireCreneau(m).startsWith(decrireCreneauParticipant(m))).toBe(true);
  });
});

describe('l’heure affichée est celle de l’organisme, pas celle du serveur', () => {
  /**
   * Le défaut vu sur l'aperçu du 10/09/2026 : un créneau de 09:00 à Paris est
   * stocké 07:00 UTC, et le rendu serveur — qui tourne en UTC sur Vercel —
   * l'affichait « 07:00 – 11:00 » au participant. Deux heures d'écart entre ce
   * qu'on annonce et ce qu'on tient.
   */
  it('rend 09:00 pour un créneau stocké à 07:00 UTC (heure d’été)', () => {
    expect(formaterHeureOf(new Date('2026-10-08T07:00:00.000Z'))).toBe('09:00');
    expect(formaterHeureOf(new Date('2026-10-08T11:00:00.000Z'))).toBe('13:00');
  });

  it('suit le changement d’heure — en janvier, Paris est à UTC+1', () => {
    expect(formaterHeureOf(new Date('2027-01-14T08:00:00.000Z'))).toBe('09:00');
  });

  it('reconnaît le préréglage sur les heures de l’organisme, pas sur celles du serveur', () => {
    expect(
      presetDuCreneau(
        {
          startsAt: new Date('2026-10-08T07:00:00.000Z'),
          endsAt: new Date('2026-10-08T11:00:00.000Z'),
        },
        RULES,
      ),
    ).toBe('MATIN');
    expect(
      presetDuCreneau(
        {
          startsAt: new Date('2026-10-22T07:00:00.000Z'),
          endsAt: new Date('2026-10-22T15:00:00.000Z'),
        },
        RULES,
      ),
    ).toBe('JOURNEE');
  });
});

/**
 * La durée d'un `TrainingProduct` est exprimée en HEURES CONVENTIONNÉES —
 * c'est ce que prouvent les journées Faros (FRM-0004..0007) : 336 € HT, soit
 * une demi-journée au tarif §8.1, pour `durationHours = 8`. Ce champ part sur
 * la convention (`convention-template.ts`) et sur l'attestation d'assiduité
 * AGEFICE (`agefice-attendance-generator.ts`), donc sur le dossier financeur :
 * la règle gravée n°2 impose que ce soit LA valeur unique.
 *
 * L'écran ne doit donc jamais afficher « 36 h » ni « 72 h » tout court, mais
 * nommer laquelle des deux il montre.
 */
describe('decrireDureeProduit — nommer l’heure qu’on affiche', () => {
  it('déplie les heures conventionnées en heures sur site, et dit les deux', () => {
    expect(decrireDureeProduit(72, RULES)).toBe('36 h sur site · 72 h conventionnées');
  });

  it('une demi-journée : 8 h conventionnées, 4 h sur site', () => {
    expect(decrireDureeProduit(8, RULES)).toBe('4 h sur site · 8 h conventionnées');
  });

  it('suit le nombre de formateurs du tenant', () => {
    expect(decrireDureeProduit(9, { ...RULES, TRAINER_COUNT_DEFAULT: 3 })).toBe(
      '3 h sur site · 9 h conventionnées',
    );
  });

  it('ne rend rien pour une durée absente ou nulle — mieux vaut taire que mentir', () => {
    expect(decrireDureeProduit(0, RULES)).toBeNull();
    expect(decrireDureeProduit(null, RULES)).toBeNull();
  });
});

describe('ligne rouge §8.1 — le produit et le chiffrage disent le même nombre', () => {
  it('un produit de N demi-journées porte les heures conventionnées du chiffrage', () => {
    for (const halfDays of [1, 2, 9]) {
      const heuresProduit = halfDays * conventionedHoursPerHalfDay(RULES);
      expect(decrireDureeProduit(heuresProduit, RULES)).toContain(
        `${halfDays * conventionedHoursPerHalfDay(RULES)} h conventionnées`,
      );
      // …et les heures sur site retombent sur l'assiette du prix (§8.1).
      expect(decrireDureeProduit(heuresProduit, RULES)).toContain(
        `${halfDays * RULES.HALF_DAY_ONSITE_HOURS} h sur site`,
      );
    }
  });

  it('le parcours canonique de la spec : 9 demi-journées = 72 h conventionnées', () => {
    expect(9 * conventionedHoursPerHalfDay(RULES)).toBe(72);
    expect(decrireDureeProduit(72, RULES)).toBe('36 h sur site · 72 h conventionnées');
  });
});
