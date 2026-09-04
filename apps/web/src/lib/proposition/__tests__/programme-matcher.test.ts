import { describe, expect, it } from 'vitest';

import type { DiagnosticAlert } from '@/lib/diagnostic-r1/ratios';

import {
  familyOf,
  recommendProgrammes,
  type CatalogueEntry,
} from '../programme-matcher';

/**
 * Un extrait du catalogue réel de Start Academy (base locale, 04/09/2026) :
 * des programmes métier, des programmes IA, un programme réglementaire et un
 * produit d'accueil inactif du catalogue diagnostic.
 */
const CATALOGUE: CatalogueEntry[] = [
  {
    productId: 'id-055',
    code: 'PROD-055',
    title: 'Maîtrise des techniques de vente immobilière',
    theme: 'Acquisition',
    isActive: true,
    fundingType: 'COEUR_METIER',
    durationHours: 21,
    signals: [],
    hasExcludedModule: false,
  },
  {
    productId: 'id-0059',
    code: 'PROD-0059',
    title: 'Booster vendeur (8h)',
    theme: 'Acquisition',
    isActive: true,
    fundingType: 'COEUR_METIER',
    durationHours: 8,
    signals: [],
    hasExcludedModule: false,
  },
  {
    productId: 'id-053',
    code: 'PROD-053',
    title: 'Cycle complet de prospection, relation client et négociation immobilière',
    theme: 'Acquisition',
    isActive: true,
    fundingType: 'COEUR_METIER',
    durationHours: 87,
    signals: [],
    hasExcludedModule: false,
  },
  {
    productId: 'id-0058',
    code: 'PROD-0058',
    title: "L'IA au service des conseillers immobiliers (8h)",
    theme: 'IA',
    isActive: true,
    fundingType: 'COEUR_METIER',
    durationHours: 8,
    signals: [],
    hasExcludedModule: false,
  },
  {
    // Le piège : un programme IA dont l'intitulé parle de mandat. Sans la règle
    // « un besoin métier se sert dans la famille métier », c'est LUI qui serait
    // proposé à une agence qui perd ses exclusivités.
    productId: 'id-frm4',
    code: 'FRM-0004',
    title: "Rentrer plus de mandats avec l'IA : de la prospection au mandat exclusif",
    theme: 'IA',
    isActive: true,
    fundingType: 'COEUR_METIER',
    durationHours: 8,
    signals: [],
    hasExcludedModule: false,
  },
  {
    productId: 'id-0062',
    code: 'PROD-0062',
    title: 'Non discrimination, Tracfin et déontologie',
    theme: null,
    isActive: true,
    fundingType: 'REGLEMENTAIRE',
    durationHours: 14,
    signals: [],
    hasExcludedModule: false,
  },
  {
    productId: 'id-0680',
    code: 'PROD-0680',
    title: 'Catalogue diagnostic — Vendeur',
    theme: null,
    isActive: false,
    fundingType: 'COEUR_METIER',
    durationHours: 22,
    signals: ['Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives'],
    hasExcludedModule: true,
  },
];

function alerte(code: string, chapter: number): DiagnosticAlert {
  return {
    code,
    chapter,
    label: `Alerte ${code}`,
    severity: 'warning',
    audience: 'client',
    observed: 20,
    threshold: 30,
  };
}

describe('Un point de douleur métier reçoit un programme MÉTIER', () => {
  it('propose la vente et le booster vendeur sur une exclusivité faible — jamais l’IA seule', () => {
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 5, score: 20 }],
      alerts: [alerte('exclusivity_below_benchmark', 5)],
      catalogue: CATALOGUE,
    });

    const mandat = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite');
    expect(mandat, 'le besoin « mandat / exclusivité » doit être détecté').toBeDefined();
    const codes = mandat!.candidates.map((c) => c.code);
    expect(codes).toContain('PROD-055');
    expect(codes).toContain('PROD-0059');
    expect(mandat!.candidates.every((c) => c.family === 'METIER')).toBe(true);
    expect(codes).not.toContain('PROD-0058');
    // Le piège du catalogue : « Rentrer plus de mandats avec l'IA » parle bien
    // de mandat, mais c'est un programme IA. Il ne répond pas à la fuite.
    expect(codes).not.toContain('FRM-0004');
  });

  it('signale le manque plutôt que de servir de l’IA quand le catalogue métier est vide', () => {
    const sansMetier = CATALOGUE.filter((e) => familyOf(e) !== 'METIER');
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 5, score: 10 }],
      alerts: [alerte('exclusivity_below_benchmark', 5)],
      catalogue: sansMetier,
    });
    const mandat = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    expect(mandat.candidates).toHaveLength(0);
    expect(mandat.unmet).toBe(true);
    expect(out.notices.join(' ')).toMatch(/pas une raison de vendre de l’IA/);
  });

  it('sert bien un programme IA à un besoin d’équipement', () => {
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 10, score: 15 }],
      alerts: [],
      catalogue: CATALOGUE,
    });
    const outils = out.recommendations.find((r) => r.need.code === 'outils_ia')!;
    expect(outils.candidates.map((c) => c.code)).toContain('PROD-0058');
    expect(outils.candidates.every((c) => c.family === 'IA')).toBe(true);
  });
});

describe('Ce que le moteur refuse de proposer', () => {
  it('ignore les produits inactifs — un programme qu’on ne vend pas ne se propose pas', () => {
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 6, score: 10 }],
      alerts: [alerte('seller_followup_weak', 6)],
      catalogue: CATALOGUE,
    });
    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.code));
    expect(tous).not.toContain('PROD-0680');
  });

  it('ne classe jamais un contenu réglementaire ailleurs que par sa donnée', () => {
    const reglementaire = CATALOGUE.find((e) => e.code === 'PROD-0062')!;
    expect(familyOf(reglementaire)).toBe('REGLEMENTAIRE');
    // Et il ne remonte donc pas comme réponse à un besoin métier.
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 8, score: 12 }],
      alerts: [alerte('visits_per_vente_high', 8)],
      catalogue: CATALOGUE,
    });
    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.code));
    expect(tous).not.toContain('PROD-0062');
  });

  it('dit qu’il ne peut rien proposer quand aucun produit n’est actif', () => {
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 5, score: 10 }],
      alerts: [],
      catalogue: CATALOGUE.map((e) => ({ ...e, isActive: false })),
    });
    expect(out.notices.join(' ')).toMatch(/Aucun programme actif au catalogue/);
  });
});

describe('D’où sort une recommandation', () => {
  it('préfère un signal du catalogue à un mot dans un intitulé, et le dit', () => {
    const avecSignal: CatalogueEntry = {
      ...CATALOGUE[0]!,
      productId: 'id-signal',
      code: 'PROD-9000',
      title: 'Programme sans mot-clé dans son titre',
      theme: null,
      signals: ['Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives'],
    };
    const out = recommendProgrammes({
      chapterScores: [{ chapter: 6, score: 10 }],
      alerts: [alerte('seller_followup_weak', 6)],
      catalogue: [avecSignal, ...CATALOGUE],
    });
    const suivi = out.recommendations.find((r) => r.need.code === 'suivi_vendeur')!;
    expect(suivi.candidates[0]!.code).toBe('PROD-9000');
    expect(suivi.candidates[0]!.matchSource).toBe('signaux');
  });

  it('n’invente aucun besoin quand rien n’est faible', () => {
    const out = recommendProgrammes({
      chapterScores: [
        { chapter: 5, score: 90 },
        { chapter: 10, score: 85 },
      ],
      alerts: [],
      catalogue: CATALOGUE,
    });
    expect(out.recommendations).toHaveLength(0);
  });

  it('est déterministe', () => {
    const input = {
      chapterScores: [{ chapter: 5, score: 20 }],
      alerts: [alerte('exclusivity_below_benchmark', 5)],
      catalogue: CATALOGUE,
    };
    expect(recommendProgrammes(input)).toEqual(recommendProgrammes(input));
  });
});
