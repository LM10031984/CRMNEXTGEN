/**
 * Dérivation des devis depuis la proposition (spec §9.1, « Génération du
 * devis ») — fonction pure.
 *
 * UN devis par PAYEUR, jamais par bandeau d'affichage : la subrogation AGEFICE
 * se monte par personne. Le bandeau « Agents commerciaux indépendants » de la
 * maquette regroupe quatre payeurs, donc quatre devis.
 *
 * **Ce que le devis porte, et ce qu'il ne porte pas** (décision D-15, à
 * confirmer par Laurent) : le devis reproduit le **coût pédagogique**, celui
 * qui sert d'assiette aux droits — pas le reste à charge après geste
 * commercial. Une remise portée en ligne négative sur le devis diminuerait le
 * coût déclaré, donc la prise en charge : le client paierait lui-même le
 * cadeau qu'on prétend lui faire. La prise en charge attendue et le geste
 * commercial sont donc écrits en clair dans les notes du devis, pas retranchés
 * de ses lignes.
 *
 * C'est ce qui rend le test de contrat exact : **Σ lignes de devis = coût
 * pédagogique de la proposition, au centime**.
 */

import { plural } from './plural';
import type { PricingSynthesis } from './pricing';
import { COVERAGE_STATE_LABEL } from './pricing';

function euros(n: number): number {
  return Math.round(n * 100) / 100;
}

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

/** Mention d'exonération — art. 261-4-4° a du CGI, activité de formation. */
export const VAT_EXEMPTION_NOTE =
  'TVA non applicable — article 261-4-4° a du Code général des impôts (activité de formation professionnelle exonérée).';

export interface QuoteDraftLine {
  order: number;
  description: string;
  quantity: number;
  unitPriceHt: number;
  vatRate: number;
  lineTotalHt: number;
}

export interface QuoteDraft {
  payerId: string;
  recipientName: string;
  recipientContact: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  recipientSiret: string | null;
  title: string;
  notes: string;
  lines: QuoteDraftLine[];
  amountHt: number;
}

/**
 * Les devis d'une proposition, prêts à être créés.
 *
 * `quantity` = participants × demi-journées, `unitPriceHt` = le prix d'une
 * demi-journée pour un participant. Le produit des deux est exactement le
 * total de la ligne côté proposition — c'est voulu : deux façons d'écrire le
 * même calcul, jamais deux calculs.
 */
export function buildQuoteDrafts(args: {
  synthesis: PricingSynthesis;
  proposalReference: string;
  /** Durée sur site d'une demi-journée — paramètre `HALF_DAY_ONSITE_HOURS`. */
  onsiteHoursPerHalfDay: number;
}): QuoteDraft[] {
  const { synthesis } = args;

  return synthesis.payers.map((p) => {
    const lines: QuoteDraftLine[] = p.lines.map((line, index) => {
      const quantity = euros(p.payer.participantCount * line.halfDays);
      return {
        order: index,
        description:
          `${line.description} — ${plural(line.halfDays, 'demi-journée')} de ${args.onsiteHoursPerHalfDay} h sur site, ` +
          `${plural(p.payer.participantCount, 'participant')}, ` +
          `${line.conventionedHours} h conventionnées par participant`,
        quantity,
        unitPriceHt: line.unitPriceHt,
        vatRate: 0,
        lineTotalHt: euros(quantity * line.unitPriceHt),
      };
    });

    const amountHt = euros(lines.reduce((s, l) => s + l.lineTotalHt, 0));

    return {
      payerId: p.payer.id,
      recipientName: p.payer.name,
      recipientContact: null,
      recipientAddress: p.payer.address,
      recipientEmail: p.payer.email,
      recipientSiret: p.payer.siret,
      title: `Formation — ${args.proposalReference}`,
      notes: buildQuoteNotes({ synthesis, payerId: p.payer.id, proposalReference: args.proposalReference }),
      lines,
      amountHt,
    };
  });
}

/**
 * Les notes du devis : ce que le payeur doit lire pour comprendre ce qu'il
 * signe, sans que le montant vendu ne bouge d'un centime.
 *
 * La remise apparaît ici, et nulle part dans les lignes. « OFFERT » et « pris
 * en charge » restent deux phrases distinctes.
 */
export function buildQuoteNotes(args: {
  synthesis: PricingSynthesis;
  payerId: string;
  proposalReference: string;
}): string {
  const { synthesis } = args;
  const payer = synthesis.payers.find((p) => p.payer.id === args.payerId);
  if (!payer) return VAT_EXEMPTION_NOTE;

  const parts: string[] = [VAT_EXEMPTION_NOTE];

  for (const c of payer.coverages) {
    parts.push(`Prise en charge estimée ${c.funder === 'OPCO_EP' ? 'OPCO EP' : 'AGEFICE'} : ${eur.format(c.amount)} — ${c.label}.`);
  }

  if (payer.coverage > 0) {
    parts.push(
      `Reste à charge de ce payeur avant geste commercial : ${eur.format(payer.remainder)}.`,
    );
  }

  if (synthesis.discount) {
    parts.push(
      `Geste commercial consenti sur le reste à charge de la proposition ${args.proposalReference} : ` +
        `${eur.format(synthesis.discount.amount)} — motif « ${synthesis.discount.reason} ». ` +
        `Il ne modifie ni le coût pédagogique ci-dessus ni les droits mobilisés.`,
    );
  }

  parts.push(
    `${COVERAGE_STATE_LABEL[synthesis.coverageState]} (proposition ${args.proposalReference}).`,
  );
  parts.push(
    'Montants estimatifs, sous réserve des droits réellement disponibles et de l’acceptation des dossiers par les financeurs. Aucune facturation avant accord de prise en charge.',
  );

  return parts.join('\n');
}

/**
 * Le test de contrat de la spec, exprimé en code appelable : la somme des
 * devis rend-elle exactement le coût pédagogique de la proposition ?
 */
export function quotesMatchProposal(
  drafts: readonly QuoteDraft[],
  synthesis: PricingSynthesis,
): boolean {
  const sum = euros(drafts.reduce((s, d) => s + d.amountHt, 0));
  return sum === synthesis.totalHt;
}
