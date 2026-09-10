/**
 * Anti-péremption de la proposition (spec §9.3, leçon E-1) — fonction pure.
 *
 * Une proposition est un document qui engage : elle porte un prix, des droits
 * et des dates. Si le diagnostic est corrigé, si un plafond de financement est
 * révisé ou si le commercial change une ligne après avoir édité le PDF, le
 * document déjà remis raconte autre chose que l'écran. L'empreinte le détecte
 * avant que le client ne le remarque en rendez-vous.
 *
 * Elle réutilise l'empreinte du diagnostic (réponses, fiches équipe, règles,
 * barème, version du référentiel) et lui ajoute ce qui appartient en propre à
 * la proposition : les lignes de prix, la remise, les programmes retenus et la
 * validité. Deux générations du même contenu donnent la même empreinte —
 * l'horodatage n'y entre pas.
 */

import { createHash } from 'node:crypto';

import {
  computeSourceFingerprint,
  type FingerprintInput,
} from '@/lib/diagnostic-r1/fingerprint';
import type { ProposalContent, ProposalPricing } from '@qualiof/shared';

export { compareSourceFingerprint, type FingerprintComparison } from '@/lib/diagnostic-r1/fingerprint';

export interface ProposalFingerprintInput {
  /** L'état du diagnostic source, tel qu'il alimente déjà le rapport d'audit. */
  diagnostic: FingerprintInput;
  pricing: ProposalPricing;
  content: ProposalContent;
  validUntil: Date | null;
}

export function computeProposalFingerprint(input: ProposalFingerprintInput): string {
  const diagnosticPart = computeSourceFingerprint(input.diagnostic);

  const lines = input.pricing.payers
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((p) => [
      `payeur:${p.id}|${p.kind}|${p.name}|${p.participantCount}`,
      ...p.lines
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((l) => `ligne:${p.id}:${l.id}|${l.description}|${l.halfDays}|${l.unitPriceHt}`),
      ...p.coverages
        .slice()
        .sort((a, b) => a.funder.localeCompare(b.funder))
        .map((c) => `pec:${p.id}|${c.funder}|${c.amount}`),
    ]);

  const discount = input.pricing.discount
    ? `remise:${input.pricing.discount.amount}|${input.pricing.discount.kind}|${input.pricing.discount.reason}`
    : 'remise:aucune';

  // Les programmes retenus font partie de ce qui est promis : changer un axe
  // change le document, même à prix constant.
  const axes = input.content.axes.map(
    (a) => `axe:${a.id}|${a.productId ?? ''}|${a.title}|${a.halfDays}`,
  );

  const payload = [
    `diagnostic:${diagnosticPart}`,
    `modalite:${input.pricing.modality}|${input.pricing.fundingType}`,
    `validite:${input.validUntil ? input.validUntil.toISOString().slice(0, 10) : 'aucune'}`,
    discount,
    ...lines,
    ...axes,
  ].join('\n');

  return createHash('sha256').update(payload).digest('hex');
}
