import type { PricingSynthesis } from './pricing';

/** Préparation commerciale, pas émission comptable. Répartition au prorata des
 * restes à charge, en centimes, sans transfert de financement entre payeurs.
 * L’avoir est émis explicitement depuis la facture correspondante.
 */
export function commercialCreditPlan(synthesis: PricingSynthesis) {
  const weights = synthesis.payers.map((p) => Math.max(0, Math.round(p.remainder * 100)));
  const total = weights.reduce((n, w) => n + w, 0);
  const target = Math.min(total, Math.max(0, Math.round((synthesis.discount?.amount ?? 0) * 100)));
  const rows = synthesis.payers.map((p, i) => {
    const numerator = BigInt(target) * BigInt(weights[i]!);
    const denominator = BigInt(total || 1);
    return {
      payerId: p.payer.id,
      name: p.payer.name,
      cents: Number(numerator / denominator),
      fraction: numerator % denominator,
      capacity: weights[i]!,
    };
  });
  let remainder = target - rows.reduce((n, r) => n + r.cents, 0);
  for (const r of [...rows].sort((a, b) =>
    a.fraction === b.fraction
      ? a.payerId.localeCompare(b.payerId)
      : a.fraction > b.fraction
        ? -1
        : 1,
  )) {
    if (remainder > 0 && r.cents < r.capacity) {
      r.cents++;
      remainder--;
    }
  }
  return rows.map((r) => ({ payerId: r.payerId, name: r.name, amountHt: r.cents / 100 }));
}
