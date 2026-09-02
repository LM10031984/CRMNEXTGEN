/**
 * Phase 15 Lot 2 (15-02) — Onglet « Tous les documents » (LECTURE SEULE).
 *
 * Server component : promeut `<ParticipantDocMatrix>` en plein écran (sortie de
 * son `<details>`) + un bouton « Télécharger le ZIP » du dernier batch closure.
 *
 * Règle LOCKED « 1 doc = 1 maison » : cet onglet MONTRE, il n'AGIT pas. Aucune
 * action de génération de doc ici (Avant/Après agissent). La régénération par
 * cellule de la matrice (menu CENTRAL-02 déjà présent dans `ParticipantDocMatrix`,
 * gardé par son `readOnly` RBAC) reste telle quelle — on n'AJOUTE pas de surface.
 */

import { Download } from 'lucide-react';
import {
  ParticipantDocMatrix,
  type MatrixParticipant,
} from '../qualiopi-matrix/participant-doc-matrix';

interface Props {
  sessionId: string;
  userRole: string;
  hasAgeficeParticipant: boolean;
  participants: MatrixParticipant[];
  productDocs: Map<string, { id: string }>;
  sessionDocs: Map<string, { id: string }>;
  /** Dernier batch closure téléchargeable (ZIP) — absent si aucun doc généré. */
  zipBatchId?: string | null;
  /** Lot 0 · 0.2 — documents dont une donnée rendue a bougé depuis la génération. */
  staleDocIds?: ReadonlySet<string>;
}

export function TabTousDocuments({
  sessionId,
  userRole,
  hasAgeficeParticipant,
  participants,
  productDocs,
  sessionDocs,
  zipBatchId,
  staleDocIds,
}: Props) {
  return (
    <div className="pt-4 space-y-4">
      <div
        id="section-doc-matrix"
        className="scroll-mt-20 flex items-center justify-between gap-3 flex-wrap"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vue tableau Qualiopi · matrice apprenant × document
        </span>
        {zipBatchId && (
          <a
            href={`/api/closure/${zipBatchId}/zip`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            <Download className="h-4 w-4" /> Télécharger le ZIP
          </a>
        )}
      </div>

      <ParticipantDocMatrix
        sessionId={sessionId}
        userRole={userRole}
        hasAgeficeParticipant={hasAgeficeParticipant}
        participants={participants}
        productDocs={productDocs}
        sessionDocs={sessionDocs}
        staleDocIds={staleDocIds}
      />
    </div>
  );
}
