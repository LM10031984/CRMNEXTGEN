'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Gift, Loader2, Save, Undo2 } from 'lucide-react';
import type { ProposalPricing } from '@qualiof/shared';

import type { FundingRuleValues } from '@/lib/financement/types';
import {
  computePricing,
  isRoundingGap,
  ROUNDING_DISCOUNT_REASON,
} from '@/lib/proposition/pricing';
import { offerRoundingGap, setProposalDiscount, updateProposalPricing } from '@/server/actions/propositions';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/**
 * L'éditeur du chiffrage — « la main sur le prix » (spec §8.3).
 *
 * Les totaux affichés ici sont calculés PAR LE MÊME MOTEUR PUR que le PDF et
 * que les devis : `computePricing` n'importe ni prisma ni next, il tourne dans
 * le navigateur. Le commercial voit donc à la frappe exactement ce que le
 * document dira — pas une approximation d'écran qui divergerait du rendu.
 *
 * Ce que l'écran refuse de laisser faire :
 *   • saisir des heures conventionnées — elles se dérivent des demi-journées ;
 *   • remiser autre chose que le reste à charge ;
 *   • franchir le seuil de remise sans que la validation soit demandée.
 */
export function ProposalPricingForm({
  proposalId,
  initial,
  rules,
  readOnly,
}: {
  proposalId: string;
  initial: ProposalPricing;
  rules: FundingRuleValues;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pricing, setPricing] = useState<ProposalPricing>(initial);
  const [discountAmount, setDiscountAmount] = useState(String(initial.discount?.amount ?? ''));
  const [discountReason, setDiscountReason] = useState(initial.discount?.reason ?? '');

  const synthesis = useMemo(() => computePricing({ pricing, rules }), [pricing, rules]);
  const hoursPerHalfDay = rules.HALF_DAY_ONSITE_HOURS * rules.TRAINER_COUNT_DEFAULT;

  const save = () => {
    start(async () => {
      const r = await updateProposalPricing({ proposalId, pricing });
      if (r.ok) {
        toast.success('Chiffrage enregistré — la relecture est à refaire');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  const applyDiscount = () => {
    const amount = Number(discountAmount.replace(',', '.'));
    start(async () => {
      const r = await setProposalDiscount({
        proposalId,
        discount: Number.isFinite(amount) && amount > 0
          ? { amount, reason: discountReason, kind: 'COMMERCIALE' }
          : null,
      });
      if (r.ok) {
        toast.success(amount > 0 ? 'Remise enregistrée' : 'Remise retirée');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  const roundingGap =
    !pricing.discount && isRoundingGap(synthesis.remainderBeforeDiscount, rules)
      ? synthesis.remainderBeforeDiscount
      : null;

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Le chiffrage, payeur par payeur</h2>
        {!readOnly && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        )}
      </header>

      <div className="space-y-3">
        {synthesis.payers.map((p, payerIndex) => (
          <div key={p.payer.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.payer.name}</p>
                <p className="text-[11px] text-muted-foreground">{p.payer.groupLabel}</p>
              </div>
              <p className="text-sm tabular-nums">
                {eur.format(p.totalHt)}
                {p.coverage > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    dont {eur.format(p.coverage)} pris en charge
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Participants</span>
                <input
                  type="number"
                  min={1}
                  className={`${INPUT} w-20`}
                  value={p.payer.participantCount}
                  disabled={readOnly}
                  onChange={(e) =>
                    updatePayer(payerIndex, { participantCount: Math.max(1, Number(e.target.value)) })
                  }
                />
              </label>
            </div>

            {p.lines.map((line, lineIndex) => (
              <div key={line.id} className="flex flex-wrap items-center gap-2">
                <input
                  className={`${INPUT} min-w-0 flex-1`}
                  value={line.description}
                  disabled={readOnly}
                  onChange={(e) => updateLine(payerIndex, lineIndex, { description: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Demi-j.</span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    className={`${INPUT} w-20`}
                    value={line.halfDays}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateLine(payerIndex, lineIndex, { halfDays: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">PU HT</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={`${INPUT} w-24`}
                    value={line.unitPriceHt}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateLine(payerIndex, lineIndex, { unitPriceHt: Number(e.target.value) })
                    }
                  />
                </label>
                <span
                  className="rounded bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground"
                  title="Heures conventionnées — dérivées des demi-journées, jamais saisies. C’est le nombre qui part sur la convention, l’émargement et le dossier financeur."
                >
                  {line.conventionedHours} h conv.
                </span>
                <span className="w-24 text-right text-sm tabular-nums">
                  {eur.format(line.totalHt)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <Row label="Coût pédagogique total" value={eur.format(synthesis.totalHt)} strong />
        <Row label="Financements mobilisés" value={`− ${eur.format(synthesis.totalCoverage)}`} />
        <Row
          label="Reste à charge avant geste commercial"
          value={eur.format(synthesis.remainderBeforeDiscount)}
        />
        {synthesis.discount && (
          <Row
            label={`Remise (${synthesis.discountPercent} % — ${synthesis.discount.reason})`}
            value={`− ${eur.format(synthesis.discount.amount)}`}
          />
        )}
        <Row label="Reste à votre charge" value={eur.format(synthesis.finalRemainder)} strong />
        <p className="pt-1 text-[11px] text-muted-foreground">
          {synthesis.conventionedHoursMax} heures conventionnées par participant —{' '}
          {synthesis.halfDaysMax} demi-journées × {hoursPerHalfDay} h, une demi-journée valant{' '}
          {rules.HALF_DAY_ONSITE_HOURS} h sur site × {rules.TRAINER_COUNT_DEFAULT} formateurs. La
          même valeur part sur la convention, l’émargement, l’attestation et le dossier financeur.
        </p>
      </div>

      {synthesis.alerts.length > 0 && (
        <ul className="space-y-1 text-xs">
          {synthesis.alerts.map((a) => (
            <li
              key={a.code}
              className={
                a.severity === 'blocking'
                  ? 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40'
                  : 'text-muted-foreground'
              }
            >
              {a.label}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Geste commercial
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Une remise porte uniquement sur le reste à charge : elle ne réduit jamais le coût
            pédagogique, qui est l’assiette des droits. Au-delà de{' '}
            {rules.DISCOUNT_WARNING_PERCENT} % du reste à charge, la validation d’un responsable
            devient obligatoire avant l’envoi.
          </p>

          {roundingGap !== null && (
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  const r = await offerRoundingGap(proposalId);
                  if (r.ok) {
                    toast.success('Arrondi de parcours offert');
                    router.refresh();
                  } else {
                    toast.error(r.error);
                  }
                })
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Gift className="h-3.5 w-3.5" />
              Offrir l’arrondi de parcours ({eur.format(roundingGap)})
            </button>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Montant</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${INPUT} w-28`}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
            </label>
            <label className="min-w-[200px] flex-1 text-xs">
              <span className="mb-1 block text-muted-foreground">Motif (obligatoire)</span>
              <input
                className={INPUT}
                value={discountReason}
                placeholder={ROUNDING_DISCOUNT_REASON}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={applyDiscount}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Appliquer
            </button>
            {pricing.discount && (
              <button
                type="button"
                onClick={() => {
                  setDiscountAmount('');
                  setDiscountReason('');
                  start(async () => {
                    const r = await setProposalDiscount({ proposalId, discount: null });
                    if (r.ok) {
                      toast.success('Remise retirée');
                      router.refresh();
                    } else {
                      toast.error(r.error);
                    }
                  });
                }}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Retirer
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );

  function updatePayer(index: number, p: Partial<ProposalPricing['payers'][number]>) {
    setPricing((c) => ({
      ...c,
      payers: c.payers.map((x, i) => (i === index ? { ...x, ...p } : x)),
    }));
  }

  function updateLine(
    payerIndex: number,
    lineIndex: number,
    p: Partial<ProposalPricing['payers'][number]['lines'][number]>,
  ) {
    setPricing((c) => ({
      ...c,
      payers: c.payers.map((payer, i) =>
        i === payerIndex
          ? { ...payer, lines: payer.lines.map((l, j) => (j === lineIndex ? { ...l, ...p } : l)) }
          : payer,
      ),
    }));
  }
}

const INPUT =
  'rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
