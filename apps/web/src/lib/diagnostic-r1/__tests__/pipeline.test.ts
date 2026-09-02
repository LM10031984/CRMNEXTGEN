import { describe, expect, it } from 'vitest';

import { computePipeline, DEFAULT_BENCHMARKS } from '../pipeline';

/**
 * La synthèse pipeline est le second moment de démonstration du R1 : après le
 * chapitre 8, le commercial retourne l'écran et montre au dirigeant où sa
 * chaîne fuit. Elle doit donc être immédiate, honnête sur ce qu'elle ignore, et
 * ne jamais inventer un maillon faible faute de données.
 */

const AGENCE = {
  'prospecting-contacts-per-month': 100,
  'seller-meetings-per-month': 20,
  'mandates-per-month': 8,
  'mandates-exclusivity-percent': 25,
  'visits-per-month': 60,
  'offers-per-month': 12,
  'compromis-per-month': 7,
  'actes-per-month': 6,
  'identity-sales-n1': 72,
  'identity-revenue-n1': 720_000,
};

describe('Le tunnel, étape par étape', () => {
  const r = computePipeline({ answers: AGENCE });

  it('restitue les 7 étapes dans l’ordre de la chaîne de production', () => {
    expect(r.stages.map((s) => s.key)).toEqual([
      'contacts',
      'rdv',
      'mandats',
      'visites',
      'offres',
      'compromis',
      'actes',
    ]);
  });

  it('calcule les taux de passage entre étapes consécutives', () => {
    const rdv = r.stages.find((s) => s.key === 'rdv')!;
    expect(rdv.value).toBe(20);
    expect(rdv.conversionPercent).toBe(20); // 20 RDV pour 100 contacts
  });

  it('compare chaque taux au repère métier', () => {
    const mandats = r.stages.find((s) => s.key === 'mandats')!;
    expect(mandats.conversionPercent).toBe(40); // 8 mandats pour 20 RDV
    expect(mandats.benchmark).toBe(DEFAULT_BENCHMARKS.rdvToMandatPercent);
    expect(mandats.status).toBe('conforme');
  });

  it('mesure le CA moyen par vente à partir du déclaratif', () => {
    expect(r.averageRevenuePerSale).toBe(10_000);
  });
});

describe('Les deux maillons faibles', () => {
  it('désigne les deux étapes les plus en retard sur leur repère', () => {
    const r = computePipeline({
      answers: {
        ...AGENCE,
        'offers-per-month': 6, // 6 offres pour 60 visites : très en dessous
        'compromis-per-month': 2, // 2 compromis pour 6 offres : sous le repère
      },
    });
    expect(r.weakestLinks).toHaveLength(2);
    expect(r.weakestLinks.map((s) => s.key)).toContain('compromis');
  });

  it("n'en désigne aucun quand tout est au niveau — on n'invente pas un problème", () => {
    const r = computePipeline({
      answers: {
        'prospecting-contacts-per-month': 100,
        'seller-meetings-per-month': 30,
        'mandates-per-month': 15,
        'mandates-exclusivity-percent': 45,
        'visits-per-month': 60,
        'offers-per-month': 45,
        'compromis-per-month': 40,
        'actes-per-month': 38,
      },
    });
    expect(r.weakestLinks).toEqual([]);
  });

  it('chiffre l’enjeu en euros du premier maillon faible', () => {
    const r = computePipeline({
      answers: { ...AGENCE, 'offers-per-month': 6 },
    });
    const offres = r.weakestLinks.find((s) => s.key === 'offres');
    expect(offres).toBeDefined();
    expect(offres!.annualImpactEuros).toBeGreaterThan(0);
  });
});

describe('D-12 — le montant mis en avant reste tenable en rendez-vous', () => {
  it('met en avant la MOITIÉ du chemin vers le repère, pas la totalité', () => {
    // Écart modeste : 20 offres pour 60 visites = 33,3 %, au-dessus du repère.
    // On force un petit retard pour rester sous le plafond de crédibilité.
    const r = computePipeline({
      answers: { ...AGENCE, 'visits-per-month': 60, 'offers-per-month': 14 },
    });
    const offres = r.stages.find((s) => s.key === 'offres')!;
    expect(offres.status).toBe('faible');
    expect(offres.impactPresentation).toBe('montant');
    expect(offres.headlineImpactEuros).toBe(Math.round(offres.annualImpactEuros! * 0.5));
  });

  it('renonce au montant au-delà de 25 % du CA N-1, et le dit autrement', () => {
    // Le cas qui a motivé la décision : 9 offres pour 60 visites sur une agence
    // à 720 000 €. Le calcul complet donne 480 000 €, la moitié 240 000 € —
    // au-dessus des 180 000 € du plafond. Aucun montant ne sort.
    const r = computePipeline({
      answers: { ...AGENCE, 'visits-per-month': 60, 'offers-per-month': 9 },
    });
    const offres = r.stages.find((s) => s.key === 'offres')!;
    expect(offres.annualImpactEuros).toBeGreaterThan(0);
    expect(offres.impactPresentation).toBe('potentiel_majeur');
    expect(offres.headlineImpactEuros).toBeNull();
  });

  it('le calcul complet reste disponible pour le détail, même quand on ne l’affiche pas', () => {
    const r = computePipeline({
      answers: { ...AGENCE, 'visits-per-month': 60, 'offers-per-month': 9 },
    });
    const offres = r.stages.find((s) => s.key === 'offres')!;
    expect(offres.annualImpactEuros).toBe(480_000);
  });

  it("n'avance aucun montant sans CA N-1 : le plafond de crédibilité serait incalculable", () => {
    const { 'identity-revenue-n1': _drop, ...sansCa } = AGENCE;
    const r = computePipeline({
      answers: { ...sansCa, 'offers-per-month': 6 },
    });
    for (const stage of r.stages) {
      expect(stage.headlineImpactEuros).toBeNull();
      expect(stage.impactPresentation).not.toBe('montant');
    }
  });

  it('ne chiffre rien sur une étape saine', () => {
    const r = computePipeline({ answers: AGENCE });
    const mandats = r.stages.find((s) => s.key === 'mandats')!;
    expect(mandats.status).toBe('conforme');
    expect(mandats.impactPresentation).toBe('aucun');
    expect(mandats.headlineImpactEuros).toBeNull();
  });

  it('les seuils sont paramétrables — le barème se recalibre sans redéploiement', () => {
    const r = computePipeline({
      answers: { ...AGENCE, 'visits-per-month': 60, 'offers-per-month': 9 },
      impactPresentation: { headlineShare: 0.25, capRevenuePercent: 40 },
    });
    const offres = r.stages.find((s) => s.key === 'offres')!;
    expect(offres.impactPresentation).toBe('montant');
    expect(offres.headlineImpactEuros).toBe(120_000);
  });

  it('ne chiffre aucun enjeu sans CA moyen par vente — pas de montant sorti du chapeau', () => {
    const r = computePipeline({
      answers: {
        'prospecting-contacts-per-month': 100,
        'seller-meetings-per-month': 5,
        'mandates-per-month': 1,
        'visits-per-month': 60,
        'offers-per-month': 6,
        'compromis-per-month': 2,
        'actes-per-month': 1,
      },
    });
    expect(r.averageRevenuePerSale).toBeNull();
    expect(r.weakestLinks.every((s) => s.annualImpactEuros === null)).toBe(true);
  });
});

describe('Données manquantes', () => {
  it('marque une étape sans réponse comme inconnue, sans la compter comme faible', () => {
    const r = computePipeline({
      answers: { ...AGENCE, 'offers-per-month': null },
    });
    const offres = r.stages.find((s) => s.key === 'offres')!;
    expect(offres.value).toBeNull();
    expect(offres.status).toBe('inconnu');
    expect(r.weakestLinks.map((s) => s.key)).not.toContain('offres');
  });

  it('liste ce qui manque pour compléter la lecture', () => {
    const r = computePipeline({ answers: { 'prospecting-contacts-per-month': 100 } });
    expect(r.missingQuestionIds).toContain('actes-per-month');
    expect(r.isComplete).toBe(false);
  });

  it('tient sur un questionnaire vide sans exploser', () => {
    const r = computePipeline({ answers: {} });
    expect(r.stages).toHaveLength(7);
    expect(r.weakestLinks).toEqual([]);
    expect(r.isComplete).toBe(false);
  });

  it('ne divise jamais par zéro', () => {
    const r = computePipeline({
      answers: { 'prospecting-contacts-per-month': 0, 'seller-meetings-per-month': 5 },
    });
    const rdv = r.stages.find((s) => s.key === 'rdv')!;
    expect(rdv.conversionPercent).toBeNull();
  });
});

describe("L'exclusivité, lue à part", () => {
  it('compare le taux d’exclusivité à son repère', () => {
    const r = computePipeline({ answers: AGENCE });
    expect(r.exclusivity.value).toBe(25);
    expect(r.exclusivity.benchmark).toBe(30);
    expect(r.exclusivity.status).toBe('faible');
  });

  it('reste silencieuse si la question n’a pas été posée', () => {
    const r = computePipeline({ answers: { ...AGENCE, 'mandates-exclusivity-percent': null } });
    expect(r.exclusivity.status).toBe('inconnu');
  });
});

describe('Contraintes de rendez-vous', () => {
  it('est déterministe', () => {
    expect(computePipeline({ answers: AGENCE })).toEqual(computePipeline({ answers: AGENCE }));
  });

  it('calcule en une fraction de seconde', () => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i += 1) computePipeline({ answers: AGENCE });
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
