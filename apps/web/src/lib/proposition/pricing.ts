/**
 * Moteur de chiffrage de la proposition (spec §8.3, §9.1-6) — fonction pure.
 *
 * Aucun import prisma/next : il reçoit des lignes et des règles, il rend des
 * totaux. C'est ce qui permet de vérifier « Σ devis = Σ proposition au
 * centime » sans base de données.
 *
 * Quatre règles qui ne se renégocient pas :
 *
 *   • **Les heures conventionnées sont dérivées, jamais saisies.** Elles valent
 *     demi-journées × heures sur site × nombre de formateurs, et ce nombre-là
 *     part à l'identique sur la proposition, la convention, l'émargement,
 *     l'attestation et le dossier financeur (ligne rouge §8.1). Une seule
 *     source, donc aucune divergence possible.
 *   • **Le prix se calcule sur les heures SUR SITE**, le financement sur les
 *     heures conventionnées. Les deux assiettes diffèrent d'un facteur
 *     « nombre de formateurs » et tombent sur le même montant (4 h × 84 = 336,
 *     8 h × 42 = 336) : les confondre double ou divise par deux un devis.
 *   • **La remise ne mord que sur le reste à charge.** Jamais sur le coût
 *     pédagogique, qui est l'assiette des droits : réduire le prix déclaré
 *     réduirait la prise en charge, ce qui reviendrait à faire payer au client
 *     le geste qu'on prétend lui faire (règle de non-transfert de dette).
 *   • **Une prise en charge n'excède jamais le prix vendu.** Un financeur ne
 *     rembourse pas au-delà de la dépense.
 */

import type {
  PricingCoverage,
  PricingDiscount,
  PricingLine,
  PricingPayer,
  ProposalPricing,
} from '@qualiof/shared';

import type { FundingRuleValues } from '@/lib/financement/types';

/** Arrondi au centime — évite les 12095.999999999998 en bout de chaîne. */
function euros(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Les quatre états de couverture — port de `describeCoverageState` du repo diag.
 *
 * `fully_covered_by_funding` et `offered_via_discount` ne se confondent JAMAIS :
 * dire « pris en charge » d'un reste à charge qu'on a offert est une mention
 * trompeuse de financement, exactement ce que le référentiel Qualiopi sanctionne.
 */
export type CoverageState =
  | 'fully_covered_by_funding'
  | 'offered_via_discount'
  | 'partially_covered'
  | 'not_covered';

export interface PricingAlert {
  code: string;
  label: string;
  severity: 'info' | 'warning' | 'blocking';
}

export interface PricingLineResult extends PricingLine {
  /** Heures conventionnées PAR participant — dérivées, jamais saisies. */
  conventionedHours: number;
  /** Heures sur site par participant — l'assiette du prix. */
  onsiteHours: number;
  totalHt: number;
}

export interface PricingPayerResult {
  payer: PricingPayer;
  lines: PricingLineResult[];
  halfDays: number;
  conventionedHoursPerParticipant: number;
  totalHt: number;
  coverages: PricingCoverage[];
  coverage: number;
  /** Reste à charge de ce payeur, AVANT tout geste commercial. */
  remainder: number;
}

/** Un bandeau d'affichage de la maquette (§9.1-6), et les payeurs qu'il coiffe. */
export interface PricingGroupResult {
  label: string;
  note: string;
  payerIds: string[];
}

export interface PricingSynthesis {
  payers: PricingPayerResult[];
  groups: PricingGroupResult[];
  /** Le coût pédagogique total — l'assiette des droits, que la remise ne touche pas. */
  totalHt: number;
  totalCoverage: number;
  remainderBeforeDiscount: number;
  discount: PricingDiscount | null;
  /** Part de la remise dans le reste à charge, en %. null si rien à remiser. */
  discountPercent: number | null;
  /** Au-delà du seuil : envoi bloqué tant qu'un MANAGER/ADMIN n'a pas validé. */
  discountRequiresApproval: boolean;
  finalRemainder: number;
  coverageState: CoverageState;
  /** Heures conventionnées du parcours le plus long — la valeur de référence. */
  conventionedHoursMax: number;
  halfDaysMax: number;
  alerts: PricingAlert[];
}

export interface PricingComputeInput {
  pricing: ProposalPricing;
  rules: FundingRuleValues;
}

/** Heures conventionnées d'une demi-journée : heures sur site × nb de formateurs. */
export function conventionedHoursPerHalfDay(rules: FundingRuleValues): number {
  return rules.HALF_DAY_ONSITE_HOURS * rules.TRAINER_COUNT_DEFAULT;
}

/**
 * Ce que le document doit DIRE de la couverture.
 *
 * L'ordre des tests porte la règle : on ne peut parler de « pris en charge à
 * 100 % » que si les financeurs ont tout couvert AVANT le moindre geste
 * commercial.
 */
export function describeCoverageState(args: {
  totalHt: number;
  coverage: number;
  discount: number;
}): CoverageState {
  if (args.totalHt <= 0) return 'not_covered';
  const remainderBefore = euros(args.totalHt - args.coverage);
  if (remainderBefore <= 0) return 'fully_covered_by_funding';
  if (args.discount >= remainderBefore) return 'offered_via_discount';
  if (args.coverage > 0) return 'partially_covered';
  return 'not_covered';
}

/** Le libellé opposable — « OFFERT » n'est pas « pris en charge ». */
export const COVERAGE_STATE_LABEL: Record<CoverageState, string> = {
  fully_covered_by_funding: 'Intégralement pris en charge par vos financeurs',
  offered_via_discount: 'Reste à charge offert',
  partially_covered: 'Partiellement pris en charge',
  not_covered: 'Aucune prise en charge mobilisée',
};

export function computePricing(input: PricingComputeInput): PricingSynthesis {
  const { rules } = input;
  const alerts: PricingAlert[] = [];
  const push = (a: PricingAlert) => {
    if (!alerts.some((x) => x.code === a.code)) alerts.push(a);
  };

  const hoursPerHalfDay = conventionedHoursPerHalfDay(rules);

  const payers: PricingPayerResult[] = input.pricing.payers.map((payer) => {
    const lines: PricingLineResult[] = payer.lines.map((line) => ({
      ...line,
      conventionedHours: euros(line.halfDays * hoursPerHalfDay),
      onsiteHours: euros(line.halfDays * rules.HALF_DAY_ONSITE_HOURS),
      totalHt: euros(payer.participantCount * line.halfDays * line.unitPriceHt),
    }));

    const totalHt = euros(lines.reduce((s, l) => s + l.totalHt, 0));
    const halfDays = euros(lines.reduce((s, l) => s + l.halfDays, 0));
    const rawCoverage = euros(payer.coverages.reduce((s, c) => s + c.amount, 0));

    // Un financeur ne rembourse pas au-delà de la dépense : on plafonne, et on
    // le dit. Le cas arrive quand le commercial baisse le prix après coup sans
    // recalculer le financement.
    const coverage = Math.min(rawCoverage, totalHt);
    if (coverage < rawCoverage) {
      push({
        code: 'prise_en_charge_superieure_au_prix',
        label: `La prise en charge annoncée dépassait le montant vendu pour « ${payer.name} » : elle a été ramenée au prix.`,
        severity: 'warning',
      });
    }

    return {
      payer,
      lines,
      halfDays,
      conventionedHoursPerParticipant: euros(halfDays * hoursPerHalfDay),
      totalHt,
      coverages: payer.coverages,
      coverage: euros(coverage),
      remainder: euros(totalHt - coverage),
    };
  });

  // Les bandeaux d'affichage, dans l'ordre où ils apparaissent : la maquette
  // regroupe les indés sous un seul bandeau, mais ils restent des payeurs
  // distincts (un devis chacun).
  const groups: PricingGroupResult[] = [];
  for (const p of payers) {
    const existing = groups.find((g) => g.label === p.payer.groupLabel);
    if (existing) existing.payerIds.push(p.payer.id);
    else
      groups.push({
        label: p.payer.groupLabel,
        note: p.payer.groupNote,
        payerIds: [p.payer.id],
      });
  }

  const totalHt = euros(payers.reduce((s, p) => s + p.totalHt, 0));
  const totalCoverage = euros(payers.reduce((s, p) => s + p.coverage, 0));
  const remainderBeforeDiscount = euros(totalHt - totalCoverage);

  // ── La remise ─────────────────────────────────────────────────────────────
  const asked = input.pricing.discount;
  let discount: PricingDiscount | null = null;

  if (asked && asked.amount > 0) {
    if (remainderBeforeDiscount <= 0) {
      // Remiser un reste à charge nul reviendrait à rogner le coût pédagogique,
      // donc l'assiette des droits. On refuse, on l'écrit, on n'applique rien.
      push({
        code: 'remise_sans_reste_a_charge',
        label:
          "Il n’y a pas de reste à charge à remiser : une remise porterait sur le coût pédagogique, donc sur l’assiette des droits. Elle n’est pas appliquée.",
        severity: 'blocking',
      });
    } else {
      const capped = Math.min(asked.amount, remainderBeforeDiscount);
      if (capped < asked.amount) {
        push({
          code: 'remise_plafonnee_au_reste_a_charge',
          label:
            'La remise demandée dépassait le reste à charge : elle a été ramenée à ce montant. Une remise ne descend jamais en dessous de zéro.',
          severity: 'warning',
        });
      }
      discount = { ...asked, amount: euros(capped) };
    }
  }

  const discountAmount = discount?.amount ?? 0;
  const discountPercent =
    remainderBeforeDiscount > 0
      ? Math.round((discountAmount / remainderBeforeDiscount) * 1000) / 10
      : null;
  const discountRequiresApproval =
    discountPercent !== null && discountPercent > rules.DISCOUNT_WARNING_PERCENT;

  if (discountRequiresApproval) {
    push({
      code: 'remise_validation_requise',
      label: `Remise de ${discountPercent} % du reste à charge : au-delà de ${rules.DISCOUNT_WARNING_PERCENT} %, la validation d’un responsable est requise avant tout envoi.`,
      severity: 'blocking',
    });
  }

  const finalRemainder = euros(remainderBeforeDiscount - discountAmount);
  const coverageState = describeCoverageState({
    totalHt,
    coverage: totalCoverage,
    discount: discountAmount,
  });

  if (coverageState === 'offered_via_discount') {
    push({
      code: 'reste_a_charge_offert',
      label:
        "Le reste à charge est OFFERT : c’est un geste commercial, pas une prise en charge. Le document doit dire l’un et jamais l’autre.",
      severity: 'info',
    });
  }

  return {
    payers,
    groups,
    totalHt,
    totalCoverage,
    remainderBeforeDiscount,
    discount,
    discountPercent,
    discountRequiresApproval,
    finalRemainder,
    coverageState,
    conventionedHoursMax: payers.reduce(
      (m, p) => Math.max(m, p.conventionedHoursPerParticipant),
      0,
    ),
    halfDaysMax: payers.reduce((m, p) => Math.max(m, p.halfDays), 0),
    alerts,
  };
}

/**
 * L'écart créé par l'arrondi supérieur du dimensionnement (D-11).
 *
 * Le moteur budget arrondit à la demi-journée SUPÉRIEURE pour ne perdre aucun
 * droit ; le dépassement — quelques dizaines d'euros — atterrit en reste à
 * charge. L'éditeur propose de l'offrir en un clic, motif pré-rempli. Ce
 * helper dit s'il est raisonnable de le proposer : au-delà d'une demi-journée
 * facturée, ce n'est plus un arrondi, c'est une négociation.
 */
export function isRoundingGap(remainder: number, rules: FundingRuleValues): boolean {
  const halfDayPrice = rules.HALF_DAY_ONSITE_HOURS * rules.PRICE_PER_HOUR_PER_PARTICIPANT;
  return remainder > 0 && remainder < halfDayPrice;
}

export const ROUNDING_DISCOUNT_REASON = 'Arrondi de parcours';
