/**
 * Complétude documents — source UNIQUE de vérité partagée par :
 *   - <DocDockDrawer>           : compteurs header + badges par section
 *   - SessionHeaderBar (Documents badge)
 *   - <ClosureFormationBlock>   : badge "X/Y" du step 4
 *   - <PreparationPedagogiqueBlock> : badge "X/Y" du step 2
 *
 * Garde-fou Laurent 2026-06-05 : "le compteur d'une étape (7/10) et l'état
 * dans le drawer (prêt / à générer) doivent lire la MÊME fonction. Sinon
 * un doc prêt d'un côté et à générer de l'autre."
 *
 * Helper PUR — pas d'I/O. Prend en entrée la liste d'items déjà construite
 * par buildDocDockItems / buildParticipantCards et retourne les agrégats.
 */

import type { DocDockItem } from '@/components/sessions/doc-dock';

export interface DocCompletion {
  /** Total docs comptés (hors notApplicable). */
  total: number;
  /** Docs générés (state='generated'). */
  ready: number;
  /** Docs en attente de génération IA (state='pending'). */
  pending: number;
  /** Docs manquants (state='missing'). */
  missing: number;
}

export function docCompletion(items: DocDockItem[]): DocCompletion {
  let total = 0;
  let ready = 0;
  let pending = 0;
  let missing = 0;
  for (const it of items) {
    total++;
    if (it.state === 'generated') ready++;
    else if (it.state === 'pending') pending++;
    else missing++;
  }
  return { total, ready, pending, missing };
}

/** Sous-ensemble : items pré-formation uniquement (section 'shared' + 'participant' + 'ai'). */
export function docCompletionPrePack(items: DocDockItem[]): DocCompletion {
  // Tous les items actuels sont pré-formation. À adapter quand on étendra
  // aux items post-pack côté drawer (commit ui-e).
  return docCompletion(items);
}
