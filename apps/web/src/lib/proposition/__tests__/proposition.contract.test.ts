import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import type { ProposalContent, ProposalPricing } from '@qualiof/shared';

import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues } from '@/lib/financement/types';

import { buildFundingSection, buildLegalMention, seedPayers } from '../builder';
import { computePricing } from '../pricing';
import { PROPOSITION_STYLES } from '../templates/proposition-styles';
import { renderPropositionHtml } from '../templates/proposition-template';
import type { PropositionData } from '../templates/proposition-data';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

/** Les noms des fiches équipe : ils ne doivent apparaître NULLE PART au rendu. */
const NOMS = ['Marie D.', 'Julien P.', 'Sophie L.', 'Karim B.'];

function build(overrides: { discount?: ProposalPricing['discount'] } = {}): PropositionData {
  const participants = NOMS.map((displayName, i) => ({
    id: `p${i + 1}`,
    displayName,
    statut: 'INDEPENDANT' as const,
  }));

  const funding = computeFunding({
    rules: RULES,
    participants: participants.map((p) => ({
      id: p.id,
      statut: p.statut,
      caN1: 100000,
      cfpEligibleBudget: null,
      opcoEligible: null,
      consumedThisYear: null,
      trainings24mFunded: null,
      includedInProposal: true,
    })),
    employeeCount: 0,
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt: '2026-09-04T08:00:00.000Z',
  });

  const pricing: ProposalPricing = {
    payers: seedPayers({ funding, rules: RULES, agencyName: 'Agence témoin', participants }),
    discount: overrides.discount ?? null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
  };

  const content: ProposalContent = {
    subtitle: 'Structurer la vente & sécuriser les compromis',
    recipientLabel: 'Madame la gérante',
    contactLabel: 'Laurent M.',
    heardIntro: 'À la suite de notre diagnostic (audit joint — DIAG-0001) :',
    heard: ['1 mandat sur 5 seulement en exclusivité <script>alert(1)</script>'],
    axesIntro: 'Un point de douleur métier reçoit un programme métier.',
    axes: [
      {
        id: 'axe-1',
        label: 'Axe 1',
        title: 'Maîtrise des techniques de vente immobilière — PROD-055',
        productId: null,
        productCode: 'PROD-055',
        description: '',
        why: 'Exclusivité à 20 % pour un repère à 30 %.',
        halfDays: 9,
        periodLabel: 'octobre',
        matchSource: 'lexique', modules: [],
      },
    ],
    planning: [
      {
        id: 'planning-1',
        dateLabel: 'À arrêter — octobre',
        sessionLabel: 'Axe 1',
        participantsLabel: '4 participant(s)',
      },
    ],
    piecesDeadlineNote: 'Pièces réunies au plus tard 15 jours avant la première session.',
    keyPoints: ['Indemnisation AGEFICE de l’ordre de 700 à 800 €.'],
    nextSteps: [{ id: 'etape-1', action: 'Valider la proposition', who: 'Agence', when: 'S+1' }],
    legalMention: buildLegalMention({
      validityDays: 30,
      ofName: 'Start Academy',
      numDA: '93060000000',
      siret: '12345678900012',
    }),
  };

  return {
    reference: 'PROP-0001',
    version: 1,
    agencyName: 'Agence témoin',
    generatedAt: new Date('2026-09-04T08:00:00.000Z'),
    validUntil: new Date('2026-10-04T08:00:00.000Z'),
    ownerLabel: 'Laurent M.',
    of: {
      name: 'Start Academy',
      siret: '12345678900012',
      numDA: '93060000000',
      address: '1 rue du test',
      email: 'contact@example.test',
      phone: '0600000000',
    },
    content,
    onsiteHoursPerHalfDay: RULES.HALF_DAY_ONSITE_HOURS,
    trainerCount: RULES.TRAINER_COUNT_DEFAULT,
    pricing: computePricing({ pricing, rules: RULES }),
    funding: buildFundingSection({
      funding,
      rules: RULES,
      agencyName: 'Agence témoin',
      declaredEmployeeCount: 0,
    }),
    auditReference: 'DIAG-0001',
    quoteNumbers: [],
    generationSource: 'heuristique',
  };
}

const html = renderPropositionHtml(build());

/** Le document tel qu'il se lit : sans la feuille de style ni ses commentaires. */
function corps(source: string): string {
  return source.replace(/<style[\s\S]*?<\/style>/g, '');
}

/** Les règles CSS réellement appliquées — commentaires retirés. */
const REGLES_CSS = PROPOSITION_STYLES.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Conformité à la maquette 2026-09-01-maquette-proposition.html', () => {
  it('rend les trois pages de la maquette', () => {
    expect(html.match(/<section class="page">/g) ?? []).toHaveLength(3);
  });

  it('porte les six sections numérotées, dans l’ordre de la maquette', () => {
    const numeros = [...html.matchAll(/<span class="no">(\d{2})<\/span>/g)].map((m) => m[1]);
    expect(numeros).toEqual(['01', '02', '03', '04', '05', '06']);
  });

  it('présente le budget mobilisable AVANT le prix — c’est la démonstration', () => {
    expect(html.indexOf('ENVELOPPE MOBILISABLE ESTIMÉE')).toBeLessThan(
      html.indexOf('RESTE À VOTRE CHARGE'),
    );
  });

  it('reprend les blocs contractuels de la maquette', () => {
    expect(html).toContain('Ce que nous avons entendu');
    expect(html).toContain('Planning proposé');
    expect(html).toContain('Le détail chiffré');
    expect(html).toContain('Prochaines étapes');
    expect(html).toContain('Bon pour accord');
  });

  it('porte la mention légale, jamais retirable', () => {
    expect(html).toContain('Montants estimatifs, sous réserve des droits réellement disponibles');
    expect(html).toContain('Proposition valable 30 jours');
    expect(html).toContain('certifié Qualiopi');
  });

  it('porte l’exonération de TVA', () => {
    expect(html).toContain('261-4-4');
  });
});

/**
 * RENVERSÉ le 15/09/2026 — doctrine §8.1, « une prestation se dit dans l'unité
 * de celui qui la lit ».
 *
 * Ce test exigeait, sur la PROPOSITION, la phrase « Les 72 heures
 * conventionnées par participant (9 demi-journées de 4 h sur site, co-animées
 * par 2 formateurs) figurent à l'identique sur la convention… ». Elle était la
 * meilleure explication du dépôt sur la ligne rouge — et elle porte trois mots
 * d'INTERNE sur une pièce CLIENT. Le client lit des demi-journées ; il n'a pas
 * à connaître le multiplicateur de co-animation.
 *
 * ⚠ CE QUI NE CHANGE PAS, et c'est tout l'objet de ce qui suit : la VALEUR. Les
 * 72 heures restent dans les données, restent dans le tableau chiffré, et
 * restent la valeur unique de la convention, de l'émargement, de l'attestation
 * d'assiduité et des dossiers financeurs. On a retiré une PHRASE, pas un
 * nombre.
 */
describe('Les heures conventionnées — LA valeur unique, sans le mot', () => {
  it('garde la valeur au détail chiffré, et ne la nomme plus « conventionnée »', () => {
    const data = build();
    // La valeur : intacte, et toujours unique.
    expect(data.funding.conventionedHoursPerParticipant).toBe(72);
    expect(html).toContain('<td class="num">72 h</td>');

    // Le mot : parti de la pièce client.
    expect(html).not.toContain('Les 72 heures conventionnées par participant');
    expect(html).not.toContain('figurent à l’identique sur la convention');
    expect(html).not.toContain('Heures conv.');
    expect(html).toContain('<th class="num">Heures</th>');
  });

  it('la pièce client compte en DEMI-JOURNÉES', () => {
    expect(html).toContain('Demi-journées');
  });
});

describe('PII — ce document peut partir en lien public', () => {
  it('ne nomme aucun participant, ni aucun payeur individuel', () => {
    for (const nom of NOMS) {
      expect(html, `« ${nom} » ne doit jamais apparaître dans la proposition`).not.toContain(nom);
    }
  });

  it('parle par bandeau et par nombre', () => {
    expect(html).toContain('Indépendants');
    expect(html).toContain('<td class="num">4</td>');
  });
});

describe('« OFFERT » n’est pas « pris en charge »', () => {
  it('n’affiche aucun tampon tant qu’aucun geste commercial n’a été fait', () => {
    expect(corps(html)).not.toContain('OFFERT');
  });

  it('affiche le tampon et le dit explicitement quand le reste à charge est offert', () => {
    const offert = corps(
      renderPropositionHtml(
        build({ discount: { amount: 96, reason: 'Arrondi de parcours', kind: 'ARRONDI' } }),
      ),
    );
    expect(offert).toContain('OFFERT');
    expect(offert).toContain('avoir distinct rattaché à la facture de chaque payeur');
    expect(offert).toContain('facture et avoir justifient le coût net auprès du financeur');
    expect(offert).toContain('Il ne s’agit pas d’une prise en charge supplémentaire');
    expect(offert).toContain('Arrondi de parcours');
    expect(offert).not.toContain('Intégralement pris en charge');
  });
});

describe('Robustesse du rendu', () => {
  it('échappe ce qui est saisi à la main', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('est déterministe à date fixée', () => {
    expect(renderPropositionHtml(build())).toBe(renderPropositionHtml(build()));
  });

  it('n’affiche jamais une prise en charge au-dessus du plafond', () => {
    const data = build();
    for (const p of data.pricing.payers) {
      expect(p.coverage).toBeLessThanOrEqual(RULES.AGEFICE_ANNUAL_CAP);
    }
  });
});

describe('Intégrité de la feuille de style', () => {
  it('est syntaxiquement équilibrée', () => {
    const open = (PROPOSITION_STYLES.match(/\{/g) ?? []).length;
    const close = (PROPOSITION_STYLES.match(/\}/g) ?? []).length;
    expect(open, 'accolades déséquilibrées — le parseur CSS abandonnera').toBe(close);
  });

  it('ne laisse aucune variable CSS non résolue', () => {
    expect(PROPOSITION_STYLES).not.toContain('var(--');
  });

  it('ne tente aucun chargement distant', () => {
    expect(PROPOSITION_STYLES).not.toContain('@import');
    expect(PROPOSITION_STYLES).not.toContain('http');
  });

  it('réutilise le socle de compatibilité au lieu de le retranscrire (§9.5)', () => {
    // Le modèle de page et la pile de fontes viennent du socle commun : s'ils
    // étaient réécrits à la main ici, ils divergeraient au premier correctif.
    expect(PROPOSITION_STYLES).toContain("font-family: 'Liberation Sans', Helvetica, Arial");
    expect(PROPOSITION_STYLES).toContain('@page{ size:A4');
    expect(PROPOSITION_STYLES).toContain('.chip{ display:inline');
  });

  it('n’utilise ni grid ni gap — le moteur les ignore en silence', () => {
    expect(REGLES_CSS).not.toMatch(/display:\s*grid/);
    expect(REGLES_CSS).not.toMatch(/(^|[;{\s])gap:/);
  });
});

describe('Fontes — ce que le conteneur de rendu sait réellement dessiner', () => {
  const AUTORISES = new Set([
    0x0152, 0x0153, 0x2014, 0x2013, 0x2018, 0x2019, 0x201c, 0x201d, 0x202f, 0x20ac,
  ]);

  it('n’écrit aucun caractère que la fonte ne sait pas dessiner', () => {
    const texte = renderPropositionHtml(
      build({ discount: { amount: 96, reason: 'Arrondi de parcours', kind: 'ARRONDI' } }),
    )
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, '');
    const interdits = [
      ...new Set(
        [...texte].filter((c) => {
          const code = c.codePointAt(0)!;
          return code > 0x7f && code <= 0x00ff ? false : code > 0x7f && !AUTORISES.has(code);
        }),
      ),
    ];
    expect(interdits, `caractères hors fonte : ${interdits.join(' ')}`).toEqual([]);
  });
});

it('le document relie la douleur à la pratique IA et nomme les besoins non couverts', () => {
  const data = build();
  data.content.axes[0]!.modules = [{
    moduleId: 'faros-suivi', title: 'Ritualiser le suivi vendeur avec un journal et l’IA',
    sourceCode: 'FAROS', sourceTitle: 'Ateliers Faros', needLabel: 'Rythme de suivi vendeur',
    durationMin: 120, quotes: ['Fréquence de suivi : jamais'], signal: null, confidence: 'forte',
    selection: { version: 'v1', ruleId: 'suivi-vendeur', moduleSourceRef: 'faros:suivi',
      outcome: 'Produire un compte rendu hebdomadaire vérifié.', aiUsage: true, audience: 'conseiller' },
  }];
  data.content.uncoveredNeeds = ['Financement acquéreur vérifié <script>'];
  const result = renderPropositionHtml(data);
  expect(result).toContain('Fréquence de suivi : jamais');
  expect(result).toContain('Mise en pratique avec l’IA');
  expect(result).toContain('Produire un compte rendu hebdomadaire vérifié.');
  expect(result).toContain('Besoins restant à traiter');
  expect(result).toContain('Financement acquéreur vérifié &lt;script&gt;');
});

it('le titre du parcours annonce le volume proposé et non toute l’enveloppe disponible', () => {
  const data = build();
  data.pricing.halfDaysMax = 1;
  data.content.axes[0]!.halfDays = 1;
  const result = renderPropositionHtml(data);
  expect(result).toContain('Notre proposition — 1 demi-journée chez vous');
});
