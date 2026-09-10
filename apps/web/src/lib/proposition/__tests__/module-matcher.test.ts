import { describe, expect, it } from 'vitest';

import type { DiagnosticAlert } from '@/lib/diagnostic-r1/ratios';

import {
  moduleFamilyOf,
  recommendModules,
  type ChapterScoreLike,
  type EvidenceAnswer,
  type LibraryModule,
  type ModuleSourceProgramme,
} from '../module-matcher';

/**
 * Les rayons de la bibliothèque, tels qu'ils existent réellement sur la base
 * locale au 10/09/2026 : **tous inactifs**. C'est le cas nominal depuis le
 * corollaire D-19 — les conteneurs importés ne s'activent jamais, seul le
 * produit composé (lot I-2) portera l'état vendable.
 */
function rayon(
  code: string,
  title: string,
  opts: Partial<ModuleSourceProgramme> = {},
): ModuleSourceProgramme {
  return {
    productId: `id-${code}`,
    code,
    title,
    theme: null,
    fundingType: 'COEUR_METIER',
    isActive: false,
    ...opts,
  };
}

const VENDEUR = rayon('PROD-0680', 'Catalogue diagnostic — Vendeur');
const BOOSTER = rayon('DRV-058', 'Booster vendeur : devenir incontournable auprès des vendeurs');
const IA_MANAGER = rayon('DRV-060', 'IA Manager : piloter, motiver et performer grâce à l’IA', {
  theme: 'IA',
});
const TRACFIN = rayon('DRV-046', 'Tracfin', { fundingType: 'REGLEMENTAIRE' });

function mod(
  moduleId: string,
  title: string,
  source: ModuleSourceProgramme,
  opts: Partial<LibraryModule> = {},
): LibraryModule {
  return {
    moduleId,
    title,
    family: null,
    targetProfile: null,
    signals: [],
    needIdentification: null,
    isFoundation: false,
    durationMin: 90,
    excludedFromClientOutputs: false,
    source,
    ...opts,
  };
}

/**
 * Un extrait de bibliothèque volontairement mixte : des modules porteurs de
 * signaux (catalogue diagnostic), des modules qui ne se rapprochent que par
 * leur intitulé (production Drive), un module IA et un module réglementaire.
 */
const BIBLIOTHEQUE: LibraryModule[] = [
  mod('m-exclu-signal', 'Vente de mandats exclusifs', VENDEUR, {
    family: 'Vendeur',
    signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
    isFoundation: true,
  }),
  mod('m-objections', 'Gérer efficacement les objections des vendeurs', VENDEUR, {
    family: 'Vendeur',
    needIdentification: 'Quelle part de mandats en exclusivité ? Comment traitez-vous l’objection ?',
  }),
  mod('m-prospecter', 'Prospecter autrement pour ne plus être ignoré', BOOSTER),
  mod('m-leads', 'Générer des leads vendeurs qualifiés', BOOSTER),
  mod('m-ia-pilotage', 'Piloter son équipe avec l’IA', IA_MANAGER),
  mod('m-atelier-ia', 'Atelier pratique', IA_MANAGER),
  mod('m-tracfin', 'Obligations de vigilance', TRACFIN),
  mod('m-pige', 'Exploiter la pige quotidienne', VENDEUR, {
    signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
    excludedFromClientOutputs: true,
  }),
];

function alerte(code: string, chapter: number, questionIds: string[] = []): DiagnosticAlert {
  return {
    code,
    chapter,
    label: `Alerte ${code}`,
    severity: 'warning',
    audience: 'client',
    observed: 20,
    threshold: 40,
    questionIds,
  };
}

const REPONSES: EvidenceAnswer[] = [
  {
    questionId: 'mandates-exclusivity-percent',
    label: 'Part de mandats en exclusivité',
    value: '22 %',
  },
  {
    questionId: 'seller-discovery-formalized',
    label: 'La découverte vendeur est-elle formalisée ?',
    value: 'Non',
  },
];

/** Un chapitre faible, avec le détail qui permet de remonter à la réponse. */
function chapitre(chapter: number, score: number | null, questionId?: string): ChapterScoreLike {
  return {
    chapter,
    score,
    breakdown: questionId
      ? [
          {
            rule: `regle-${chapter}`,
            weight: 3,
            earned: 0,
            note: 'Découverte vendeur formalisée',
            questionId,
            ratioKey: null,
          },
        ]
      : [],
  };
}

describe('recommendModules — corollaire D-19 : la bibliothèque se lit conteneurs inactifs', () => {
  it('propose des modules alors que TOUS les conteneurs sont inactifs', () => {
    // Le test qui tient la règle (spec §5.3). Une liste vide signifierait qu'un
    // filtre `isActive` s'est glissé dans le chemin de composition — et que les
    // 86 modules importés sont redevenus invisibles.
    expect(BIBLIOTHEQUE.every((m) => !m.source.isActive)).toBe(true);

    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite');
    expect(axe).toBeDefined();
    expect(axe!.candidates.length).toBeGreaterThan(0);
    expect(axe!.unmet).toBe(false);
  });

  it('ne change rien quand les conteneurs sont actifs — `isActive` n’est pas un critère', () => {
    const actifs = BIBLIOTHEQUE.map((m) => ({
      ...m,
      source: { ...m.source, isActive: true },
    }));
    const args = {
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
    };

    const inactifs = recommendModules({ ...args, library: BIBLIOTHEQUE });
    const actives = recommendModules({ ...args, library: actifs });

    expect(actives.recommendations.map((r) => r.candidates.map((c) => c.moduleId))).toEqual(
      inactifs.recommendations.map((r) => r.candidates.map((c) => c.moduleId)),
    );
  });
});

describe('recommendModules — traçabilité module ↔ signal ↔ réponse', () => {
  it('rattache chaque axe servi à une réponse du diagnostic', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30), chapitre(4, 20, 'seller-discovery-formalized')],
      alerts: [
        alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent']),
        alerte('seller_discovery_not_formalized', 4, ['seller-discovery-formalized']),
      ],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const servis = out.recommendations.filter((r) => r.candidates.length > 0);
    expect(servis.length).toBeGreaterThan(0);
    for (const axe of servis) {
      expect(axe.evidence.length).toBeGreaterThan(0);
      const citations = axe.evidence.flatMap((e) =>
        e.kind === 'alerte' ? e.answers.map((a) => a.questionId) : [e.questionId],
      );
      // Chaque axe cite au moins une réponse réellement donnée par le client.
      expect(citations.some((id) => REPONSES.some((r) => r.questionId === id))).toBe(true);
    }
  });

  it('nomme le signal du catalogue qui a fait entrer le module', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    const parSignal = axe.candidates.find((c) => c.matchSource === 'signaux');
    expect(parSignal).toBeDefined();
    expect(parSignal!.matchedSignals[0]).toContain('exclusivité difficile à obtenir');
    expect(parSignal!.confidence).toBe('forte');
  });

  it('remonte la réponse mal notée quand c’est le barème qui déclenche, sans alerte', () => {
    const out = recommendModules({
      chapterScores: [chapitre(4, 20, 'seller-discovery-formalized')],
      alerts: [],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'decouverte_vendeur')!;
    const preuve = axe.evidence.find((e) => e.kind === 'reponse');
    expect(preuve).toBeDefined();
    expect(preuve).toMatchObject({
      kind: 'reponse',
      questionId: 'seller-discovery-formalized',
      value: 'Non',
    });
  });
});

describe('recommendModules — règles de catalogue gravées', () => {
  it('ne propose JAMAIS un module interdit en sortie client (pige)', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous).not.toContain('m-pige');
    expect(out.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1);
    expect(out.notices.some((n) => n.includes('pige'))).toBe(true);
  });

  it('sert une douleur métier avec un module métier, jamais avec de l’IA seule', () => {
    // Le besoin `mandat_exclusivite` n'accepte que METIER. Même si un module IA
    // matchait, il ne serait pas servi.
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    expect(axe.candidates.length).toBeGreaterThan(0);
    expect(axe.candidates.every((c) => c.family === 'METIER')).toBe(true);
  });

  it('propose des modules venus de plusieurs programmes sources', () => {
    const out = recommendModules({
      chapterScores: [chapitre(3, 25), chapitre(5, 30)],
      alerts: [
        alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent']),
        alerte('no_one_prospects', 3, []),
      ],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    expect(out.sourceProgrammeCount).toBeGreaterThanOrEqual(2);
  });
});

describe('moduleFamilyOf — le module parle pour lui-même, son rayon parle à défaut', () => {
  it('classe REGLEMENTAIRE depuis la donnée de financement, jamais depuis le code', () => {
    expect(moduleFamilyOf(mod('x', 'Obligations de vigilance', TRACFIN))).toBe('REGLEMENTAIRE');
  });

  it('garde METIER un module métier rangé dans un programme IA', () => {
    expect(moduleFamilyOf(mod('x', 'Prospecter autrement sur son secteur', IA_MANAGER))).toBe(
      'METIER',
    );
  });

  it('hérite de la famille du rayon quand le titre du module ne dit rien', () => {
    expect(moduleFamilyOf(mod('x', 'Atelier pratique', IA_MANAGER))).toBe('IA');
    expect(moduleFamilyOf(mod('x', 'Atelier pratique', BOOSTER))).toBe('METIER');
  });

  it('classe IA sur les mots du module lui-même', () => {
    expect(moduleFamilyOf(mod('x', 'Rédiger ses annonces avec ChatGPT', BOOSTER))).toBe('IA');
  });
});

describe('recommendModules — ce qui ne se comble pas se dit', () => {
  it('signale une bibliothèque vide au lieu de rendre un résultat muet', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, [])],
      answers: REPONSES,
      library: [],
    });
    expect(out.notices.some((n) => n.includes('bibliothèque de modules est vide'))).toBe(true);
    expect(out.recommendations.every((r) => r.unmet)).toBe(true);
  });

  it('badge « faible » un rapprochement qui ne tient qu’à l’intitulé', () => {
    const out = recommendModules({
      chapterScores: [chapitre(3, 25)],
      alerts: [alerte('no_one_prospects', 3, [])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'prospection')!;
    expect(axe.candidates.every((c) => c.confidence === 'faible')).toBe(true);
    expect(out.notices.some((n) => n.includes('les mots de son intitulé'))).toBe(true);
  });
});

describe('recommendModules — un mot qui matche tout ne qualifie rien (D-18 au niveau module)', () => {
  /**
   * Une bibliothèque réaliste : « vendeur » y est partout (comme dans le vrai
   * catalogue, où il touche un module sur cinq), « exclusivite » y est rare.
   */
  function grandeBibliotheque(): LibraryModule[] {
    const bruit = Array.from({ length: 60 }, (_, i) =>
      mod(`bruit-${i}`, `Travailler avec le vendeur — séance ${i}`, BOOSTER),
    );
    const generaliste = mod('generaliste', 'Module fourre-tout', VENDEUR, {
      signals: ['Vendeurs difficiles à faire baisser'],
    });
    const precis = mod('precis', 'Signer en exclusivité', VENDEUR, {
      signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
    });
    return [...bruit, generaliste, precis];
  }

  const args = {
    chapterScores: [chapitre(5, 30)],
    alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
    answers: REPONSES,
  };

  it('ne badge pas « forte » un signal accroché par le seul mot « vendeur »', () => {
    const out = recommendModules({ ...args, library: grandeBibliotheque() });
    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;

    const generaliste = axe.candidates.find((c) => c.moduleId === 'generaliste');
    // Il peut rester candidat — il matche vraiment — mais pas en confiance forte.
    if (generaliste) expect(generaliste.confidence).toBe('faible');
  });

  it('classe devant le module accroché par un mot réellement discriminant', () => {
    const out = recommendModules({ ...args, library: grandeBibliotheque() });
    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;

    expect(axe.candidates[0]!.moduleId).toBe('precis');
    expect(axe.candidates[0]!.confidence).toBe('forte');
  });

  it('ne pondère pas une bibliothèque trop petite pour être mesurée', () => {
    // Sur huit modules, « exclusivite » présent deux fois pèse 25 % : la
    // statistique dirait « passe-partout » là où il n'y a qu'un échantillon.
    const out = recommendModules({ ...args, library: BIBLIOTHEQUE });
    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    expect(axe.candidates.some((c) => c.confidence === 'forte')).toBe(true);
  });
});

describe('recommendModules — composer depuis plusieurs programmes, pas revendre un rayon', () => {
  it('plafonne à deux modules par programme source dans un même axe', () => {
    const monoculture: LibraryModule[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        mod(`vendeur-${i}`, `Signer en exclusivité — étape ${i}`, VENDEUR, {
          signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
        }),
      ),
      mod('ailleurs', 'Vente de mandats exclusifs', BOOSTER),
    ];

    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: monoculture,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    const parRayon = new Map<string, number>();
    for (const c of axe.candidates) {
      parRayon.set(c.source.code, (parRayon.get(c.source.code) ?? 0) + 1);
    }
    expect(Math.max(...parRayon.values())).toBeLessThanOrEqual(2);
    // Et le rayon voisin obtient sa place, alors que six modules mieux notés
    // auraient rempli l'axe à eux seuls.
    expect(axe.candidates.some((c) => c.moduleId === 'ailleurs')).toBe(true);
  });
});
