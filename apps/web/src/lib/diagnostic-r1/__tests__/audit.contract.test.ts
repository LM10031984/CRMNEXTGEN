import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_QUESTIONS } from '@qualiof/shared/diagnostic';

import { buildAuditData } from '../audit-builder';
import { AUDIT_STYLES } from '../templates/audit-styles';
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

/** Les sections qui occupent leur propre page. */
const pageSections = (html: string) => html.match(/<section class="page" id="s-\d\d">/g) ?? [];
/** Les chapitres rendus au fil de l'eau (format condensé). */
const flowChapters = (html: string) => html.match(/<div class="chap" id="s-\d\d">/g) ?? [];

describe('Structure du rapport — conformité à la maquette', () => {
  const html = renderAuditHtml(build());

  it('porte les 17 sections du rapport, quel que soit le format', () => {
    // Le NUMÉRO DE SECTION est l'invariant : c'est lui qui est imprimé en tête
    // de chaque partie et repris au sommaire. Le nombre de PAGES, lui, dépend
    // du format (17 en complet, ~10 en condensé).
    const ids = [...html.matchAll(/ id="s-(\d\d)"/g)].map((m) => m[1]);
    expect(ids).toEqual(
      Array.from({ length: 17 }, (_, i) => String(i + 1).padStart(2, '0')),
    );
  });

  it('sort un diagnostic léger au format condensé — les chapitres s’enchaînent', () => {
    // Décision Laurent du 03/09/2026 : neuf pages à moitié vides ne valent pas
    // d'être remises. Les huit sections hors chapitres gardent leur page.
    expect(pageSections(html)).toHaveLength(8);
    expect(flowChapters(html)).toHaveLength(9);
    expect(html).toContain('<div class="flow">');
  });

  it('n’autorise jamais la coupure d’un chapitre entre deux pages', () => {
    expect(AUDIT_STYLES).toMatch(/\.flow > \.chap\{[^}]*break-inside:avoid/);
    expect(AUDIT_STYLES).toMatch(/\.flow > \.chap\{[^}]*page-break-inside:avoid/);
  });

  it('numérote les pages depuis le moteur, pas depuis un total écrit en dur', () => {
    // En condensé le nombre de pages n'est pas connu à la génération : il
    // sortait « n / 17 » sur un document qui en fait dix. Les compteurs CSS le
    // résolvent à l'impression, pour les deux formats.
    expect(html).toContain('counter(page)');
    expect(html).toContain('counter(pages)');
    expect(html).not.toMatch(/<span>\d+ \/ 17<\/span>/);
  });

  it('renvoie le sommaire vers de vraies ancres, et vers la vraie page', () => {
    const cibles = [...html.matchAll(/class="pno" href="#(s-\d\d)"/g)].map((m) => m[1]);
    expect(cibles.length).toBeGreaterThanOrEqual(15);
    for (const cible of cibles) {
      expect(html, `ancre ${cible} manquante`).toContain(`id="${cible}"`);
    }
    expect(html).toContain('target-counter(attr(href), page)');
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
    const derniereOuverture = html.lastIndexOf('<section class="page" id=');
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
    expect([...html.matchAll(/ id="s-\d\d"/g)]).toHaveLength(17);
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

describe('Format complet — une page par chapitre (la maquette d’origine)', () => {
  const html = renderAuditHtml(build({ variant: 'COMPLET' }));

  it('rend 17 pages, une par section', () => {
    expect(pageSections(html)).toHaveLength(17);
  });

  it('ne bascule jamais en flux condensé', () => {
    expect(html).not.toContain('<div class="flow">');
    expect(flowChapters(html)).toHaveLength(0);
  });

  it('respecte le plancher de 15 pages que la spec impose au format complet', () => {
    expect(pageSections(html).length).toBeGreaterThanOrEqual(15);
  });
});

describe('Ce qui se voyait à l’œil nu sur le premier audit réel (DIAG-0001)', () => {
  const html = renderAuditHtml(build());

  it('sépare le numéro de section de son titre', () => {
    // « 02Pourquoi », « 17Votre potentiel » : le gap flex de la maquette n'est
    // pas appliqué par le moteur, la marge du numéro le remplace.
    expect(AUDIT_STYLES).toMatch(/\.sec>h2 \.no, \.chap-title \.no\{[^}]*margin-right/);
    // Le numéro est un bloc à part entière : plus de flex, donc plus de gap
    // perdu — et le titre garde son propre fil quand il passe à la ligne.
    expect(AUDIT_STYLES).toContain('.sec>h2, .chap-title{ display:block }');
    expect(AUDIT_STYLES).toMatch(/\.no\{ display:inline-block/);
  });

  it('ne colle pas « / 100 » au score', () => {
    expect(html).not.toMatch(/\d<small>\s*\//);
    expect(html).toContain('<small>&#160;/ 100</small>');
  });

  it('donne au score la couleur du statut du chapitre', () => {
    const faible = build().chapters.find((c) => c.score !== null && c.score < 45);
    expect(faible, 'le jeu de test doit porter un chapitre en alerte').toBeDefined();
    expect(html).toContain(`<div class="score is-alert">${faible!.score}`);
    expect(AUDIT_STYLES).toContain('.chap-meta .score.is-alert{ color:#b42318 }');
  });

  it('écrit « non noté » plutôt qu’un tiret qui ressemble à une barre', () => {
    const nonNote = build().chapters.find((c) => c.score === null);
    expect(nonNote, 'le jeu de test doit porter un chapitre non noté').toBeDefined();
    expect(html).toContain('<div class="score is-none">non noté</div>');
    expect(html).not.toContain('—<small>&#160;/ 100</small>');
  });

  it('dessine l’entonnoir en barres proportionnelles, pas en simple tableau', () => {
    expect(html).toContain('<div class="funnel">');
    expect(html).toMatch(/<div class="bar" style="width:/);
  });

  it('affiche le libellé de chaque barre — il manquait purement et simplement', () => {
    // Le libellé était un enfant flex de la barre : absent du PDF.
    expect(html).toMatch(/class="(in|out)lbl"/);
    expect(html).not.toMatch(/<div class="sbar"[^>]*><span>/);
  });

  it('ne déclare pas « conforme » une étape qu’il n’a pas comparée', () => {
    expect(html).toContain('non comparé');
  });
});

describe('Contenu — ce que la page équipe et la page financement doivent dire', () => {
  it('propose un objectif et une préconisation quand la production N-1 est connue', () => {
    const data = build();
    const html = renderAuditHtml(data);
    expect(data.teamObjectives.hasContent).toBe(true);
    expect(html).toContain('Objectif proposé');
    // Marie D. produit 120 k€ ; l'agence vise +25 % → 150 000 €.
    expect(data.teamObjectives.lines[0]?.objectiveCa).toBe(150_000);
    for (const l of data.teamObjectives.lines) {
      if (l.caN1 !== null) expect(l.recommendation).not.toBeNull();
    }
  });

  it('masque les deux colonnes plutôt que d’aligner des tirets quand rien n’est calculable', () => {
    const html = renderAuditHtml(
      build({
        participants: [
          {
            id: 'p1',
            displayName: 'Sans production',
            statut: 'SALARIE',
            caN1: null,
            objectiveCa: null,
            strengths: null,
            priorityNeed: null,
            opcoEligible: null,
            trainings24mFunded: null,
            includedInProposal: true,
          },
        ],
      }),
    );
    expect(html).not.toContain('Objectif proposé');
    expect(html).not.toContain('Constats &amp; préconisation');
  });

  it('ne laisse jamais la saisie du commercial être écrasée par la règle', () => {
    const data = build();
    // Marie D. porte un objectif saisi (150 000) et des forces notées.
    expect(data.teamObjectives.lines[0]?.recommendation).toContain('Excellente en découverte');
  });

  it("n'annonce aucun droit mobilisable sans bénéficiaire", () => {
    // 1 salarié déclaré au chapitre 2, aucune fiche salarié cartographiée :
    // la page affichait « 0 salarié(s) » et « 2 500 € » sur la même ligne.
    const html = renderAuditHtml(
      build({
        answers: [...ANSWERS.filter((a) => a.questionId !== 'team-employees-count'),
          { questionId: 'team-employees-count', value: 1, isSkipped: false }],
        participants: PARTICIPANTS.filter((p) => p.statut !== 'SALARIE'),
      }),
    );
    expect(html).toContain('0 salarié(s)');
    expect(html).not.toMatch(/0 salarié\(s\)<\/td>\s*<td class="num">\d/);
    expect(html).toContain('aucune fiche individuelle saisie');
  });

  it('rend une note d’avis sur 5, jamais en pourcentage', () => {
    const html = renderAuditHtml(
      build({
        answers: [...ANSWERS.filter((a) => a.questionId !== 'google-reviews-score'),
          { questionId: 'google-reviews-score', value: 3, isSkipped: false }],
      }),
    );
    expect(html).toContain('Note moyenne en ligne</td><td>3 / 5</td>');
    expect(html).not.toContain('Note moyenne en ligne</td><td>3 %</td>');
  });
});

describe('Fontes — ce que le conteneur de rendu sait réellement dessiner', () => {
  /**
   * Le conteneur WeasyPrint ne porte que les fontes Liberation. Un caractère
   * absent ne produit ni erreur ni carré : il sort BLANC. Les ✓ et ✗ de la
   * maquette avaient disparu de l'entonnoir sans que rien ne le signale.
   *
   * Le jeu autorisé est Latin-1 plus la ponctuation française et le signe €,
   * tous vérifiés présents dans LiberationSans-Regular.
   */
  const AUTORISES = new Set([
    0x0152, 0x0153, 0x2014, 0x2013, 0x2018, 0x2019, 0x201c, 0x201d, 0x202f, 0x20ac,
  ]);

  it('n’écrit aucun caractère que la fonte ne sait pas dessiner', () => {
    const html = renderAuditHtml(build());
    const texte = html
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
