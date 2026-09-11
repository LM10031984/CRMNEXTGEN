import { describe, expect, it } from 'vitest';

import type { FundingRuleValues } from '@/lib/financement/types';

import { buildComposedProgramme, type SourceProgrammeInfo } from '../composed-programme';
import { composeProgramme } from '../composer';
import { PROGRAMME_NEEDS } from '../module-matcher';
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
  targetAudience: null,
  pedagogicalMethods: null,
  evaluationMethods: null,
  accessibility: null,
  trainerProfile: null,
  pedagogicalSupport: null,
  accessConditions: null,
};

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

  it('enveloppe un titre qui n’est pas un infinitif — et le dit', () => {
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
    });

    expect(programme.objectives[0]).toBe('Maîtriser « Suivi acheteur »');
    expect(programme.warnings.some((w) => w.includes('reformulés'))).toBe(true);
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

  it('signale une rubrique Qualiopi vide plutôt que d’émettre un programme troué', () => {
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
    });

    expect(programme.warnings.some((w) => w.includes('Rubrique Qualiopi vide'))).toBe(true);
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
    });

    expect(programme.durationHours).toBe(0);
    expect(programme.warnings.some((w) => w.includes('programme est vide'))).toBe(true);
  });
});
