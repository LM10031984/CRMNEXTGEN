/**
 * Liste des items "fin de formation" exposée à `docCompletion()` pour piloter
 * le badge X/Y de <ClosureFormationBlock>. Symétrique à `buildDocDockItems`
 * côté pré-formation.
 *
 * Garde-fou Laurent 2026-06-05 : "le compteur d'une étape (7/10) et l'état
 * dans le drawer (prêt / à générer) doivent lire la MÊME fonction." Ici on
 * réutilise `docCompletion()` — le drawer s'alignera sur les mêmes items
 * dans un commit suivant (extension drawer post-pack).
 *
 * Helper PUR — pas d'I/O.
 */

import type { CompletionItem } from './doc-completion';

interface ClosureInput {
  participantsCount: number;
  ageficeEligibleCount: number;
  /** Présence du programme produit (10e doc partagé). */
  programmeProductDocId?: string | null;
  // Compteurs déjà agrégés par `getSessionClosureStatus`.
  grilleObsSession: boolean;
  bilanSatisfaction: boolean;
  attestations: number;
  certificats: number;
  qcm: number;
  positionnements: number;
  satisfactionChaud: number;
  satisfactionFroid: number;
  assiduites: number;
}

export function buildClosureCompletionItems(input: ClosureInput): CompletionItem[] {
  const items: CompletionItem[] = [];
  const N = input.participantsCount;

  // ── Partagés session (3 docs) ──────────────────────────────────────────
  items.push({ state: input.grilleObsSession ? 'generated' : 'missing' });
  items.push({ state: input.bilanSatisfaction ? 'generated' : 'missing' });
  items.push({ state: input.programmeProductDocId ? 'generated' : 'missing' });

  if (N === 0) return items;

  // ── Par stagiaire — 1 item par couple (participant × type) ─────────────
  function pushPerParticipant(count: number, total: number) {
    const generated = Math.min(count, total);
    for (let i = 0; i < generated; i++) items.push({ state: 'generated' });
    for (let i = generated; i < total; i++) items.push({ state: 'missing' });
  }

  pushPerParticipant(input.attestations, N);
  pushPerParticipant(input.certificats, N);
  pushPerParticipant(input.qcm, N);
  pushPerParticipant(input.positionnements, N);
  pushPerParticipant(input.satisfactionChaud, N);
  pushPerParticipant(input.satisfactionFroid, N);

  // Assiduité AGEFICE — uniquement sur les TNS éligibles.
  pushPerParticipant(input.assiduites, input.ageficeEligibleCount);

  return items;
}
