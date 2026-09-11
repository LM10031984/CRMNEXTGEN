import { describe, expect, it } from 'vitest';

import type { FundingRuleValues } from '@/lib/financement/types';

import { resolveQualiopiMentions } from '@/lib/docs/qualiopi-mentions';

import { buildComposedProgramme, type SourceProgrammeInfo } from '../composed-programme';
import { composeProgramme } from '../composer';
import { PROGRAMME_NEEDS, recommendModules, type LibraryModule } from '../module-matcher';
import type {
  DiagnosticEvidence,
  ModuleCandidate,
  ModuleRecommendation,
  ModuleSourceProgramme,
} from '../module-matcher';

const RULES = {
  HALF_DAY_ONSITE_HOURS: 4,
  TRAINER_COUNT_DEFAULT: 2,
} as unknown as FundingRuleValues;

function rayon(code: string, title: string): ModuleSourceProgramme {
  return {
    productId: `id-${code}`,
    code,
    title,
    theme: null,
    fundingType: 'COEUR_METIER',
    isActive: false,
    supersededBy: null,
    excludedFromClientOutputs: false,
  };
}

const VENDEUR = rayon('BIB-D058', 'Booster vendeur');
const ACHETEUR = rayon('BIB-D008', 'Face à face acheteurs');

const PREUVE: DiagnosticEvidence[] = [
  {
    kind: 'alerte',
    code: 'exclusivity_below_benchmark',
    label: 'L’exclusivité représente 25 % de vos rentrées, contre 30 % attendus.',
    chapter: 5,
    answers: [
      { questionId: 'mandates-exclusivity-percent', label: 'Part de l’exclusivité', value: '25 %' },
    ],
  },
];

function candidat(
  moduleId: string,
  title: string,
  durationMin: number,
  source: ModuleSourceProgramme,
  confidence: 'forte' | 'faible' = 'forte',
): ModuleCandidate {
  return {
    moduleId,
    title,
    family: 'METIER',
    source,
    score: 10,
    matchSource: confidence === 'forte' ? 'signaux' : 'lexique',
    confidence,
    matchedSignals: confidence === 'forte' ? ['Mandats simples mais peu d’exclusivités'] : [],
    matchedTerms: ['exclusivite'],
    isFoundation: false,
    durationMin,
    targetProfile: null,
  };
}

function reco(needCode: string, candidates: ModuleCandidate[]): ModuleRecommendation {
  return {
    need: PROGRAMME_NEEDS.find((n) => n.code === needCode)!,
    trigger: `Déclencheur ${needCode}`,
    evidence: PREUVE,
    candidates,
    unmet: false,
    metierGap: false,
  };
}

const SOURCES: SourceProgrammeInfo[] = [
  {
    code: 'BIB-D058',
    title: 'Booster vendeur',
    prerequisites: 'Avoir rentré 10 mandats dans sa carrière.',
    targetAudience: 'Conseillers immobiliers, agents indépendants.',
    pedagogicalMethods: 'Formation en présentiel, exercices pratiques.',
    evaluationMethods: 'QCM en fin de formation.',
    accessibility: 'Locaux accessibles, adaptations sur demande.',
    trainerProfile: 'Formateurs avec 8 ans d’expérience immobilière.',
    pedagogicalSupport: 'Livret de formation remis à chaque participant.',
    accessConditions: 'Inscription 14 jours avant.',
  },
  {
    code: 'BIB-D008',
    title: 'Face à face acheteurs',
    prerequisites: 'Aucune',
    targetAudience: 'Conseillers immobiliers et responsables d’agence.',
    pedagogicalMethods: null,
    evaluationMethods: null,
    accessibility: null,
    trainerProfile: null,
    pedagogicalSupport: null,
    accessConditions: null,
  },
];

const FALLBACK = {
  prerequisites: null,
  trainerProfile: null,
  pedagogicalSupport: null,
  accessConditions: null,
};

/** Les mentions de l'organisme — le tenant n'a rien saisi, donc le texte standard. */
const MENTIONS = resolveQualiopiMentions(null, {
  name: 'Julien LAFITTE',
  email: 'julien@start-academy.fr',
  phone: '06 22 80 65 09',
});

function programmeReel() {
  const composition = composeProgramme({
    recommendations: [
      reco('mandat_exclusivite', [candidat('m1', 'Signer plus de mandats exclusifs', 120, VENDEUR)]),
      reco('acquereurs', [candidat('m2', 'Pratiquer les visites en situation réelle', 120, ACHETEUR)]),
    ],
    rules: RULES,
    envelopeHalfDays: 6,
  });
  return {
    composition,
    programme: buildComposedProgramme({
      composition,
      rules: RULES,
      agencyName: 'Agence des Oliviers',
      diagnosticReference: 'DIAG-0001',
      sources: SOURCES,
      fallback: FALLBACK,
      mentions: MENTIONS,
      moduleContent: new Map([['m1', '- Techniques de closing\n- Traitement des objections']]),
    }),
  };
}

describe('buildComposedProgramme — D-25 : durationHours porte les heures CONVENTIONNÉES', () => {
  it('met les heures conventionnées dans durationHours, et les heures sur site à côté', () => {
    const { composition, programme } = programmeReel();

    expect(composition.totalHalfDays).toBe(1);
    expect(programme.durationHours).toBe(8); // conventionnées → convention + attestation
    expect(programme.onSiteHours).toBe(4); // sur site → l'assiette du prix
    expect(programme.durationHours).not.toBe(programme.onSiteHours);
  });

  it('n’écrit jamais les heures sur site dans durationHours, même à un formateur', () => {
    // À un formateur, les deux valeurs se rejoignent — c'est le seul cas où
    // elles coïncident, et ce n'est pas une raison pour les confondre ailleurs.
    const seul = { HALF_DAY_ONSITE_HOURS: 4, TRAINER_COUNT_DEFAULT: 1 } as unknown as FundingRuleValues;
    const composition = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'Signer', 120, VENDEUR)])],
      rules: seul,
      envelopeHalfDays: 3,
    });
    const programme = buildComposedProgramme({
      composition,
      rules: seul,
      agencyName: 'X',
      diagnosticReference: 'DIAG-0001',
      sources: SOURCES,
      fallback: FALLBACK,
      mentions: MENTIONS,
    });
    expect(programme.durationHours).toBe(composition.totalConventionedHours);
    expect(programme.durationHours).toBe(4);
  });

  it('dit les deux durées dans le déroulé, sans jamais en laisser une nue', () => {
    const { programme } = programmeReel();
    expect(programme.programMd).toContain('8 h conventionnées');
    expect(programme.programMd).toContain('4 h sur site');
  });
});

describe('buildComposedProgramme — les objectifs viennent des modules retenus', () => {
  it('dérive un objectif par module, et pas les objectifs du programme source entier', () => {
    const { programme } = programmeReel();

    expect(programme.objectives).toHaveLength(2);
    expect(programme.objectives[0]).toBe('Signer plus de mandats exclusifs');
    expect(programme.objectives[1]).toBe('Pratiquer les visites en situation réelle');
  });

  it('n’invente AUCUN objectif pour un titre qui ne dit pas ce qu’on sait faire', () => {
    // « Maîtriser « Suivi acheteur » » n'est pas un objectif pédagogique : c'est
    // une formule creuse qui donne l'illusion de la conformité. On recense, on
    // ne comble pas.
    const composition = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'Suivi acheteur', 120, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 3,
    });
    const programme = buildComposedProgramme({
      composition,
      rules: RULES,
      agencyName: 'X',
      diagnosticReference: 'DIAG-0001',
      sources: SOURCES,
      fallback: FALLBACK,
      mentions: MENTIONS,
    });

    expect(programme.objectives).toEqual([]);
    expect(programme.objectivesToWrite).toEqual(['Suivi acheteur']);
    expect(programme.programMd).toContain('Objectifs restant à rédiger pour : Suivi acheteur');
    expect(programme.warnings.some((w) => w.includes('restent À RÉDIGER'))).toBe(true);
  });
});

describe('buildComposedProgramme — le déroulé part au financeur, pas les chiffres du client', () => {
  it('nomme le besoin auquel chaque module répond', () => {
    const { programme } = programmeReel();
    expect(programme.programMd).toContain('Rentrer des mandats en exclusivité, au bon prix');
  });

  it('ne recopie AUCUN ratio commercial de l’agence dans le programme', () => {
    const { programme } = programmeReel();
    // La preuve chiffrée existe — mais elle vit dans les justifications, qui
    // alimentent la proposition, pas le document conventionnel.
    expect(programme.programMd).not.toContain('25 %');
    expect(programme.programMd).not.toContain('contre 30 % attendus');
    expect(programme.justifications[0]!.quotes.join(' ')).toContain('25 %');
  });

  it('nomme le programme source de chaque module', () => {
    const { programme } = programmeReel();
    expect(programme.programMd).toContain('Booster vendeur (BIB-D058)');
    expect(programme.programMd).toContain('Face à face acheteurs (BIB-D008)');
  });
});

describe('buildComposedProgramme — l’héritage des rubriques Qualiopi', () => {
  it('cumule les prérequis des sources et ignore les « Aucune »', () => {
    const { programme } = programmeReel();
    expect(programme.prerequisites).toBe('Avoir rentré 10 mandats dans sa carrière.');
  });

  it('hérite les moyens et l’évaluation de la première source qui les déclare', () => {
    const { programme } = programmeReel();
    expect(programme.pedagogicalMethods).toContain('présentiel');
    expect(programme.evaluationMethods).toContain('QCM');
  });

  it('porte les mentions de l’organisme même quand AUCUNE source ne les déclare', () => {
    const muettes: SourceProgrammeInfo[] = [
      { ...SOURCES[1]!, code: 'BIB-D058', title: 'Booster vendeur' },
    ];
    const composition = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'Signer', 120, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 3,
    });
    const programme = buildComposedProgramme({
      composition,
      rules: RULES,
      agencyName: 'X',
      diagnosticReference: 'DIAG-0001',
      sources: muettes,
      fallback: FALLBACK,
      mentions: MENTIONS,
    });

    expect(programme.pedagogicalMethods.trim().length).toBeGreaterThan(0);
    expect(programme.evaluationMethods.trim().length).toBeGreaterThan(0);
    expect(programme.accessibility.trim().length).toBeGreaterThan(0);
  });
});

describe('buildComposedProgramme — la traçabilité suit le module', () => {
  it('porte pour chaque module son besoin, sa source, ses citations et son signal', () => {
    const { programme } = programmeReel();
    const j = programme.justifications[0]!;

    expect(j.moduleTitle).toBe('Signer plus de mandats exclusifs');
    expect(j.sourceCode).toBe('BIB-D058');
    expect(j.needLabel).toBe('Rentrer des mandats en exclusivité, au bon prix');
    expect(j.quotes[0]).toContain('25 %');
    expect(j.signal).toContain('exclusivités');
    expect(j.confidence).toBe('forte');
  });

  it('avertit quand un module ne tient qu’aux mots de son intitulé', () => {
    const composition = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [candidat('m1', 'Signer', 120, VENDEUR, 'faible')]),
      ],
      rules: RULES,
      envelopeHalfDays: 3,
    });
    const programme = buildComposedProgramme({
      composition,
      rules: RULES,
      agencyName: 'X',
      diagnosticReference: 'DIAG-0001',
      sources: SOURCES,
      fallback: FALLBACK,
      mentions: MENTIONS,
    });

    expect(programme.warnings.some((w) => w.includes('mots de leur intitulé'))).toBe(true);
  });

  it('refuse de faire passer un programme vide pour vendable', () => {
    const composition = composeProgramme({
      recommendations: [],
      rules: RULES,
      envelopeHalfDays: 6,
    });
    const programme = buildComposedProgramme({
      composition,
      rules: RULES,
      agencyName: 'X',
      diagnosticReference: 'DIAG-0001',
      sources: SOURCES,
      fallback: FALLBACK,
      mentions: MENTIONS,
    });

    expect(programme.durationHours).toBe(0);
    expect(programme.warnings.some((w) => w.includes('programme est vide'))).toBe(true);
  });
});

describe('CONTRAT — un programme généré ne sort JAMAIS avec une rubrique d’organisme vide', () => {
  /**
   * La règle que ce fichier protège, et pourquoi elle vaut un test de contrat.
   *
   * L'accessibilité aux personnes en situation de handicap est l'**indicateur
   * Qualiopi 26**. Une section blanche n'est pas un document incomplet qu'on
   * corrigera plus tard : c'est une non-conformité le jour d'un audit. Les
   * moyens pédagogiques et les modalités d'évaluation sont du même ordre.
   *
   * Le test balaie les cas où le trou apparaissait réellement : aucune source,
   * des sources muettes, une composition vide.
   */
  const CAS: { nom: string; sources: SourceProgrammeInfo[]; modules: ModuleCandidate[] }[] = [
    { nom: 'aucun programme source', sources: [], modules: [candidat('m1', 'Signer', 120, VENDEUR)] },
    {
      nom: 'des sources qui ne déclarent rien',
      sources: [
        {
          code: 'BIB-D058', title: 'Booster vendeur', prerequisites: null, targetAudience: null,
          pedagogicalMethods: null, evaluationMethods: null, accessibility: null,
          trainerProfile: null, pedagogicalSupport: null, accessConditions: null,
        },
      ],
      modules: [candidat('m1', 'Signer', 120, VENDEUR)],
    },
    { nom: 'une composition vide', sources: SOURCES, modules: [] },
  ];

  for (const cas of CAS) {
    it(`reste conforme avec ${cas.nom}`, () => {
      const composition = composeProgramme({
        recommendations: cas.modules.length > 0 ? [reco('mandat_exclusivite', cas.modules)] : [],
        rules: RULES,
        envelopeHalfDays: 3,
      });
      const programme = buildComposedProgramme({
        composition,
        rules: RULES,
        agencyName: 'Agence du Baou',
        diagnosticReference: 'DIAG-0001',
        sources: cas.sources,
        fallback: FALLBACK,
        mentions: MENTIONS,
      });

      for (const rubrique of ['pedagogicalMethods', 'evaluationMethods', 'accessibility'] as const) {
        expect(programme[rubrique].trim(), `${rubrique} vide`).not.toBe('');
      }
      // Et le document rendu les porte réellement, pas seulement l'objet.
      expect(programme.programMd).toContain('## Moyens pédagogiques et techniques');
      expect(programme.programMd).toContain('## Modalités d’évaluation');
      expect(programme.programMd).toContain(
        '## Accessibilité aux personnes en situation de handicap',
      );
      for (const titre of [
        'Moyens pédagogiques et techniques',
        'Modalités d’évaluation',
        'Accessibilité aux personnes en situation de handicap',
      ]) {
        const apres = programme.programMd.split(`## ${titre}`)[1] ?? '';
        const corps = apres.split('\n##')[0]!.trim();
        expect(corps.length, `section « ${titre} » blanche`).toBeGreaterThan(40);
      }
    });
  }

  it('nomme un référent joignable pour l’accessibilité (Qualiopi 26)', () => {
    const { programme } = programmeReel();
    expect(programme.accessibility).toContain('référent');
    expect(programme.accessibility).toContain('@');
  });
});

describe('deriveTargetAudience — le public visé se dérive, il ne se recopie pas', () => {
  it('ne recopie JAMAIS le public visé d’un programme source', () => {
    // Le défaut réel : le parcours de DIAG-0001 héritait du public d'un
    // programme de marketing digital et l'annonçait à une agence immobilière.
    const { programme } = programmeReel();
    expect(programme.targetAudience).not.toContain('marketing');
    expect(programme.targetAudience).not.toContain('Durée de la formation');
    expect(programme.targetAudience).toContain('Agence des Oliviers');
  });

  it('utilise les profils que visent les modules retenus quand ils sont connus', () => {
    const composition = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [
          { ...candidat('m1', 'Signer', 120, VENDEUR), targetProfile: 'manager' },
        ]),
      ],
      rules: RULES,
      envelopeHalfDays: 3,
    });
    const programme = buildComposedProgramme({
      composition, rules: RULES, agencyName: 'Agence du Baou',
      diagnosticReference: 'DIAG-0001', sources: SOURCES, fallback: FALLBACK, mentions: MENTIONS,
    });
    expect(programme.targetAudience.toLowerCase()).toContain('managers et responsables d’agence');
  });

  it('reste vrai et vérifiable quand aucun module ne déclare de profil', () => {
    const { programme } = programmeReel();
    expect(programme.targetAudience.toLowerCase()).toContain('conseillers immobiliers');
  });
});


describe('CONTRAT — un programme composé ne contient JAMAIS un module sans déroulé', () => {
  /**
   * L'arbitrage de Laurent du 11/09/2026, vérifié de bout en bout : bibliothèque
   * → recommandation → composition → programme rendu.
   *
   * Le cas réel qu'il ferme : « Suivi » (PROD-0680), module du catalogue
   * diagnostic SANS déroulé mais riche en signaux, gagnait sa place et
   * imprimait « Déroulé détaillé à compléter au catalogue » sur une pièce
   * destinée au financeur — en occupant la place d'un module réel.
   *
   * Le test part d'une BIBLIOTHÈQUE, pas de candidats fabriqués : c'est le seul
   * moyen de vérifier la garantie plutôt que la mise en forme.
   */
  const rayonDiag: ModuleSourceProgramme = {
    productId: 'id-PROD-0680',
    code: 'PROD-0680',
    title: 'Catalogue diagnostic — Vendeur',
    theme: null,
    fundingType: 'COEUR_METIER',
    isActive: false,
    supersededBy: null,
    excludedFromClientOutputs: false,
  };

  const SIGNAL = 'Mandat — Trop de mandats simples, exclusivité difficile à obtenir';

  function librairie(): LibraryModule[] {
    const base = {
      family: 'METIER' as string | null,
      targetProfile: null,
      needIdentification: null,
      isFoundation: false,
      durationMin: 120,
      excludedFromClientOutputs: false,
    };
    return [
      // L'étiquette : tous les signaux, aucun contenu.
      {
        ...base,
        moduleId: 'm-vide',
        title: 'Suivi',
        signals: [SIGNAL],
        contentMd: null,
        source: rayonDiag,
      },
      // Le module réel, moins bien doté en signaux.
      {
        ...base,
        moduleId: 'm-reel',
        title: 'Signer plus de mandats exclusifs',
        signals: [SIGNAL],
        contentMd: '- Techniques de closing\n- Traitement des objections',
        source: VENDEUR,
      },
    ];
  }

  function chaineComplete(bibliotheque: LibraryModule[]) {
    const reco = recommendModules({
      library: bibliotheque,
      chapterScores: [{ chapter: 5, score: 30, breakdown: [] }],
      alerts: [
        {
          code: 'exclusivity_below_benchmark',
          chapter: 5,
          label: 'Exclusivité sous le repère',
          severity: 'warning',
          audience: 'client',
          observed: 22,
          threshold: 50,
          questionIds: ['mandates-exclusivity-percent'],
        },
      ],
      answers: [
        {
          questionId: 'mandates-exclusivity-percent',
          label: 'Part de mandats en exclusivité',
          value: '22 %',
        },
      ],
    });
    const composition = composeProgramme({
      recommendations: reco.recommendations,
      rules: RULES,
      envelopeHalfDays: 6,
    });
    const contenus = new Map(
      bibliotheque.filter((m) => m.contentMd).map((m) => [m.moduleId, m.contentMd!]),
    );
    return {
      reco,
      composition,
      programme: buildComposedProgramme({
        composition,
        rules: RULES,
        agencyName: 'Agence des Oliviers',
        diagnosticReference: 'DIAG-0001',
        sources: SOURCES,
        fallback: FALLBACK,
        mentions: MENTIONS,
        moduleContent: contenus,
      }),
    };
  }

  it('le module sans déroulé n’apparaît nulle part, et le module réel prend sa place', () => {
    const { composition, programme } = chaineComplete(librairie());
    const programmes = composition.blocks.flatMap((b) => b.modules.map((m) => m.moduleId));
    expect(programmes).not.toContain('m-vide');
    expect(programmes).toContain('m-reel');
    expect(programme.programMd).not.toContain('Déroulé détaillé à compléter');
  });

  it('aucun module composé ne sort sans contenu, quelle que soit la bibliothèque', () => {
    // La garantie, énoncée telle quelle : on la vérifie sur le résultat, pas
    // sur le chemin qui y mène.
    const { composition, programme } = chaineComplete(librairie());
    const contenus = new Map([['m-reel', '- Techniques de closing']]);
    for (const b of composition.blocks) {
      for (const m of b.modules) {
        expect(contenus.has(m.moduleId)).toBe(true);
      }
    }
    expect(programme.blockers.some((x) => x.includes('déroulé'))).toBe(false);
  });

  it('quand il ne reste QUE des étiquettes, le programme est vide et le dit', () => {
    // Le point qui compte pour Laurent : la douleur rejoint honnêtement la
    // liste de celles à écrire, au lieu d'être servie par une coquille.
    const { reco, composition } = chaineComplete([librairie()[0]!]);
    expect(composition.blocks.flatMap((b) => b.modules)).toEqual([]);
    expect(reco.recommendations.some((r) => r.unmet)).toBe(true);
    expect(reco.notices.some((n) => n.includes('aucun déroulé pédagogique'))).toBe(true);
  });
});
