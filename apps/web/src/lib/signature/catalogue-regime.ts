/**
 * Lecture d'`OpcoCatalog` → les trois colonnes du régime de signature.
 * Spec signature 2026-09-04 §3 bis (D-10), lot C.2b-1.
 *
 * Extrait de `signature-envoi.ts` pour que la fiche session lise le régime par
 * le MÊME chemin que le moteur d'envoi. Une seconde requête écrite à la main
 * ailleurs finirait par ne plus sélectionner les mêmes colonnes — et l'écran
 * promettrait des envois que `planifierEnvoi` ne planifie pas.
 *
 * CE MODULE N'EST PAS DANS LA LISTE `MODULES` de la garde de pureté de
 * `regime.test.ts`, et c'est un CHOIX, pas un oubli : il touche Prisma. Toute la
 * règle, elle, vit dans `regime.ts` et `participants-regime.ts`, qui sont gardés.
 */

import { prisma } from '@qualiof/db';
import type { RegleSignatureFinanceur } from './regime';

/**
 * Les règles de signature des financeurs demandés, indexées par code.
 *
 * Un code absent du catalogue n'a PAS d'entrée : `regleDuFinanceur` le traduira
 * en `null`, c'est-à-dire aucune pièce en régime.
 *
 * ⚠ PAS de `tenantId` ici, et ce n'est pas un oubli de scope : `OpcoCatalog` est
 * un RÉFÉRENTIEL GLOBAL (aucune colonne `tenantId` au schéma), partagé par tous
 * les organismes. Les six financeurs y sont seedés.
 */
export async function chargerReglesSignature(
  codes: readonly string[],
): Promise<Map<string, RegleSignatureFinanceur>> {
  const regles = new Map<string, RegleSignatureFinanceur>();
  if (codes.length === 0) return regles;

  const catalogue = await prisma.opcoCatalog.findMany({
    where: { code: { in: [...codes] } },
    select: { code: true, conventionSigner: true, ageficeSigner: true, assiduiteSigner: true },
  });

  for (const ligne of catalogue) {
    regles.set(ligne.code, {
      conventionSigner: ligne.conventionSigner,
      ageficeSigner: ligne.ageficeSigner,
      assiduiteSigner: ligne.assiduiteSigner,
    });
  }
  return regles;
}
