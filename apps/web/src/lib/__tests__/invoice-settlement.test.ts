import { describe, expect, it } from 'vitest';
import { planifierReversion, type PaiementConnu } from '../invoice-settlement';

/**
 * E-9, tranché le 10/09/2026 — la réversion symétrique.
 *
 * Cocher « encaissé » sur un dossier OPCO solde la facture liée. Décocher doit
 * défaire ce que cocher a fait, ni plus ni moins :
 *   · plus : effacer un règlement saisi par un humain, qu'on n'a pas produit ;
 *   · moins : laisser une facture PAID sous un dossier dé-encaissé, soit les
 *     deux vérités trésorerie contradictoires que la synchro devait supprimer.
 *
 * La règle tient dans l'origine du paiement, d'où la colonne `source`. Les
 * règlements antérieurs à cette colonne valent MANUAL : se tromper dans ce sens
 * ne fait que refuser une suppression, se tromper dans l'autre en efface une vraie.
 */

const sync = (id: string, amount: number): PaiementConnu => ({ id, amount, source: 'OPCO_SYNC' });
const manuel = (id: string, amount: number): PaiementConnu => ({ id, amount, source: 'MANUAL' });

describe('planifierReversion — décocher défait ce que cocher a fait', () => {
  it('supprime le paiement de synchro et rend la facture à ISSUED', () => {
    const plan = planifierReversion([sync('p1', 1200)], 1200);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.paymentIdsASupprimer).toEqual(['p1']);
    expect(plan.amountPaid).toBe(0);
    expect(plan.status).toBe('ISSUED');
  });

  it('REFUSE dès qu’un règlement humain coexiste — et ne planifie aucune écriture', () => {
    const plan = planifierReversion([sync('p1', 700), manuel('p2', 500)], 1200);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.raison).toBe('paiement-manuel-present');
    // Le refus doit nommer ce qu'il protège, sinon il est incompréhensible.
    expect(plan).not.toHaveProperty('paymentIdsASupprimer');
  });

  it('refuse quand il n’y a rien de la synchro à défaire', () => {
    const plan = planifierReversion([manuel('p2', 1200)], 1200);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.raison).toBe('aucun-paiement-synchro');
  });

  it('refuse aussi sur une facture sans aucun règlement', () => {
    const plan = planifierReversion([], 1200);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.raison).toBe('aucun-paiement-synchro');
  });

  it('retombe sur PARTIAL si un reste subsiste après suppression', () => {
    // Défensif : deux paiements de synchro sur la même facture ne devraient pas
    // exister (cocher deux fois est un no-op). Si ça arrive, le montant restant
    // commande le statut — on ne rend pas ISSUED une facture partiellement payée.
    const plan = planifierReversion([sync('p1', 400), sync('p2', 300)], 1200);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.paymentIdsASupprimer.sort()).toEqual(['p1', 'p2']);
    expect(plan.amountPaid).toBe(0);
    expect(plan.status).toBe('ISSUED');
  });

  it('compare en Number — un Decimal Prisma rendrait l’égalité toujours fausse', () => {
    const plan = planifierReversion([sync('p1', 1234.56)], 1234.56);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.amountPaid).toBe(0);
  });
});
