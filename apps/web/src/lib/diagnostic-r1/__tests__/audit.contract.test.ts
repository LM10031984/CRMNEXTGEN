import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_QUESTIONS } from '@qualiof/shared/diagnostic';

import { buildAuditData } from '../audit-builder';
import { renderAuditHtml } from '../templates/audit-template';

/**
 * Contrats du rapport d'audit (spec §9.2 et §14).
 *
 * Ce qui est protégé ici n'est pas de l'esthétique : c'est ce qui rend le
 * document défendable. Un audit vendu 3 000 € qui oublierait la moitié des
 * réponses du client, ou qui annoncerait un financement au-dessus du plafond,
 * coûte plus cher qu'il ne rapporte.
 */

const RULES = {
  AGEFICE_THRESHOLD_CA_N1: 7000,
  AGEFICE_ANNUAL_CAP: 3000,
  AGEFICE_ANNUAL_CAP_REDUCED: 600,
  AGEFICE_HOURLY_PRESENTIEL: 42,
  AGEFICE_HOURLY_DISTANCIEL: 35,
  AGEFICE_LEAD_DAYS_MIN: 15,
  AGEFICE_INDEMNITY_MIN: 700,
  AGEFICE_INDEMNITY_MAX: 800,
  OPCO_EP_ENVELOPE_LT_11: 2500,
  OPCO_EP_ENVELOPE_11_TO_50: 4500,
  OPCO_EP_RATE_REGLEMENTAIRE: 40,
  OPCO_EP_RATE_COEUR_METIER: 30,
  PRICE_PER_HOUR_PER_PARTICIPANT: 84,
  HALF_DAY_ONSITE_HOURS: 4,
  TRAINER_COUNT_DEFAULT: 2,
  CONSUMPTION_LEVER_PERCENT: 30,
  DISCOUNT_WARNING_PERCENT: 15,
  PROPOSAL_VALIDITY_DAYS: 30,
};

/** Un diagnostic complet, toutes questions du set léger renseignées. */
const ANSWERS = [
  ['identity-network', 'Indépendant'],
  ['identity-agencies-count', 1],
  ['identity-geo-areas', 'Vence, Saint-Jeannet, La Gaude'],
  ['identity-activities', ['transaction_ancien', 'location']],
  ['identity-transaction-ancien-percent', 85],
  ['identity-property-types', ['appartements', 'maisons']],
  ['identity-sales-n1', 72],
  ['identity-revenue-n1', 720_000],
  ['identity-revenue-goal', 900_000],
  ['identity-ambition-3y', 'Ouvrir une seconde agence et passer la main sur le quotidien'],
  ['team-total-count', 6],
  ['team-employees-count', 2],
  ['team-independents-count', 4],
  ['team-directors-count', 1],
  ['funding-agefice-used', 'ne_sait_pas'],
  ['funding-opco-used', 'non'],
  ['funding-past-refusals', 'no'],
  ['prospecting-methods', ['pige', 'terrain', 'recommandation']],
  ['prospecting-who', 'certains'],
  ['prospecting-contacts-per-month', 100],
  ['seller-meetings-per-month', 20],
  ['seller-discovery-formalized', 'no'],
  ['mandates-per-month', 8],
  ['mandates-active-stock', 45],
  ['mandates-exclusivity-percent', 25],
  ['mandates-price-above-market', 'parfois'],
  ['commercial-followup-frequency', 'a_la_demande'],
  ['commercial-price-drop-per-month-percent', 2],
  ['buyers-contacts-per-month', 80],
  ['buyers-financing-verified', 'no'],
  ['visits-per-month', 60],
  ['offers-per-month', 9],
  ['compromis-per-month', 7],
  ['actes-per-month', 6],
  ['db-volume', 3400],
  ['google-reviews-count', 12],
  ['google-reviews-score', 92],
  ['tools-metier', 'Apimo'],
  ['tools-ai-usage', ['redaction_annonces']],
  ['mgmt-indicators-followed', ['ca']],
  ['mgmt-top3-difficulties', 'Le recrutement, la rentrée de mandats exclusifs, le suivi vendeur'],
  [
    'mgmt-top3-priorities',
    'Rentrer plus d’exclusivités, structurer la prospection, fiabiliser les compromis',
  ],
].map(([questionId, value]) => ({ questionId: questionId as string, value, isSkipped: false }));

const PARTICIPANTS = [
  {
    id: 'p1',
    displayName: 'Marie D.',
    statut: 'INDEPENDANT' as const,
    caN1: 120_000,
    objectiveCa: 150_000,
    strengths: 'Excellente en découverte, à l’aise au téléphone',
    priorityNeed: 'Exclusivité',
    opcoEligible: null,
    trainings24mFunded: 0,
    includedInProposal: true,
  },
  {
    id: 'p2',
    displayName: 'Julien P.',
    statut: 'INDEPENDANT' as const,
    caN1: 95_000,
    objectiveCa: 120_000,
    strengths: 'Très bon sur le suivi acquéreur',
    priorityNeed: 'Prospection',
    opcoEligible: null,
    trainings24mFunded: 0,
    includedInProposal: true,
  },
  {
    id: 'p3',
    displayName: 'Sophie L.',
    statut: 'SALARIE' as const,
    caN1: null,
    objectiveCa: null,
    strengths: 'Pilier administratif',
    priorityNeed: null,
    opcoEligible: true,
    trainings24mFunded: null,
    includedInProposal: true,
  },
];

const OF = {
  name: 'Start Academy',
  siret: '90123456700018',
  numDA: '93060812345',
  address: '12 avenue des Alpes, 06000 Nice',
  email: 'formation@start-academy.fr',
  phone: '04 93 00 00 00',
};

function build(overrides: Partial<Parameters<typeof buildAuditData>[0]> = {}) {
  return buildAuditData({
    reference: 'DIAG-0042',
    agencyName: 'Agence du Baou',
    generatedAt: new Date('2026-09-02T10:00:00Z'),
    variant: 'LEGER',
    answers: ANSWERS,
    participants: PARTICIPANTS,
    rules: RULES,
    of: OF,
    valueEuros: 3000,
    ...overrides,
  });
}

describe('Structure du rapport — conformité à la maquette', () => {
  const html = renderAuditHtml(build());

  it('compte exactement 17 pages', () => {
    expect(html.match(/<section class="page">/g)).toHaveLength(17);
  });

  it('en compte au moins 15 — le plancher que la spec impose', () => {
    expect(html.match(/<section class="page">/g)!.length).toBeGreaterThanOrEqual(15);
  });

  it('numérote chaque page « n / 17 »', () => {
    for (let i = 1; i <= 17; i += 1) {
      expect(html, `pied de page ${i}`).toContain(`<span>${i} / 17</span>`);
    }
  });

  it('affiche la valeur de la prestation en couverture', () => {
    expect(html).toMatch(/3\s*000\s*€/);
  });

  it('place le financement en DERNIÈRE page, jamais avant', () => {
    // `lastIndexOf` et non `indexOf` : ces trois titres figurent aussi au
    // sommaire de la page 2, et on veut comparer les PAGES, pas le sommaire.
    const financement = html.lastIndexOf('Votre potentiel de financement');
    const equipe = html.lastIndexOf('La performance de votre équipe');
    const priorites = html.lastIndexOf('trois priorités');
    expect(financement).toBeGreaterThan(equipe);
    expect(financement).toBeGreaterThan(priorites);
    // Et aucune page ne s'ouvre après lui.
    const derniereOuverture = html.lastIndexOf('<section class="page">');
    expect(derniereOuverture).toBeLessThan(financement);
  });

  it('ouvre chaque chapitre par la restitution avant l’analyse', () => {
    const dit = html.indexOf('Ce que vous nous avez dit');
    const lecture = html.indexOf('Notre lecture');
    expect(dit).toBeGreaterThan(0);
    expect(dit).toBeLessThan(lecture);
  });

  it('ne porte plus le filigrane « spécimen » de la maquette', () => {
    expect(html.toLowerCase()).not.toContain('spécimen');
  });

  it('ne tente aucun chargement de police distante — le moteur PDF est hors réseau', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('@import');
  });
});

describe('Restitution — le client doit se reconnaître dans ce qu’il lit', () => {
  const data = build();
  const html = renderAuditHtml(data);

  it('restitue TOUTES les réponses données, sans en perdre une', () => {
    const restituees = data.chapters.flatMap((c) => c.answers.map((a) => a.questionId));
    const donnees = ANSWERS.map((a) => a.questionId);
    expect([...restituees].sort()).toEqual([...donnees].sort());
  });

  it('rend les réponses en français, jamais en valeurs techniques', () => {
    expect(html).toContain('Certains seulement');
    expect(html).toContain('Ne sait pas');
    expect(html).not.toContain('ne_sait_pas');
    expect(html).not.toContain('transaction_ancien');
    expect(html).not.toContain('a_la_demande');
  });

  it('utilise les intitulés ÉCRITS, pas les questions orales du rendez-vous', () => {
    expect(html).toContain('Vos sources de contacts vendeurs');
    const orale = DIAGNOSTIC_QUESTIONS.find((q) => q.id === 'prospecting-methods')!.question;
    expect(html).not.toContain(orale);
  });

  it('reprend les mots du dirigeant en verbatim', () => {
    expect(html).toContain('Rentrer plus d’exclusivités');
  });

  it('marque « non connu » une question explicitement passée, sans la faire disparaître', () => {
    const d = build({
      answers: [
        ...ANSWERS,
        { questionId: 'identity-property-types', value: null, isSkipped: true },
      ],
    });
    const ligne = d.chapters
      .flatMap((c) => c.answers)
      .find((a) => a.questionId === 'identity-property-types');
    expect(ligne?.value).toBe('Non connu au moment du rendez-vous');
  });
});

describe('Scores', () => {
  const data = build();
  const html = renderAuditHtml(data);

  it('porte un score global et un score par chapitre', () => {
    expect(data.globalScore).not.toBeNull();
    expect(data.chapterScores).toHaveLength(11);
    expect(html).toContain('/ 100');
  });

  it('affiche le barème utilisé — un score sans barème n’est pas défendable', () => {
    expect(html).toContain(data.scoringVersion);
  });

  it('affiche la couverture à côté de chaque score', () => {
    expect(html).toContain('couverture');
  });
});

describe('Financement — les garde-fous du document remis', () => {
  const data = build();
  const html = renderAuditHtml(data);

  it("n'annonce jamais une prise en charge au-dessus du plafond", () => {
    const parAgent = RULES.AGEFICE_ANNUAL_CAP;
    for (const p of data.funding.participants) {
      expect(p.coverage).toBeLessThanOrEqual(parAgent);
    }
    expect(data.funding.agefice.coverage).toBeLessThanOrEqual(
      parAgent * data.funding.agefice.participantCount,
    );
  });

  it('porte les heures conventionnées, la valeur de référence unique', () => {
    expect(html).toContain(`${data.funding.conventionedHours} h`);
    expect(html).toContain('convention');
  });

  it('mentionne les deux dossiers distincts et l’absence d’avance de trésorerie', () => {
    expect(html).toContain('Deux dossiers distincts');
    expect(html).toContain('Aucune avance de');
  });

  it('porte la réserve d’usage : montants indicatifs, confirmés à l’instruction', () => {
    expect(html).toContain('Montants indicatifs');
    expect(html).toContain("l'instruction de chaque");
  });
});

describe('Traçabilité de la rédaction (leçon E-3)', () => {
  it('dit toujours d’où vient le texte — jamais de repli silencieux', () => {
    const data = build();
    expect(data.generationSource).toBe('heuristique');
    expect(renderAuditHtml(data)).toContain('rédaction heuristique');
  });
});

describe('Robustesse', () => {
  it('produit un rapport lisible sur un diagnostic à peine commencé', () => {
    const html = renderAuditHtml(
      build({
        answers: [{ questionId: 'identity-sales-n1', value: 72, isSkipped: false }],
        participants: [],
      }),
    );
    expect(html.match(/<section class="page">/g)).toHaveLength(17);
    expect(html).toContain('Aucune réponse enregistrée sur ce chapitre');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('échappe le HTML des réponses saisies à la main', () => {
    const html = renderAuditHtml(
      build({
        answers: [
          { questionId: 'identity-network', value: '<script>alert(1)</script>', isSkipped: false },
        ],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('est déterministe à date fixée', () => {
    expect(renderAuditHtml(build())).toBe(renderAuditHtml(build()));
  });
});

describe('Intégrité de la feuille de style', () => {
  /**
   * Cette feuille est GÉNÉRÉE depuis la maquette. Une extraction bâclée a déjà
   * mangé une règle, produit du CSS invalide, et fait abandonner le parseur :
   * le PDF sortait sans mise en forme, et aucun test unitaire ne le voyait.
   */
  it('est syntaxiquement équilibrée', async () => {
    const { AUDIT_STYLES } = await import('../templates/audit-styles');
    const open = (AUDIT_STYLES.match(/\{/g) ?? []).length;
    const close = (AUDIT_STYLES.match(/\}/g) ?? []).length;
    expect(open, 'accolades déséquilibrées — le parseur CSS abandonnera').toBe(close);
  });

  it('porte les règles qui font la mise en page du rapport', async () => {
    const { AUDIT_STYLES } = await import('../templates/audit-styles');
    for (const rule of ['.page{', '.tile{', '.chip{', '.cover-band{', 'th{', '.footer{']) {
      expect(AUDIT_STYLES, `règle ${rule} absente`).toContain(rule);
    }
  });

  it('ne laisse aucune variable CSS non résolue — le moteur PDF les ignore en silence', () => {
    // WeasyPrint 60 ne substitue pas les custom properties dans les propriétés
    // raccourcies : `background:var(--x)` sort blanc sur blanc, sans erreur.
    return import('../templates/audit-styles').then(({ AUDIT_STYLES }) => {
      expect(AUDIT_STYLES).not.toContain('var(--');
    });
  });

  it('ne tente aucun chargement distant', async () => {
    const { AUDIT_STYLES } = await import('../templates/audit-styles');
    expect(AUDIT_STYLES).not.toContain('@import');
    expect(AUDIT_STYLES).not.toContain('http');
  });
});
