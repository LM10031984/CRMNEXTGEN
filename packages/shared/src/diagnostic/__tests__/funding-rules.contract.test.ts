import { describe, expect, it } from 'vitest';

import { FUNDING_RULE_KEYS, FUNDING_RULE_SEEDS } from '../funding-rules';

/**
 * Ces tests ne valident pas des montants « métier » (ils changent par décision),
 * ils valident les invariants qui rendent le moteur défendable devant un
 * financeur : chaque clé existe, une seule fois, avec une justification écrite,
 * et les cohérences internes tiennent.
 */
describe('Contrat des règles de financement', () => {
  it('chaque clé déclarée a exactement une valeur semée', () => {
    const seeded = FUNDING_RULE_SEEDS.map((r) => r.key).sort();
    expect(seeded).toEqual([...FUNDING_RULE_KEYS].sort());
    expect(new Set(seeded).size).toBe(seeded.length);
  });

  it('chaque valeur est un nombre fini positif ou nul', () => {
    const invalid = FUNDING_RULE_SEEDS.filter(
      (r) => !Number.isFinite(r.valueNumeric) || r.valueNumeric < 0,
    ).map((r) => r.key);
    expect(invalid).toEqual([]);
  });

  it("chaque règle porte une note expliquant d'où elle sort", () => {
    // Un paramètre financier sans justification écrite devient un chiffre
    // magique dès que celui qui l'a posé n'est plus là pour l'expliquer.
    const bare = FUNDING_RULE_SEEDS.filter((r) => r.notes.trim().length < 40).map((r) => r.key);
    expect(bare).toEqual([]);
  });

  it("l'enveloppe OPCO EP croît avec l'effectif", () => {
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    expect(get('OPCO_EP_ENVELOPE_11_TO_50')).toBeGreaterThan(get('OPCO_EP_ENVELOPE_LT_11'));
  });

  it('le taux réglementaire OPCO EP est supérieur au taux cœur de métier', () => {
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    expect(get('OPCO_EP_RATE_REGLEMENTAIRE')).toBeGreaterThan(get('OPCO_EP_RATE_COEUR_METIER'));
  });

  it('le plafond AGEFICE réduit est inférieur au plafond plein', () => {
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    expect(get('AGEFICE_ANNUAL_CAP_REDUCED')).toBeLessThan(get('AGEFICE_ANNUAL_CAP'));
  });

  it('le présentiel AGEFICE est mieux pris en charge que le distanciel', () => {
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    expect(get('AGEFICE_HOURLY_PRESENTIEL')).toBeGreaterThan(get('AGEFICE_HOURLY_DISTANCIEL'));
  });

  it("la fourchette d'indemnisation AGEFICE est ordonnée", () => {
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    expect(get('AGEFICE_INDEMNITY_MIN')).toBeLessThanOrEqual(get('AGEFICE_INDEMNITY_MAX'));
  });

  it('la demi-journée co-animée vaut 336 € HT/participant et est intégralement couverte en AGEFICE présentiel', () => {
    // L'équation commerciale de Start Academy, celle qui rend la proposition
    // lisible. Elle repose sur DEUX assiettes différentes qui doivent tomber
    // sur le même montant :
    //   • le PRIX se calcule sur les heures sur site   : 4 h × 84 € = 336 €
    //   • le FINANCEMENT sur les heures conventionnées : 8 h × 42 € = 336 €
    // Les confondre double ou divise par deux un devis. Si l'un des quatre
    // paramètres bouge sans que l'autre suive, l'argument « intégralement pris
    // en charge » devient faux — et c'est exactement la mention trompeuse de
    // financement que l'indicateur Qualiopi sanctionne.
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;

    const heuresSurSite = get('HALF_DAY_ONSITE_HOURS');
    const heuresConventionnees = heuresSurSite * get('TRAINER_COUNT_DEFAULT');
    expect(heuresSurSite).toBe(4);
    expect(heuresConventionnees).toBe(8);

    const prixDemiJournee = heuresSurSite * get('PRICE_PER_HOUR_PER_PARTICIPANT');
    expect(prixDemiJournee).toBe(336);

    const priseEnChargeAgefice = heuresConventionnees * get('AGEFICE_HOURLY_PRESENTIEL');
    expect(priseEnChargeAgefice).toBe(336);
    expect(priseEnChargeAgefice).toBe(prixDemiJournee);
  });

  it('le cas canonique des 4 indés tient de bout en bout (36 demi-journées-participant, 9 de groupe)', () => {
    // Fixture canonique de la spec §8.2, validée par Laurent : 4 agents à plus
    // de 7 000 € de production N-1, plafonnés à 3 000 € chacun.
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    const effectif = 4;

    const budgetParAgent = get('AGEFICE_ANNUAL_CAP');
    const budgetTotal = budgetParAgent * effectif;
    expect(budgetTotal).toBe(12000);

    const prixDemiJournee = get('HALF_DAY_ONSITE_HOURS') * get('PRICE_PER_HOUR_PER_PARTICIPANT');
    const demiJourneesParticipant = Math.floor(budgetTotal / prixDemiJournee);
    // Le budget plafonné achète 35 demi-journées-participant pleines ; les 36
    // du raisonnement « 72 h par agent » supposent les 3 024 € non plafonnés.
    // C'est précisément l'écart de 96 € que le commercial doit voir.
    expect(demiJourneesParticipant).toBe(35);

    const volumeNonPlafonne = 72 * get('AGEFICE_HOURLY_PRESENTIEL') * effectif;
    expect(Math.floor(volumeNonPlafonne / prixDemiJournee)).toBe(36);
    expect(volumeNonPlafonne - budgetTotal).toBe(96);

    // 36 demi-journées-participant pour un groupe de 4 qui avance ensemble
    // = 9 demi-journées de groupe.
    expect(36 / effectif).toBe(9);
  });

  it('le plafond AGEFICE mord bien sur le cas canonique des 72 h (écart de 24 €/agent)', () => {
    // D-8 : 72 h × 42 € = 3 024 €, soit 24 € au-dessus du plafond de 3 000 €.
    // Le moteur du lot D DOIT retenir le plafond ; ce test fige l'arithmétique
    // qui rend l'écart attendu, pour qu'il ne surprenne personne en rendez-vous.
    const get = (k: string) => FUNDING_RULE_SEEDS.find((r) => r.key === k)!.valueNumeric;
    const brut = 72 * get('AGEFICE_HOURLY_PRESENTIEL');
    const plafond = get('AGEFICE_ANNUAL_CAP');
    expect(brut).toBe(3024);
    expect(Math.min(brut, plafond)).toBe(3000);
    expect(brut - plafond).toBe(24);
    // Quatre agents → 96 € de reste à charge, le chiffre de la fixture canonique.
    expect((brut - plafond) * 4).toBe(96);
  });
});
