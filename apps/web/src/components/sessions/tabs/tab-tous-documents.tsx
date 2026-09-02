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

import { Download, FileWarning } from 'lucide-react';
import {
  ParticipantDocMatrix,
  type MatrixParticipant,
} from '../qualiopi-matrix/participant-doc-matrix';
import type { CellFlagSets } from '@/lib/derive-cell-state';

interface Props {
  sessionId: string;
  userRole: string;
  hasAgeficeParticipant: boolean;
  participants: MatrixParticipant[];
  productDocs: Map<string, { id: string }>;
  sessionDocs: Map<string, { id: string }>;
  /** Dernier batch closure téléchargeable (ZIP) — absent si aucun doc généré. */
  zipBatchId?: string | null;
  /** Lot 0 — périmé / non vérifiable / engagé / générique. */
  flags?: CellFlagSets;
  /** Lot 0 · 0.3 — combien, pour l'avertissement au téléchargement du pack. */
  stubCount?: number;
}

export function TabTousDocuments({
  sessionId,
  userRole,
  hasAgeficeParticipant,
  participants,
  productDocs,
  sessionDocs,
  zipBatchId,
  flags,
  stubCount = 0,
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
            className={
              stubCount > 0
                ? 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-red-300 bg-red-50 text-red-800 text-sm font-medium hover:bg-red-100 transition-colors'
                : 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors'
            }
          >
            <Download className="h-4 w-4" />
            {stubCount > 0 ? 'Télécharger le ZIP quand même' : 'Télécharger le ZIP'}
          </a>
        )}
      </div>

      {/* Lot 0 · 0.3 (audit 28/08, E-3) — un pack qui part avec du contenu
          générique est le premier signal que cherche un auditeur : deux grilles
          d'observation identiques mot pour mot. On le dit AVANT le clic. */}
      {stubCount > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <FileWarning className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>
              {stubCount} document{stubCount > 1 ? 's' : ''} de ce pack {stubCount > 1 ? 'ont' : 'a'} un
              contenu générique
            </strong>{' '}
            — l’IA a échoué et le texte de remplacement est le même d’un stagiaire à l’autre. À
            régénérer avant toute remise à l’apprenant ou au financeur.
          </span>
        </p>
      )}

      <ParticipantDocMatrix
        sessionId={sessionId}
        userRole={userRole}
        hasAgeficeParticipant={hasAgeficeParticipant}
        participants={participants}
        productDocs={productDocs}
        sessionDocs={sessionDocs}
        flags={flags}
      />
    </div>
  );
}
