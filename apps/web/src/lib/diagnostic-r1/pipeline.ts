/**
 * Synthèse « pipeline de transformation » — affichée après le chapitre 8.
 *
 * C'est le second moment de démonstration du R1 (spec §6.1) : le commercial
 * retourne l'écran et montre au dirigeant, chiffres en main, où sa chaîne fuit.
 *
 * Module PUR, sans I/O ni IA : la synthèse doit tomber en moins d'une seconde,
 * en rendez-vous, sur un wifi d'agence. Le moteur ratios/scoring complet et le
 * rapport d'audit arrivent au lot D — ici on ne fait que le tunnel.
 */

import { DEFAULT_BENCHMARKS } from './benchmarks';
import type { BenchmarksOverride } from './benchmarks';

export type StageKey =
  | 'contacts'
  | 'rdv'
  | 'mandats'
  | 'visites'
  | 'offres'
  | 'compromis'
  | 'actes';

export type StageStatus = 'conforme' | 'faible' | 'inconnu';

export interface PipelineStage {
  key: StageKey;
  label: string;
  /** Volume mensuel déclaré. null = question non posée ou passée. */
  value: number | null;
  /** Taux de passage depuis l'étape précédente, en %. */
  conversionPercent: number | null;
  /** Repère métier applicable au taux de passage. null = pas de repère. */
  benchmark: number | null;
  status: StageStatus;
  /** Écart relatif au repère, en points de % — négatif = en retard. */
  gap: number | null;
  /**
   * Le calcul COMPLET : ce que vaudrait, sur un an, le retour de cette étape à
   * son repère, tunnel inchangé par ailleurs. Reste dans le détail — ce n'est
   * pas ce qu'on met en avant (D-12). null quand le CA moyen par vente est
   * inconnu : on ne chiffre pas un enjeu sans base.
   */
  annualImpactEuros: number | null;
  /**
   * Le montant MIS EN AVANT (D-12, tranchée le 02/09/2026) : la moitié du
   * chemin vers le repère, et seulement tant qu'elle reste sous 25 % du CA N-1.
   * null au-delà — voir `impactPresentation`.
   */
  headlineImpactEuros: number | null;
  /**
   * Comment présenter l'enjeu :
   *   'montant'          → afficher `headlineImpactEuros` ;
   *   'potentiel_majeur' → le chiffre dépasse le plafond de crédibilité : on
   *                        affiche le ratio et « potentiel majeur — à chiffrer
   *                        ensemble », sans montant. Un chiffre qu'on ne peut
   *                        pas tenir en rendez-vous détruit la crédibilité de
   *                        tout le reste de l'audit ;
   *   'aucun'            → rien à chiffrer (étape saine, ou données absentes).
   */
  impactPresentation: 'montant' | 'potentiel_majeur' | 'aucun';
  questionId: string;
}

export interface PipelineSynthesis {
  stages: PipelineStage[];
  /** Les deux étapes les plus en retard sur leur repère. Vide si tout va bien. */
  weakestLinks: PipelineStage[];
  exclusivity: {
    value: number | null;
    benchmark: number;
    status: StageStatus;
  };
  averageRevenuePerSale: number | null;
  missingQuestionIds: string[];
  isComplete: boolean;
}

// Les repères vivent dans leur propre module : le moteur ratios de l'audit
// s'en sert aussi.
export { DEFAULT_BENCHMARKS, type BenchmarksOverride } from './benchmarks';

/**
 * Règles de présentation de l'enjeu chiffré (D-12, tranchée le 02/09/2026).
 *
 * Le calcul complet — « si cette étape atteignait son repère, tout le reste
 * inchangé » — donne des montants qui écrasent la conversation : 480 000 € sur
 * une agence qui en fait 720 000. Mathématiquement juste, commercialement
 * intenable. On met donc en avant la moitié du chemin, et on renonce au chiffre
 * dès qu'il dépasse le quart du CA déclaré.
 */
export const IMPACT_PRESENTATION = {
  /** Part du chemin vers le repère qu'on met en avant. */
  headlineShare: 0.5,
  /** Au-delà de ce % du CA N-1, plus aucun montant n'est affiché. */
  capRevenuePercent: 25,
} as const;

export type ImpactPresentationOverride = Partial<Record<keyof typeof IMPACT_PRESENTATION, number>>;

export interface PipelineInput {
  /** Réponses du diagnostic, indexées par `questionId`. */
  answers: Record<string, unknown>;
  benchmarks?: BenchmarksOverride;
  /** Sous ce retard relatif (en %), on ne parle pas de maillon faible. */
  weaknessTolerancePercent?: number;
  impactPresentation?: ImpactPresentationOverride;
}

interface StageSpec {
  key: StageKey;
  label: string;
  questionId: string;
  /** Étape précédente pour le taux de passage. null = entrée du tunnel. */
  from: StageKey | null;
  benchmarkKey: keyof typeof DEFAULT_BENCHMARKS | null;
}

const STAGES: readonly StageSpec[] = [
  {
    key: 'contacts',
    label: 'Contacts vendeurs',
    questionId: 'prospecting-contacts-per-month',
    from: null,
    benchmarkKey: null,
  },
  {
    key: 'rdv',
    label: 'RDV estimation',
    questionId: 'seller-meetings-per-month',
    from: 'contacts',
    benchmarkKey: 'contactsToRdvPercent',
  },
  {
    key: 'mandats',
    label: 'Mandats rentrés',
    questionId: 'mandates-per-month',
    from: 'rdv',
    benchmarkKey: 'rdvToMandatPercent',
  },
  {
    key: 'visites',
    label: 'Visites',
    questionId: 'visits-per-month',
    from: null,
    benchmarkKey: null,
  },
  {
    key: 'offres',
    label: 'Offres',
    questionId: 'offers-per-month',
    from: 'visites',
    benchmarkKey: 'visitesToOffresPercent',
  },
  {
    key: 'compromis',
    label: 'Compromis',
    questionId: 'compromis-per-month',
    from: 'offres',
    benchmarkKey: 'offresToCompromisPercent',
  },
  {
    key: 'actes',
    label: 'Actes',
    questionId: 'actes-per-month',
    from: 'compromis',
    benchmarkKey: 'compromisToActePercent',
  },
];

/**
 * Lit un nombre dans une réponse. Tolère « 20 % », « 20,5 », les chaînes — un
 * commercial saisit vite en rendez-vous, et un espace de trop ne doit pas
 * transformer un chiffre en donnée manquante.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computePipeline(input: PipelineInput): PipelineSynthesis {
  const benchmarks = { ...DEFAULT_BENCHMARKS, ...(input.benchmarks ?? {}) };
  const presentation = { ...IMPACT_PRESENTATION, ...(input.impactPresentation ?? {}) };
  const tolerance = input.weaknessTolerancePercent ?? 0;

  const values = new Map<StageKey, number | null>();
  for (const spec of STAGES) values.set(spec.key, num(input.answers[spec.questionId]));

  const sales = num(input.answers['identity-sales-n1']);
  const revenue = num(input.answers['identity-revenue-n1']);
  const averageRevenuePerSale =
    sales !== null && revenue !== null && sales > 0 ? Math.round(revenue / sales) : null;

  // Plafond de crédibilité : au-delà, on n'avance plus de montant (D-12).
  const headlineCap =
    revenue !== null && revenue > 0 ? (revenue * presentation.capRevenuePercent) / 100 : null;

  const actesPerMonth = values.get('actes') ?? null;

  const stages: PipelineStage[] = STAGES.map((spec) => {
    const value = values.get(spec.key) ?? null;
    const previous = spec.from ? (values.get(spec.from) ?? null) : null;

    // Un dénominateur nul n'est pas un taux de 0 % : c'est un taux indéfini.
    const conversionPercent =
      value !== null && previous !== null && previous > 0 ? round1((value / previous) * 100) : null;

    const benchmark = spec.benchmarkKey ? benchmarks[spec.benchmarkKey] : null;
    const gap =
      conversionPercent !== null && benchmark !== null
        ? round1(conversionPercent - benchmark)
        : null;

    let status: StageStatus = 'inconnu';
    if (conversionPercent !== null && benchmark !== null) {
      status = conversionPercent >= benchmark * (1 - tolerance / 100) ? 'conforme' : 'faible';
    } else if (value !== null && benchmark === null) {
      status = 'conforme'; // étape d'entrée : rien à comparer, mais la donnée est là
    }

    // Enjeu : ce que rapporterait, sur un an, le passage de cette étape à son
    // repère — en supposant la suite du tunnel inchangée. C'est une projection
    // assumée, pas une promesse : elle n'apparaît que si on connaît le CA moyen.
    let annualImpactEuros: number | null = null;
    if (
      status === 'faible' &&
      averageRevenuePerSale !== null &&
      benchmark !== null &&
      conversionPercent !== null &&
      previous !== null &&
      actesPerMonth !== null &&
      value !== null &&
      value > 0
    ) {
      const gainAtStage = previous * ((benchmark - conversionPercent) / 100);
      const downstreamYield = actesPerMonth / value; // actes obtenus par unité de cette étape
      const extraSalesPerYear = gainAtStage * downstreamYield * 12;
      annualImpactEuros = Math.max(0, Math.round(extraSalesPerYear * averageRevenuePerSale));
    }

    // D-12 : on met en avant la moitié du chemin, et seulement si elle reste
    // sous le plafond. Sans CA N-1 connu, aucun plafond n'est calculable — donc
    // aucun montant n'est mis en avant : on ne peut pas juger de sa crédibilité.
    let headlineImpactEuros: number | null = null;
    let impactPresentation: PipelineStage['impactPresentation'] = 'aucun';
    if (annualImpactEuros !== null && annualImpactEuros > 0) {
      const headline = Math.round(annualImpactEuros * presentation.headlineShare);
      if (headlineCap !== null && headline <= headlineCap) {
        headlineImpactEuros = headline;
        impactPresentation = 'montant';
      } else {
        impactPresentation = 'potentiel_majeur';
      }
    }

    return {
      key: spec.key,
      label: spec.label,
      value,
      conversionPercent,
      benchmark,
      status,
      gap,
      annualImpactEuros,
      headlineImpactEuros,
      impactPresentation,
      questionId: spec.questionId,
    };
  });

  // Les maillons faibles se classent par retard RELATIF : être 10 points sous
  // un repère de 85 % n'est pas la même gravité qu'être 10 points sous 20 %.
  const weakestLinks = stages
    .filter((s) => s.status === 'faible' && s.benchmark !== null && s.gap !== null)
    .sort((a, b) => a.gap! / a.benchmark! - b.gap! / b.benchmark!)
    .slice(0, 2);

  const exclusivityValue = num(input.answers['mandates-exclusivity-percent']);
  const exclusivity = {
    value: exclusivityValue,
    benchmark: benchmarks.exclusivityPercent,
    status: (exclusivityValue === null
      ? 'inconnu'
      : exclusivityValue >= benchmarks.exclusivityPercent
        ? 'conforme'
        : 'faible') as StageStatus,
  };

  const missingQuestionIds = STAGES.filter((s) => values.get(s.key) === null).map(
    (s) => s.questionId,
  );

  return {
    stages,
    weakestLinks,
    exclusivity,
    averageRevenuePerSale,
    missingQuestionIds,
    isComplete: missingQuestionIds.length === 0,
  };
}
