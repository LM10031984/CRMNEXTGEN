import { DIAGNOSTIC_QUESTIONS } from './questions';
import type { DiagnosticChapter, DiagnosticQuestion, DiagnosticVariantKey } from './types';

/**
 * Le set LÉGER — spec §6.2.
 *
 * Invariant non négociable : c'est un SOUS-ENSEMBLE STRICT du complet, avec les
 * MÊMES IDs. C'est ce qui rend l'upgrade « Passer en audit complet » gratuit :
 * les réponses déjà saisies restent, les questions manquantes apparaissent.
 * Un ID inventé ici ferait un diagnostic léger non convertible — le test de
 * contrat l'interdit.
 *
 * Ce qu'il couvre : le funnel de bout en bout, toutes les alertes fortes, le
 * financement et les priorités du dirigeant. Ce qui saute : le détail des
 * pratiques, l'outillage fin (Ch.10 long), le management détaillé.
 *
 * D-1 (spec) : composition à ajuster après 2 R1 réels. La modifier = bumper
 * `REFERENTIAL_VERSION` et la baseline du test.
 */
export const LIGHT_QUESTION_SET: readonly string[] = [
  // Ch.1 — le contexte chiffré, sans lequel aucun ratio ne tient.
  'identity-activities',
  'identity-transaction-ancien-percent',
  'identity-sales-n1',
  'identity-revenue-n1',
  'identity-revenue-goal',
  // Ch.2 — effectifs + historique de financement. La grille nominative
  // (`DiagnosticParticipant`) est obligatoire en léger comme en complet :
  // sans elle, pas de budget, donc pas de R2.
  'team-total-count',
  'team-employees-count',
  'team-independents-count',
  'team-directors-count',
  'funding-agefice-used',
  'funding-opco-used',
  'funding-past-refusals',
  // Ch.3 — d'où viennent les vendeurs.
  'prospecting-methods',
  'prospecting-who',
  'prospecting-contacts-per-month',
  // Ch.4 — l'entrée en relation vendeur.
  'seller-meetings-per-month',
  'seller-discovery-formalized',
  // Ch.5 — la qualité du stock.
  'mandates-per-month',
  'mandates-active-stock',
  'mandates-exclusivity-percent',
  'mandates-price-above-market',
  // Ch.6 — le pilotage du stock.
  'commercial-followup-frequency',
  'commercial-price-drop-per-month-percent',
  // Ch.7 — les acquéreurs.
  'buyers-contacts-per-month',
  'buyers-financing-verified',
  // Ch.8 — le funnel de transformation, en entier (c'est le cœur du léger).
  'visits-per-month',
  'offers-per-month',
  'compromis-per-month',
  'actes-per-month',
  // Ch.9 — les actifs immatériels.
  'db-volume',
  'google-reviews-count',
  'google-reviews-score',
  // Ch.10 — l'outillage, version courte.
  'tools-metier',
  'tools-ai-usage',
  // Ch.11 — ce que le dirigeant pilote et ce qui lui fait mal.
  'mgmt-indicators-followed',
  'mgmt-top3-difficulties',
  'mgmt-top3-priorities',
];

const LIGHT_SET = new Set(LIGHT_QUESTION_SET);

/** Une question fait-elle partie du set léger ? */
export function isInLightSet(questionId: string): boolean {
  return LIGHT_SET.has(questionId);
}

/**
 * Les questions applicables à une variante, dans l'ordre du référentiel.
 * COMPLET = tout ; LEGER = le sous-ensemble.
 */
export function getQuestionsForVariant(variant: DiagnosticVariantKey): DiagnosticQuestion[] {
  if (variant === 'COMPLET') return [...DIAGNOSTIC_QUESTIONS];
  return DIAGNOSTIC_QUESTIONS.filter((q) => LIGHT_SET.has(q.id));
}

/** Les questions d'un chapitre pour une variante — c'est l'unité d'écran (lot B). */
export function getChapterQuestions(
  chapter: DiagnosticChapter,
  variant: DiagnosticVariantKey,
): DiagnosticQuestion[] {
  return getQuestionsForVariant(variant).filter((q) => q.chapter === chapter);
}

/**
 * Les chapitres qui portent au moins une question dans cette variante.
 * En léger, aucun chapitre n'est vide aujourd'hui — mais un ajustement de D-1
 * pourrait en vider un, et un écran vide serait une régression silencieuse.
 */
export function getChaptersForVariant(variant: DiagnosticVariantKey): DiagnosticChapter[] {
  const seen = new Set<DiagnosticChapter>();
  for (const q of getQuestionsForVariant(variant)) seen.add(q.chapter);
  return [...seen].sort((a, b) => a - b);
}

/**
 * Les questions qu'un passage LÉGER → COMPLET fait apparaître. Aucune réponse
 * n'est perdue : les IDs sont communs, on n'ajoute que le complément.
 */
export function getQuestionsAddedByUpgrade(): DiagnosticQuestion[] {
  return DIAGNOSTIC_QUESTIONS.filter((q) => !LIGHT_SET.has(q.id));
}
