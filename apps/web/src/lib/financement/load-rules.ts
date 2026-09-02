/**
 * Résolution des règles de financement depuis la base.
 *
 * Frontière volontaire : c'est le SEUL endroit qui touche prisma dans
 * `lib/financement`. Le moteur, lui, reste pur — il reçoit des nombres.
 *
 * Une seule ligne active par clé (`validTo IS NULL`), garantie par l'index
 * unique partiel de la migration. Si une clé manque en base, on retombe sur la
 * valeur d'usine EN LE DISANT : un plafond silencieusement à zéro produirait une
 * proposition à 100 % de reste à charge sans que personne comprenne pourquoi.
 */

import { prisma } from '@qualiof/db';
import { FUNDING_RULE_SEEDS, type FundingRuleKey } from '@qualiof/shared/diagnostic';

import type { FundingRuleValues } from './types';

export interface LoadedFundingRules {
  values: FundingRuleValues;
  /** Clés absentes de la base, servies depuis les valeurs d'usine. */
  missingKeys: FundingRuleKey[];
}

export async function loadFundingRules(tenantId: string): Promise<LoadedFundingRules> {
  const rows = await prisma.fundingRule.findMany({
    where: { tenantId, validTo: null },
    select: { key: true, valueNumeric: true },
  });

  const fromDb = new Map(
    rows
      .filter((r) => r.valueNumeric !== null)
      .map((r) => [r.key, Number(r.valueNumeric)] as const),
  );

  const values = {} as FundingRuleValues;
  const missingKeys: FundingRuleKey[] = [];

  for (const seed of FUNDING_RULE_SEEDS) {
    const dbValue = fromDb.get(seed.key);
    if (dbValue === undefined) {
      missingKeys.push(seed.key);
      values[seed.key] = seed.valueNumeric;
    } else {
      values[seed.key] = dbValue;
    }
  }

  if (missingKeys.length > 0) {
    console.warn(
      `[financement] ${missingKeys.length} règle(s) absente(s) en base, valeurs d'usine utilisées : ${missingKeys.join(', ')}. Lancer \`pnpm --filter @qualiof/db db:seed\`.`,
    );
  }

  return { values, missingKeys };
}
