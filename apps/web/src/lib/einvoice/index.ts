/**
 * Résolution de la plateforme — le SEUL endroit qui choisit un adaptateur.
 *
 * Fail-closed, comme `lib/mailer.ts` : tant que les identifiants ne sont pas
 * là, ou que `EINVOICE_DRY_RUN` est posé, on rend le mock. Un raccordement à
 * une plateforme d'État ne s'active pas par oubli de configuration.
 */

import { sharedEnv } from '@qualiof/shared/env';
import type { EInvoicePlatform } from './port';
import { MockEInvoicePlatform } from './adapters/mock';

export type { EInvoicePlatform } from './port';

export function isEInvoiceDryRun(): boolean {
  if (sharedEnv.EINVOICE_DRY_RUN === 'true' || sharedEnv.EINVOICE_DRY_RUN === '1') return true;
  if (sharedEnv.EINVOICE_PROVIDER === 'MOCK') return true;
  // Provider réel annoncé mais identifiants absents : on ne tente rien.
  return !sharedEnv.SUPERPDP_CLIENT_ID || !sharedEnv.SUPERPDP_CLIENT_SECRET;
}

export function resolveEInvoicePlatform(): EInvoicePlatform {
  // Lot 3 branchera `SuperPdpPlatform` ici. Tant que l'adaptateur réel n'existe
  // pas, il n'y a qu'un chemin possible — et c'est celui qui n'émet rien.
  return new MockEInvoicePlatform();
}
