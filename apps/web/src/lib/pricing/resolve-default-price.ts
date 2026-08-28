/**
 * Prix par défaut d'un inscrit — **source unique** de la règle.
 *
 * E-2 (audit 2026-08-28) : « pas de prix fourni → prix de session » était copiée
 * dans `sessions.ts` (addParticipant), `enroll-from-request.ts` (validation d'une
 * demande publique) et `sessions-create.ts` (création de session). Trois copies
 * d'une règle tarifaire divergent toujours — c'est la maladie que le correctif
 * était censé soigner. Les trois chemins appellent désormais cette fonction.
 *
 * Cascade, dans cet ordre :
 *   1. `TrainingSession.pricePerLearner` — le prix négocié, figé à la création
 *   2. forfait groupe du produit, si le payeur est une personne morale
 *      → NE PRODUIT PAS de montant : un forfait se répartit, il ne se recopie pas
 *   3. `TrainingProduct.priceHT` — tarif catalogue unitaire
 *   4. rien → 0 **signalé**, jamais un 0 silencieux
 *
 * Le pas 2 est le garde-fou central. Écrire le forfait groupe sur chaque inscrit
 * multiplierait le chiffre d'affaires par l'effectif : c'est exactement l'erreur
 * commise le 20/08/2026 (×8 sur le CA d'une session). Le forfait est donc renvoyé
 * dans `reason`, à répartir explicitement par l'appelant ou par l'admin.
 *
 * MODULE PUR : ni base, ni I/O. `SessionPricing` (grille par payeur) s'insérera
 * en tête de cascade quand il existera.
 */

import { isPersonneMoralePayeur } from '@/lib/sessions/payer-rule';

/** Accepte indifféremment un `number`, un `Decimal` Prisma ou une chaîne. */
type MontantBrut = number | string | { toString(): string } | null | undefined;

export interface SessionPriceContext {
  pricePerLearner: MontantBrut;
}
export interface ProductPriceContext {
  priceHT: MontantBrut;
  groupFlatPrice: MontantBrut;
}
export interface SponsorPriceContext {
  legalForm: string | null;
}

export type PriceSource = 'session' | 'produit' | 'forfait-groupe' | 'aucun';

export interface DefaultPriceResult {
  priceHT: number;
  source: PriceSource;
  /** true quand le montant doit être arbitré à la main avant toute facturation. */
  needsReview: boolean;
  reason?: string;
}

function toNumber(v: MontantBrut): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

export function resolveDefaultParticipantPrice(
  session: SessionPriceContext | null,
  product: ProductPriceContext | null,
  sponsorOrg: SponsorPriceContext | null,
): DefaultPriceResult {
  // 1. Le prix négocié de la session fait foi — y compris 0, qui est alors un
  //    choix explicite de celui qui l'a saisi.
  const tarifSession = toNumber(session?.pricePerLearner);
  if (tarifSession !== null) {
    return { priceHT: tarifSession, source: 'session', needsReview: false };
  }

  // 2. Payeur personne morale + forfait groupe au catalogue : on ne devine pas.
  const forfait = toNumber(product?.groupFlatPrice);
  if (forfait !== null && isPersonneMoralePayeur(sponsorOrg?.legalForm)) {
    return {
      priceHT: 0,
      source: 'forfait-groupe',
      needsReview: true,
      reason:
        `Forfait groupe de ${forfait.toLocaleString('fr-FR')} € à répartir entre les inscrits ` +
        `de ce payeur — la quote-part ne peut pas être déduite d'un inscrit isolé.`,
    };
  }

  // 3. Tarif catalogue unitaire.
  const tarifProduit = toNumber(product?.priceHT);
  if (tarifProduit !== null) {
    return { priceHT: tarifProduit, source: 'produit', needsReview: false };
  }

  // 4. Rien de résolvable : 0, mais signalé.
  return {
    priceHT: 0,
    source: 'aucun',
    needsReview: true,
    reason:
      'Aucun tarif trouvé (ni sur la session, ni au catalogue du produit) — ' +
      'montant à saisir avant la convention et la facture.',
  };
}
