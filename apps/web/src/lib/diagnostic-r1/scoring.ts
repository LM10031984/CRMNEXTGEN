/**
 * Barème de scoring du diagnostic — D-9, version 1.
 *
 * Ce qu'il produit : un score /100 par chapitre et un score global, tels
 * qu'ils apparaissent sur chaque page de l'audit.
 *
 * Ce qui l'a guidé :
 *
 *   • **Un score se justifie ou n'existe pas.** Chaque point vient d'une règle
 *     nommée, lisible dans le tableau `RULES` ci-dessous. Un dirigeant qui
 *     demande « pourquoi 38 ? » doit obtenir une réponse en trois phrases.
 *
 *   • **Ne pas noter ce qu'on ignore.** Une question sans réponse ne compte ni
 *     en faveur ni en défaveur : le score est calculé sur les seules règles
 *     évaluables, et la couverture est affichée à côté. Compter l'ignorance
 *     comme un zéro ferait chuter le score d'une agence qui a simplement
 *     répondu vite — et rendrait l'audit faux.
 *
 *   • **Versionné et figé.** `SCORING_VERSION` est stocké dans le snapshot :
 *     deux audits édités à six mois d'écart doivent rester comparables, ou
 *     dire explicitement qu'ils ne le sont pas.
 *
 * Recalibrage prévu sur les trois premiers audits réels, puis gel (D-9).
 */

import { DIAGNOSTIC_CHAPTERS, type DiagnosticChapter } from '@qualiof/shared/diagnostic';

import { DEFAULT_BENCHMARKS, type Benchmarks, type BenchmarksOverride } from './benchmarks';

export const SCORING_VERSION = 'bareme-v1-2026-09';

export interface ScoringInput {
  answers: Record<string, unknown>;
  ratios: Record<string, number | null>;
  benchmarks?: BenchmarksOverride;
}

export interface ChapterScore {
  chapter: DiagnosticChapter;
  title: string;
  /** null = aucune règle évaluable sur ce chapitre (données trop incomplètes). */
  score: number | null;
  /** Part des règles du chapitre qui ont pu être évaluées, en %. */
  coverage: number;
  /** Le détail, pour pouvoir répondre à « pourquoi ce score ? ». */
  breakdown: { rule: string; weight: number; earned: number | null; note: string }[];
}

export interface ScoringOutput {
  version: string;
  global: number | null;
  chapters: ChapterScore[];
}

type RuleKind =
  /** Un ratio comparé à son repère : le score est le taux d'atteinte, plafonné. */
  | { kind: 'ratio'; ratioKey: string; benchmarkKey: keyof typeof DEFAULT_BENCHMARKS }
  /** Un ratio où PLUS BAS vaut mieux (visites par vente). */
  | { kind: 'ratio-inverse'; ratioKey: string; benchmarkKey: keyof typeof DEFAULT_BENCHMARKS }
  /** Une pratique en place ou non. */
  | { kind: 'yesno'; questionId: string; goodAnswer: 'yes' | 'no' }
  /** Une réponse à choix, avec un score par valeur. */
  | { kind: 'choice'; questionId: string; scores: Record<string, number> }
  /** Un multi-choix : score proportionnel au nombre d'items retenus. */
  | { kind: 'multichoice'; questionId: string; target: number; penalizeValues?: string[] };

interface Rule {
  chapter: DiagnosticChapter;
  id: string;
  weight: number;
  note: string;
  spec: RuleKind;
}

/**
 * Le barème. Les poids sont relatifs à l'intérieur d'un chapitre — inutile
 * qu'ils totalisent 100, la normalisation s'en charge.
 */
const RULES: readonly Rule[] = [
  // Ch.1 — le contexte n'est pas noté en soi : il conditionne la lecture.
  {
    chapter: 1,
    id: 'transaction-ancien',
    weight: 1,
    note: "Part de la transaction dans l'ancien",
    spec: {
      kind: 'ratio',
      ratioKey: 'transactionAncienPercent',
      benchmarkKey: 'transactionAncienMinPercent',
    },
  },

  // Ch.2 — la capacité à financer sa montée en compétence.
  {
    chapter: 2,
    id: 'droits-connus',
    weight: 1,
    note: 'Le dirigeant connaît ses droits à formation',
    spec: { kind: 'yesno', questionId: 'funding-rights-known', goodAnswer: 'yes' },
  },
  {
    chapter: 2,
    id: 'formations-24m',
    weight: 1,
    note: 'Au moins une action de formation sur 24 mois',
    spec: { kind: 'yesno', questionId: 'funding-trainings-24m', goodAnswer: 'yes' },
  },
  {
    chapter: 2,
    id: 'sans-refus',
    weight: 1,
    note: 'Aucun refus de prise en charge à traiter',
    spec: { kind: 'yesno', questionId: 'funding-past-refusals', goodAnswer: 'no' },
  },

  // Ch.3 — la capacité à générer des contacts vendeurs.
  {
    chapter: 3,
    id: 'contacts-vers-rdv',
    weight: 3,
    note: 'Transformation contacts → rendez-vous',
    spec: { kind: 'ratio', ratioKey: 'contactsToRdvPercent', benchmarkKey: 'contactsToRdvPercent' },
  },
  {
    chapter: 3,
    id: 'qui-prospecte',
    weight: 3,
    note: "Part de l'équipe qui prospecte réellement",
    spec: {
      kind: 'choice',
      questionId: 'prospecting-who',
      scores: { tous: 100, certains: 50, personne: 0 },
    },
  },
  {
    chapter: 3,
    id: 'sources',
    weight: 2,
    note: 'Diversité des sources de contacts',
    spec: {
      kind: 'multichoice',
      questionId: 'prospecting-methods',
      target: 3,
      penalizeValues: ['aucune'],
    },
  },
  {
    chapter: 3,
    id: 'trame',
    weight: 2,
    note: "Trame d'appel commune",
    spec: { kind: 'yesno', questionId: 'prospecting-script', goodAnswer: 'yes' },
  },

  // Ch.4 — l'entrée en relation vendeur.
  {
    chapter: 4,
    id: 'rdv-vers-mandat',
    weight: 3,
    note: 'Transformation rendez-vous → mandat',
    spec: { kind: 'ratio', ratioKey: 'rdvToMandatPercent', benchmarkKey: 'rdvToMandatPercent' },
  },
  {
    chapter: 4,
    id: 'decouverte',
    weight: 3,
    note: 'Découverte vendeur formalisée',
    spec: { kind: 'yesno', questionId: 'seller-discovery-formalized', goodAnswer: 'yes' },
  },
  {
    chapter: 4,
    id: 'avis-de-valeur',
    weight: 2,
    note: 'Avis de valeur écrit remis',
    spec: { kind: 'yesno', questionId: 'seller-written-valuation', goodAnswer: 'yes' },
  },

  // Ch.5 — la qualité du stock.
  {
    chapter: 5,
    id: 'exclusivite',
    weight: 4,
    note: "Part d'exclusivité dans les rentrées",
    spec: { kind: 'ratio', ratioKey: 'exclusivityPercent', benchmarkKey: 'exclusivityPercent' },
  },
  {
    chapter: 5,
    id: 'defense-du-prix',
    weight: 3,
    note: 'Les conseillers tiennent le prix de rentrée',
    spec: { kind: 'yesno', questionId: 'skill-price-defense', goodAnswer: 'yes' },
  },
  {
    chapter: 5,
    id: 'prix-au-dessus',
    weight: 2,
    note: 'Attitude face à un vendeur au-dessus du marché',
    spec: {
      kind: 'choice',
      questionId: 'mandates-price-above-market',
      scores: { jamais: 100, rarement: 75, parfois: 40, souvent: 10, toujours: 0 },
    },
  },

  // Ch.6 — le pilotage du stock.
  {
    chapter: 6,
    id: 'suivi-vendeur',
    weight: 3,
    note: 'Rythme de suivi vendeur',
    spec: {
      kind: 'choice',
      questionId: 'commercial-followup-frequency',
      scores: { hebdomadaire: 100, bimensuel: 80, mensuel: 55, a_la_demande: 20, jamais: 0 },
    },
  },
  {
    chapter: 6,
    id: 'requalification',
    weight: 2,
    note: 'Processus de requalification du stock',
    spec: { kind: 'yesno', questionId: 'commercial-requalification-process', goodAnswer: 'yes' },
  },

  // Ch.7 — les acquéreurs.
  {
    chapter: 7,
    id: 'financement-verifie',
    weight: 4,
    note: 'Financement acquéreur vérifié en amont',
    spec: { kind: 'yesno', questionId: 'buyers-financing-verified', goodAnswer: 'yes' },
  },
  {
    chapter: 7,
    id: 'decouverte-acquereur',
    weight: 3,
    note: 'Découverte acquéreur formalisée',
    spec: { kind: 'yesno', questionId: 'buyers-discovery-formalized', goodAnswer: 'yes' },
  },

  // Ch.8 — la transformation.
  {
    chapter: 8,
    id: 'offres-vers-compromis',
    weight: 3,
    note: 'Transformation offres → compromis',
    spec: {
      kind: 'ratio',
      ratioKey: 'offresToCompromisPercent',
      benchmarkKey: 'offresToCompromisPercent',
    },
  },
  {
    chapter: 8,
    id: 'compromis-vers-acte',
    weight: 4,
    note: 'Transformation compromis → acte',
    spec: {
      kind: 'ratio',
      ratioKey: 'compromisToActePercent',
      benchmarkKey: 'compromisToActePercent',
    },
  },
  {
    chapter: 8,
    id: 'visites-par-vente',
    weight: 2,
    note: 'Nombre de visites nécessaires par vente',
    spec: { kind: 'ratio-inverse', ratioKey: 'visitesParVente', benchmarkKey: 'visitsPerActe' },
  },

  // Ch.9 — les actifs immatériels.
  {
    chapter: 9,
    id: 'avis-par-vente',
    weight: 3,
    note: 'Avis en ligne rapportés aux ventes',
    spec: {
      kind: 'ratio',
      ratioKey: 'avisParVentePercent',
      benchmarkKey: 'reviewsPerVentePercent',
    },
  },
  {
    chapter: 9,
    id: 'collecte-avis',
    weight: 2,
    note: "Processus de collecte d'avis",
    spec: { kind: 'yesno', questionId: 'reviews-collection-process', goodAnswer: 'yes' },
  },
  {
    chapter: 9,
    id: 'crm-a-jour',
    weight: 2,
    note: 'Base à jour',
    spec: {
      kind: 'choice',
      questionId: 'db-crm-uptodate',
      scores: { oui: 100, partiellement: 50, non: 0 },
    },
  },
  {
    chapter: 9,
    id: 'exploitation-base',
    weight: 2,
    note: 'La base est exploitée',
    spec: {
      kind: 'multichoice',
      questionId: 'db-exploitation',
      target: 2,
      penalizeValues: ['aucune'],
    },
  },

  // Ch.10 — l'outillage.
  {
    chapter: 10,
    id: 'signature-electronique',
    weight: 2,
    note: 'Signature électronique en place',
    spec: { kind: 'yesno', questionId: 'tools-esignature', goodAnswer: 'yes' },
  },
  {
    chapter: 10,
    id: 'ia-parametree',
    weight: 3,
    note: "Outil d'IA paramétré (instructions personnalisées)",
    spec: { kind: 'yesno', questionId: 'tool-chatgpt-setup', goodAnswer: 'yes' },
  },
  {
    chapter: 10,
    id: 'prompts-communs',
    weight: 3,
    note: "Modèles de prompts communs à l'équipe",
    spec: { kind: 'yesno', questionId: 'tool-prompts-standard', goodAnswer: 'yes' },
  },
  {
    chapter: 10,
    id: 'anti-hallucination',
    weight: 2,
    note: 'Réflexe de vérification des réponses IA',
    spec: { kind: 'yesno', questionId: 'tool-anti-hallucination', goodAnswer: 'yes' },
  },
  {
    chapter: 10,
    id: 'acces-equipe',
    weight: 2,
    note: "Toute l'équipe a accès aux outils",
    spec: { kind: 'yesno', questionId: 'tool-team-access', goodAnswer: 'yes' },
  },

  // Ch.11 — le pilotage.
  {
    chapter: 11,
    id: 'reunion-equipe',
    weight: 3,
    note: "Rythme de réunion d'équipe",
    spec: {
      kind: 'choice',
      questionId: 'mgmt-team-meeting-frequency',
      scores: { hebdomadaire: 100, bimensuel: 70, mensuel: 45, jamais: 0 },
    },
  },
  {
    chapter: 11,
    id: 'coaching',
    weight: 3,
    note: 'Coaching individuel régulier',
    spec: { kind: 'yesno', questionId: 'mgmt-coaching-individual', goodAnswer: 'yes' },
  },
  {
    chapter: 11,
    id: 'indicateurs',
    weight: 3,
    note: 'Indicateurs suivis',
    spec: { kind: 'multichoice', questionId: 'mgmt-indicators-followed', target: 3 },
  },
  {
    chapter: 11,
    id: 'reporting',
    weight: 2,
    note: 'Reporting commercial en place',
    spec: { kind: 'yesno', questionId: 'exec-manager-reporting', goodAnswer: 'yes' },
  },
];

/** Le score d'une règle, entre 0 et 100. null = non évaluable. */
function evaluate(rule: Rule, input: ScoringInput, benchmarks: Benchmarks): number | null {
  const { spec } = rule;

  if (spec.kind === 'ratio' || spec.kind === 'ratio-inverse') {
    const value =
      spec.ratioKey === 'transactionAncienPercent'
        ? toNumber(input.answers['identity-transaction-ancien-percent'])
        : (input.ratios[spec.ratioKey] ?? null);
    if (value === null) return null;
    const target = benchmarks[spec.benchmarkKey];
    if (target <= 0) return null;
    const attainment =
      spec.kind === 'ratio' ? (value / target) * 100 : (target / Math.max(value, 0.01)) * 100;
    // Plafonné à 100 : dépasser un repère est une bonne nouvelle, pas un moyen
    // de compenser un autre chapitre en ruine.
    return Math.max(0, Math.min(100, Math.round(attainment)));
  }

  if (spec.kind === 'yesno') {
    const raw = input.answers[spec.questionId];
    if (raw !== 'yes' && raw !== 'no') return null;
    return raw === spec.goodAnswer ? 100 : 0;
  }

  if (spec.kind === 'choice') {
    const raw = input.answers[spec.questionId];
    if (typeof raw !== 'string') return null;
    return spec.scores[raw] ?? null;
  }

  // multichoice
  const raw = input.answers[spec.questionId];
  if (!Array.isArray(raw)) return null;
  const values = raw as string[];
  if (spec.penalizeValues?.some((v) => values.includes(v))) return 0;
  if (values.length === 0) return 0;
  return Math.min(100, Math.round((values.length / spec.target) * 100));
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/[%\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function computeScoring(input: ScoringInput): ScoringOutput {
  const benchmarks = { ...DEFAULT_BENCHMARKS, ...(input.benchmarks ?? {}) };

  const chapters: ChapterScore[] = DIAGNOSTIC_CHAPTERS.map((meta) => {
    const rules = RULES.filter((r) => r.chapter === meta.chapter);
    const breakdown = rules.map((r) => ({
      rule: r.id,
      weight: r.weight,
      earned: evaluate(r, input, benchmarks),
      note: r.note,
    }));

    // Normalisation sur les seules règles évaluables : une question sans
    // réponse ne pèse ni pour ni contre.
    const evaluable = breakdown.filter((b) => b.earned !== null);
    const totalWeight = evaluable.reduce((s, b) => s + b.weight, 0);
    const score =
      totalWeight === 0
        ? null
        : Math.round(evaluable.reduce((s, b) => s + b.earned! * b.weight, 0) / totalWeight);

    const declaredWeight = rules.reduce((s, r) => s + r.weight, 0);

    return {
      chapter: meta.chapter,
      title: meta.title,
      score,
      coverage: declaredWeight === 0 ? 0 : Math.round((totalWeight / declaredWeight) * 100),
      breakdown,
    };
  });

  // Le score global pondère les chapitres par le poids total de leurs règles
  // évaluées : un chapitre presque vide ne tire pas la note générale.
  const scored = chapters.filter((c) => c.score !== null);
  const weights = scored.map((c) =>
    c.breakdown.filter((b) => b.earned !== null).reduce((s, b) => s + b.weight, 0),
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const global =
    totalWeight === 0
      ? null
      : Math.round(scored.reduce((s, c, i) => s + c.score! * weights[i]!, 0) / totalWeight);

  return { version: SCORING_VERSION, global, chapters };
}
