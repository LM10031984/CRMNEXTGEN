import { describe, expect, it } from 'vitest';

import type { FundingRuleValues } from '@/lib/financement/types';

import { composeProgramme, onSiteMinutesPerBlock } from '../composer';
import type {
  DiagnosticEvidence,
  ModuleCandidate,
  ModuleRecommendation,
  ModuleSourceProgramme,
  ProgrammeNeed,
} from '../module-matcher';
import { PROGRAMME_NEEDS } from '../module-matcher';

/**
 * Les règles réelles du tenant : une demi-journée vaut 4 h sur site, co-animée
 * à deux formateurs, donc 8 h conventionnées. Tout le fichier en dépend, et
 * rien n'y est écrit en dur.
 */
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

const VENDEUR = rayon('PROD-0680', 'Catalogue diagnostic — Vendeur');
const BOOSTER = rayon('BIB-D058', 'Booster vendeur');
const ACHETEUR = rayon('BIB-D008', 'Face à face acheteurs');

function candidat(
  moduleId: string,
  title: string,
  durationMin: number,
  source: ModuleSourceProgramme,
): ModuleCandidate {
  return {
    moduleId,
    title,
    family: 'METIER',
    source,
    score: 10,
    matchSource: 'signaux',
    confidence: 'forte',
    matchedSignals: ['Mandats simples mais peu d’exclusivités'],
    matchedTerms: ['exclusivite'],
    isFoundation: false,
    durationMin,
  };
}

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

function besoin(code: string): ProgrammeNeed {
  return PROGRAMME_NEEDS.find((n) => n.code === code)!;
}

function reco(
  needCode: string,
  candidates: ModuleCandidate[],
  evidence: DiagnosticEvidence[] = PREUVE,
): ModuleRecommendation {
  return {
    need: besoin(needCode),
    trigger: `Déclencheur ${needCode}`,
    evidence,
    candidates,
    unmet: candidates.length === 0,
    metierGap: false,
  };
}

describe('composeProgramme — D-20 : le total est un multiple du bloc, jamais la somme des modules', () => {
  it('vend une demi-journée entière même quand les modules n’en remplissent qu’un tiers', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'Signer en exclusivité', 90, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 4,
    });

    expect(out.totalHalfDays).toBe(1);
    // 90 minutes de contenu, mais 4 h sur site et 8 h conventionnées vendues.
    expect(out.blocks[0]!.onSiteMinutes).toBe(90);
    expect(out.totalOnSiteHours).toBe(4);
    expect(out.totalConventionedHours).toBe(8);
  });

  it('n’exprime JAMAIS le total en somme de durées de modules', () => {
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [candidat('m1', 'A', 60, VENDEUR), candidat('m2', 'B', 60, BOOSTER)]),
        reco('acquereurs', [candidat('m3', 'C', 60, ACHETEUR)]),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    const sommeModules = out.blocks.flatMap((b) => b.modules).reduce((s, m) => s + m.durationMin, 0);
    expect(sommeModules).toBe(180); // 3 h de contenu…
    expect(out.totalConventionedHours).toBe(out.totalHalfDays * 8); // …mais 8 h par bloc
    expect(out.totalConventionedHours % 8).toBe(0);
  });

  it('dérive tout des FundingRule — un formateur seul change les heures conventionnées', () => {
    const seul = { HALF_DAY_ONSITE_HOURS: 4, TRAINER_COUNT_DEFAULT: 1 } as unknown as FundingRuleValues;
    const args = {
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)])],
      envelopeHalfDays: 3,
    };

    expect(composeProgramme({ ...args, rules: RULES }).totalConventionedHours).toBe(8);
    expect(composeProgramme({ ...args, rules: seul }).totalConventionedHours).toBe(4);
    // Les heures SUR SITE, elles, ne bougent pas : ce sont les mêmes 4 h.
    expect(composeProgramme({ ...args, rules: seul }).totalOnSiteHours).toBe(4);
  });

  it('remplit un bloc jusqu’à sa capacité sur site, puis en ouvre un autre', () => {
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [
          candidat('m1', 'A', 120, VENDEUR),
          candidat('m2', 'B', 120, BOOSTER),
        ]),
        reco('acquereurs', [candidat('m3', 'C', 60, ACHETEUR)]),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    expect(onSiteMinutesPerBlock(RULES)).toBe(240);
    for (const b of out.blocks) expect(b.onSiteMinutes).toBeLessThanOrEqual(240);
    expect(out.blocks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('composeProgramme — aucun module sans justification tracée', () => {
  it('refuse tout module d’un besoin qu’aucune réponse ne documente', () => {
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [candidat('m-ok', 'Justifié', 90, VENDEUR)]),
        reco('acquereurs', [candidat('m-nu', 'Sans preuve', 90, ACHETEUR)], []),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    const places = out.blocks.flatMap((b) => b.modules.map((m) => m.moduleId));
    expect(places).toContain('m-ok');
    expect(places).not.toContain('m-nu');
    expect(out.rejected.some((r) => r.moduleId === 'm-nu')).toBe(true);
    expect(out.uncovered.some((u) => u.reason === 'sans-justification')).toBe(true);
  });

  it('chaque module placé porte la réponse du client qui l’a fait entrer', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 3,
    });

    for (const m of out.blocks.flatMap((b) => b.modules)) {
      expect(m.evidence.length).toBeGreaterThan(0);
      const citations = m.evidence.flatMap((e) =>
        e.kind === 'alerte' ? e.answers.map((a) => a.value) : [e.value],
      );
      expect(citations).toContain('25 %');
    }
  });
});

describe('composeProgramme — §8.2 : le surplus d’enveloppe s’affiche, il ne se remplit pas', () => {
  it('s’arrête quand les douleurs sont couvertes et annonce les demi-journées restantes', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 9,
    });

    expect(out.totalHalfDays).toBe(1);
    expect(out.spareHalfDays).toBe(8);
    expect(out.notices.some((n) => n.includes('ne sont PAS ajoutées d’office'))).toBe(true);
  });

  it('ne dépasse jamais l’enveloppe, et dit quelles douleurs restent sans module', () => {
    const beaucoup = Array.from({ length: 6 }, (_, i) =>
      reco(PROGRAMME_NEEDS[i]!.code, [candidat(`m${i}`, `Module ${i}`, 240, VENDEUR)]),
    );

    const out = composeProgramme({
      recommendations: beaucoup,
      rules: RULES,
      envelopeHalfDays: 2,
    });

    expect(out.totalHalfDays).toBe(2);
    expect(out.spareHalfDays).toBe(0);
    expect(out.uncovered.filter((u) => u.reason === 'enveloppe-pleine').length).toBe(4);
    expect(out.notices.some((n) => n.includes('ne couvre pas tout'))).toBe(true);
  });

  it('couvre toutes les douleurs avant d’en approfondir une seule', () => {
    // Deux besoins, deux modules chacun, mais la place d'un seul module par bloc
    // et deux blocs : on doit voir UN module de chaque besoin, pas deux du même.
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [
          candidat('excl-1', 'Exclusivité 1', 240, VENDEUR),
          candidat('excl-2', 'Exclusivité 2', 240, VENDEUR),
        ]),
        reco('acquereurs', [
          candidat('acq-1', 'Acquéreurs 1', 240, ACHETEUR),
          candidat('acq-2', 'Acquéreurs 2', 240, ACHETEUR),
        ]),
      ],
      rules: RULES,
      envelopeHalfDays: 2,
    });

    const places = out.blocks.flatMap((b) => b.modules.map((m) => m.moduleId));
    expect(places).toEqual(['excl-1', 'acq-1']);
  });
});

describe('composeProgramme — composer, pas revendre un rayon', () => {
  it('compose depuis plusieurs programmes sources et les nomme', () => {
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)]),
        reco('acquereurs', [candidat('m2', 'B', 90, ACHETEUR)]),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    expect(out.sourceProgrammes.length).toBeGreaterThanOrEqual(2);
    expect(out.sourceProgrammes.map((s) => s.code)).toEqual(
      expect.arrayContaining(['PROD-0680', 'BIB-D008']),
    );
  });

  it('signale un parcours entièrement tiré d’un seul programme', () => {
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)]),
        reco('acquereurs', [candidat('m2', 'B', 90, VENDEUR)]),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    expect(out.sourceProgrammes.length).toBe(1);
    expect(out.notices.some((n) => n.includes('viennent du même programme'))).toBe(true);
  });
});

describe('composeProgramme — les cas limites se disent plutôt que de s’arranger', () => {
  it('rend un parcours vide, et non un bloc fantôme, quand rien n’est justifié', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)], [])],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    expect(out.blocks).toEqual([]);
    expect(out.totalHalfDays).toBe(0);
    expect(out.totalConventionedHours).toBe(0);
  });

  it('donne un bloc entier à un module plus long qu’une demi-journée, et le signale', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'Journée entière', 420, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 4,
    });

    expect(out.totalHalfDays).toBe(1);
    expect(out.notices.some((n) => n.includes('dépassent une demi-journée'))).toBe(true);
  });

  it('signale une demi-journée clairsemée sans pour autant la rogner', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'Court', 60, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 1,
    });

    expect(out.totalHalfDays).toBe(1);
    expect(out.totalConventionedHours).toBe(8);
    expect(out.notices.some((n) => n.includes('remplies à moins de'))).toBe(true);
  });

  it('avec une enveloppe nulle, ne compose rien plutôt que de dépasser', () => {
    const out = composeProgramme({
      recommendations: [reco('mandat_exclusivite', [candidat('m1', 'A', 90, VENDEUR)])],
      rules: RULES,
      envelopeHalfDays: 0,
    });

    expect(out.blocks).toEqual([]);
    expect(out.uncovered.some((u) => u.reason === 'enveloppe-pleine')).toBe(true);
  });
});

describe('composeProgramme — un module ne se programme qu’une fois', () => {
  /**
   * Le cas réel de DIAG-0001 : un module du catalogue diagnostic porte huit
   * signaux transverses et remonte en tête sur deux besoins différents. Sans
   * garde, il était programmé deux fois dans le même parcours.
   */
  it('n’entre pas deux fois quand il remonte sur deux besoins', () => {
    const transverse = candidat('m-transverse', 'Suivi', 120, VENDEUR);
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [transverse, candidat('m-b', 'Signer en exclusivité', 120, BOOSTER)]),
        reco('suivi_vendeur', [transverse, candidat('m-c', 'Ritualiser le suivi', 120, ACHETEUR)]),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    const ids = out.blocks.flatMap((b) => b.modules.map((m) => m.moduleId));
    expect(ids.filter((id) => id === 'm-transverse')).toHaveLength(1);
    // Et la place libérée revient au candidat suivant du besoin.
    expect(ids).toContain('m-c');
    expect(out.notices.some((n) => n.includes('figuraient déjà au parcours'))).toBe(true);
  });

  it('écarte aussi un doublon d’INTITULÉ porté par deux identifiants', () => {
    // Deux familles du catalogue déclarent le même module sous deux id : sur le
    // papier ce sont deux modules, sur le programme du dirigeant c'est une
    // répétition.
    const out = composeProgramme({
      recommendations: [
        reco('mandat_exclusivite', [
          candidat('m-1', 'Chatbot mandat', 120, VENDEUR),
          candidat('m-2', 'Chatbot mandat', 120, BOOSTER),
        ]),
      ],
      rules: RULES,
      envelopeHalfDays: 6,
    });

    const titres = out.blocks.flatMap((b) => b.modules.map((m) => m.title));
    expect(titres).toEqual(['Chatbot mandat']);
  });
});
