/**
 * Liste des items "préparation pédagogique" exposée à `docCompletion()`
 * pour piloter le badge X/Y de <PreparationPedagogiqueBlock>.
 *
 * Garde-fou Laurent 2026-06-05 : "le compteur d'une étape (7/10) et l'état
 * dans le drawer (prêt / à générer) doivent lire la MÊME fonction." Cette
 * liste minimale sert le badge ; le drawer consomme déjà la version riche
 * (DocDockItem) via `buildDocDockItems` — les deux donnent le même total
 * tant que le set de docs reste identique (3 partagés + 4 par stagiaire,
 * 4e = AGEFICE conditionnel TNS).
 */

import type { CompletionItem } from './doc-completion';
import type { SessionPreparationStatus } from '@/server/actions/prepare-training';

export function buildPrepCompletionItems(
  status: SessionPreparationStatus,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const N = status.participantsCount;

  // ── Partagés produit/session (3) ───────────────────────────────────────
  items.push({ state: status.programme ? 'generated' : 'missing' });
  items.push({ state: status.deroule ? 'generated' : 'missing' });
  items.push({ state: status.checklist ? 'generated' : 'missing' });

  if (N === 0) return items;

  function pushPerParticipant(count: number, total: number) {
    const generated = Math.min(count, total);
    for (let i = 0; i < generated; i++) items.push({ state: 'generated' });
    for (let i = generated; i < total; i++) items.push({ state: 'missing' });
  }

  pushPerParticipant(status.conventionsCount, N);
  pushPerParticipant(status.convocationsCount, N);

  // Analyse besoin PAR STAGIAIRE — peut être 'pending' si le worker travaille.
  //
  // Quick 260821-md8 : le dénominateur n'est plus l'effectif mais le nombre
  // d'analyses par stagiaire LÉGITIMEMENT attendues (les auto-payeurs). Quand
  // le payeur est une personne morale, le document attendu est celui de
  // l'entreprise : compter l'effectif laisserait la session éternellement
  // « 1 manquant » sur un document qu'on a décidé de ne plus produire.
  const abTotal = status.analyseBesoinAttendue;
  const inflight = status.analyseBesoinInProgress + status.analyseBesoinPending;
  const abDone = Math.min(status.analyseBesoinDone, abTotal);
  const abPending = Math.min(inflight, abTotal - abDone);
  const abMissing = Math.max(0, abTotal - abDone - abPending);
  for (let i = 0; i < abDone; i++) items.push({ state: 'generated' });
  for (let i = 0; i < abPending; i++) items.push({ state: 'pending' });
  for (let i = 0; i < abMissing; i++) items.push({ state: 'missing' });

  // Analyse besoin ENTREPRISE — une par session dès qu'un commanditaire est une
  // personne morale. Aucun générateur applicatif ne la produit encore : elle
  // ressort donc « missing » tant qu'elle n'existe pas. C'est volontaire —
  // masquer ce trou à l'indicateur 4 serait pire que l'afficher.
  for (let i = 0; i < status.analyseBesoinEntreprisePresente; i++) {
    items.push({ state: 'generated' });
  }
  for (let i = 0; i < status.analyseBesoinEntrepriseAttendue; i++) {
    items.push({ state: 'missing' });
  }

  // Demande AGEFICE — uniquement sur les TNS éligibles.
  pushPerParticipant(status.ageficeCount, status.ageficeEligibleCount);

  return items;
}
