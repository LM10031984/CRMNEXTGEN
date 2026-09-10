/**
 * Réversion d'un encaissement synchronisé depuis un dossier OPCO — E-9,
 * tranché le 10/09/2026.
 *
 * Module NEUTRE (ni 'use server' ni 'use client') : `dossiers-opco.ts` porte
 * `'use server'` et ne peut donc exporter que des fonctions async, or cette
 * décision est synchrone et mérite d'être testée isolément — même motif que
 * `invoice-dates.ts`.
 *
 * ── Ce que la règle corrige ───────────────────────────────────────────────
 *
 * Cocher « paiement reçu » ou « remboursé » sur un dossier solde la facture
 * liée (synchro décidée le 12/08/2026, pour supprimer la double vérité
 * trésorerie : la page Factures disant « impayé » pendant que le dossier disait
 * « encaissé »).
 *
 * Décocher, jusqu'au 10/09/2026, ne reversait RIEN. Le motif invoqué — « un
 * mouvement d'argent ne s'annule pas silencieusement » — ne tenait pas :
 *   · rien ne signalait la correction à faire, donc la divergence était
 *     silencieuse de toute façon, simplement dans l'autre sens ;
 *   · la bascule n'écrivait aucun `AuditLog`, donc l'aller n'était pas tracé
 *     non plus. L'argument défendait une trace qui n'existait pas.
 *
 * Désormais : l'aller ET le retour sont tracés, et le retour défait exactement
 * ce que l'aller a fait.
 *
 * ── La frontière, et pourquoi elle est là ─────────────────────────────────
 *
 * Seul un règlement d'origine `OPCO_SYNC` est supprimable : c'est celui que la
 * machine a produit. Un règlement `MANUAL` est un fait comptable saisi par un
 * humain — on ne l'efface pas parce qu'un booléen a changé. S'il en coexiste
 * un, la réversion est REFUSÉE en bloc, sans aucune écriture : mieux vaut un
 * refus lisible qu'une réversion partielle que personne ne saura relire.
 */

export type PaiementSource = 'MANUAL' | 'OPCO_SYNC';

export interface PaiementConnu {
  id: string;
  /** En `Number` — comparer des `Decimal` Prisma rendrait l'égalité toujours fausse. */
  amount: number;
  source: PaiementSource;
}

export type RefusReversion = 'aucun-paiement-synchro' | 'paiement-manuel-present';

export type Reversion =
  | { ok: false; raison: RefusReversion; paiementsManuels: string[] }
  | {
      ok: true;
      paymentIdsASupprimer: string[];
      amountPaid: number;
      status: 'ISSUED' | 'PARTIAL' | 'PAID';
    };

/** Arrondi au centime — même discipline que le reste du dépôt. */
function centimes(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Décide si la réversion est possible et ce qu'elle doit écrire.
 *
 * Ne touche à rien : rend un PLAN. L'appelant l'exécute dans une transaction,
 * ce qui rend la décision testable sans base.
 */
export function planifierReversion(
  paiements: PaiementConnu[],
  amountTTC: number,
): Reversion {
  const synchro = paiements.filter((p) => p.source === 'OPCO_SYNC');
  const manuels = paiements.filter((p) => p.source === 'MANUAL');

  // L'ordre des deux refus compte : s'il n'y a rien de la synchro à défaire, le
  // dé-toggle n'a jamais rien cassé — c'est le cas nominal d'une facture soldée
  // à la main, et il ne mérite pas un message parlant de conflit.
  if (synchro.length === 0) {
    return { ok: false, raison: 'aucun-paiement-synchro', paiementsManuels: manuels.map((p) => p.id) };
  }
  if (manuels.length > 0) {
    return { ok: false, raison: 'paiement-manuel-present', paiementsManuels: manuels.map((p) => p.id) };
  }

  const restant = centimes(paiements.reduce((s, p) => s + p.amount, 0) - synchro.reduce((s, p) => s + p.amount, 0));
  const status = restant <= 0 ? 'ISSUED' : restant >= centimes(amountTTC) ? 'PAID' : 'PARTIAL';

  return {
    ok: true,
    paymentIdsASupprimer: synchro.map((p) => p.id),
    amountPaid: Math.max(0, restant),
    status,
  };
}

/** Message d'erreur du refus — il nomme la facture et dit quoi faire. */
export function messageRefusReversion(raison: RefusReversion, invoiceNumber: string): string {
  if (raison === 'paiement-manuel-present') {
    return (
      `Impossible de retirer l'encaissement : la facture ${invoiceNumber} porte aussi un ` +
      `règlement saisi à la main. Corrigez-le depuis la fiche facture, puis décochez.`
    );
  }
  return (
    `Impossible de retirer l'encaissement : la facture ${invoiceNumber} n'a pas été soldée ` +
    `par la synchronisation du dossier. Corrigez-la depuis la fiche facture.`
  );
}
