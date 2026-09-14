import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';

import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues } from '@/lib/financement/types';

import { buildFundingSection } from '../builder';
import { renderFundingTable } from '../templates/proposition-template';

/**
 * Une valeur ABSENTE ne s'imprime jamais comme une valeur POSITIVE.
 *
 * Relevé sur PROP-0001 v1 le 14/09/2026, page 2 du PDF :
 *
 *   « Déduction — Aucun financement engagé déclaré sur l'exercice en cours — 0 € »
 *
 * On ne l'a JAMAIS demandé. `consumedThisYear` n'est alimenté nulle part dans
 * la chaîne, et `?? 0` transformait « je ne sais pas » en « il n'y a rien ».
 * Le document n'omettait pas l'information : il AFFIRMAIT son absence, à un
 * financeur, sur une pièce contractuelle.
 *
 * C'est la forme la plus dangereuse du défaut — rien ne proteste, le tableau
 * est cohérent, et il est faux.
 *
 * Les trois états doivent se distinguer :
 *   • non renseigné  → on le DIT, et aucun montant n'est affirmé
 *   • déclaré à zéro → « aucun financement engagé » est alors légitime
 *   • déclaré > 0    → la déduction s'affiche
 */

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

function synthese() {
  return computeFunding({
    rules: RULES,
    participants: [
      {
        id: 'p1',
        statut: 'INDEPENDANT' as const,
        caN1: 100000,
        cfpEligibleBudget: null,
        opcoEligible: null,
        consumedThisYear: null,
        trainings24mFunded: null,
        includedInProposal: true,
      },
    ],
    employeeCount: 0,
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt: '2026-09-04T08:00:00.000Z',
  });
}

function section(consumedThisYear?: number) {
  return buildFundingSection({
    funding: synthese(),
    rules: RULES,
    agencyName: 'Agence témoin',
    declaredEmployeeCount: 0,
    consumedThisYear,
  });
}

const AFFIRMATION = 'Aucun financement engagé déclaré';

describe('Ligne « Déduction » — une valeur absente ne s’imprime pas comme une valeur positive', () => {
  it('n’AFFIRME pas l’absence de financement quand rien n’a été renseigné', () => {
    const deduction = section(undefined).rows.find((r) => r.isDeduction);
    expect(deduction, 'la ligne de déduction doit exister').toBeTruthy();
    expect(
      deduction!.beneficiaries,
      'le document affirme au financeur une absence qu’on n’a jamais constatée',
    ).not.toContain(AFFIRMATION);
  });

  it('DIT que l’information n’a pas été renseignée', () => {
    const deduction = section(undefined).rows.find((r) => r.isDeduction);
    expect(deduction!.beneficiaries.toLowerCase()).toContain('non renseigné');
  });

  it('n’affiche AUCUN montant quand la valeur est inconnue — « − 0 € » est une affirmation', () => {
    const deduction = section(undefined).rows.find((r) => r.isDeduction);
    expect(
      deduction!.amountLabel,
      'un montant inconnu doit se rendre en toutes lettres, pas en « − 0 € »',
    ).toBe('—');
  });

  it('garde l’affirmation quand elle a VRAIMENT été déclarée à zéro', () => {
    const deduction = section(0).rows.find((r) => r.isDeduction);
    expect(deduction!.beneficiaries).toContain(AFFIRMATION);
    expect(deduction!.amountLabel ?? '').not.toBe('—');
  });

  it('déduit normalement une consommation déclarée', () => {
    const s = section(2000);
    const deduction = s.rows.find((r) => r.isDeduction);
    expect(deduction!.amount).toBe(2000);
    expect(deduction!.beneficiaries).toContain('déjà engagés');
    expect(deduction!.amountLabel ?? '').not.toBe('—');
  });

  it('dit que le total est un MAXIMUM tant que la consommation est inconnue', () => {
    const inconnue = section(undefined);
    const declaree = section(0);
    expect(
      inconnue.clientAlerts.join(' ').toLowerCase(),
      'un total calculé sur une consommation inconnue est un plafond, pas un montant',
    ).toContain('maximum');
    expect(declaree.clientAlerts.join(' ').toLowerCase()).not.toContain('maximum');
  });

  /**
   * Et le contrôle qui compte vraiment : ce que le FINANCEUR lit.
   *
   * Les tests ci-dessus portent sur l'objet. Un gabarit qui ignorerait
   * `amountLabel` les laisserait tous verts en imprimant « − 0 € » — c'est
   * exactement ce qui s'est produit au premier jet du correctif.
   */
  it('n’imprime pas « − 0 € » dans le HTML quand la valeur est inconnue', () => {
    const html = renderFundingTable({ funding: section(undefined) });
    expect(html).toContain('non renseigné');
    expect(html, 'le gabarit ignore amountLabel et affirme toujours zéro').not.toContain('&#8722; 0');
  });

  it('imprime bien le montant déduit quand il est déclaré', () => {
    expect(renderFundingTable({ funding: section(2000) })).toContain('&#8722;');
  });
});
