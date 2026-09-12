/**
 * Phase 9.1 Plan 03 Task 1 — `<ParticipantDocMatrix>` (Server Component orchestrateur).
 *
 * Charge les data (props sérialisables), dérive l'état de chaque cellule via
 * `deriveCellState` (Plan 01), puis monte un shell client `<MatrixClientShell>`
 * qui gère :
 *   - filtres (MatrixFilters + useLocalStorageState — Plan 03 Task 2)
 *   - sélection multi (Set<participantId>)
 *   - rendu MatrixRow pour chaque participant
 *   - rendu BatchRegenBar quand sélection > 0
 *
 * Bug P0 anti-régression : la map `productDocs` est lue par `deriveCellState`
 * pour résoudre PROGRAMME (1 PDF Document.entityType='product' partagé entre
 * N participants → chaque ligne lit ce SEUL pdfRef productDoc).
 *
 * RBAC (D-11) : readOnly = !['ADMIN','MANAGER'].includes(userRole).
 * Tous les DocCellMenu de la matrice héritent ce readOnly.
 *
 * Colonnes :
 *   columns = [...MATRIX_DOC_TYPES, ...(hasAgeficeParticipant ? ['AGEFICE'] : [])]
 *   → 14 ou 15 colonnes. La décision revient à la PAGE, qui la prend avec
 *     `colonneAgeficeVisible` (régime OU document existant OU avertissement).
 *
 * LE « NA » NE SE DÉCIDE PLUS ICI (lot C.2b-1, décision Laurent du 10/09/2026).
 * Ce composant portait sa propre règle en dur — `if (docType === 'AGEFICE' &&
 * !p.isAgefice) return NA` — qui écrasait jusqu'au document existant : un
 * dossier généré disparaissait de l'écran, et un dossier qui disparaît ne se
 * corrige jamais. La règle vit désormais dans le régime de financement
 * (`lib/signature/participants-regime.ts` → `docTypesSansObjet`), et arrive
 * ici comme une DONNÉE, `docTypesHorsRegime`, passée à `deriveCellState`.
 * Celui-ci ne rend `NA` qu'en DERNIER RECOURS, après avoir cherché partout :
 * une pièce hors régime dont le PDF existe reste affichée telle quelle.
 */

import { Users } from 'lucide-react';
import { deriveCellState, type CellState, type CellFlagSets } from '@/lib/derive-cell-state';
import { MATRIX_DOC_TYPES, DOC_TYPE_LABELS } from '@/lib/doc-scope';
import { MatrixClientShell } from './matrix-client-shell';

export interface MatrixParticipant {
  id: string;
  personId: string;
  fullName: string;
  sponsorOrgId?: string;
  sponsorOrgLabel?: string;
  sponsorOrgOpcoCode?: string | null;
  financingMode?: string | null;
  docStatus: Record<string, unknown> | null;
  isAgefice: boolean;
  /**
   * Pièces SANS OBJET sous le régime de financement de ce participant (lot C.1
   * + C.2b-1). Absent = comportement d'avant, aucun `NA` dérivé du régime.
   */
  docTypesHorsRegime?: ReadonlySet<string>;
  /** Map docType → Document.id (entityType='participant', match entityId). */
  participantDocs: Map<string, { id: string }>;
  /** Map kind → PedagogicalAsset.id (participantId match). */
  pedagogicalAssets: Map<string, { id: string }>;
}

export interface ParticipantDocMatrixProps {
  sessionId: string;
  userRole: string;
  hasAgeficeParticipant: boolean;
  participants: MatrixParticipant[];
  productDocs: Map<string, { id: string }>;
  sessionDocs: Map<string, { id: string }>;
  /**
   * Lot 0 — périmé / non vérifiable / engagé / générique, calculés par
   * `analyzeSessionDocuments`. Optionnel : sans eux, la matrice affiche ce
   * qu'elle affichait avant.
   */
  flags?: CellFlagSets;
}

export function ParticipantDocMatrix({
  sessionId,
  userRole,
  hasAgeficeParticipant,
  participants,
  productDocs,
  sessionDocs,
  flags,
}: ParticipantDocMatrixProps) {
  // D-11 — RBAC matrice : ADMIN/MANAGER write, autres lecture seule.
  const readOnly = !['ADMIN', 'MANAGER'].includes(userRole);

  // Colonnes effectives : 14 core + AGEFICE conditionnel.
  const columns: readonly string[] = hasAgeficeParticipant
    ? [...MATRIX_DOC_TYPES, 'AGEFICE']
    : MATRIX_DOC_TYPES;

  // Pré-calcul OPCO options (filter parmi codes distincts).
  const opcoSet = new Set<string>();
  for (const p of participants) {
    if (p.sponsorOrgOpcoCode) opcoSet.add(p.sponsorOrgOpcoCode);
  }
  const opcoOptions = Array.from(opcoSet).sort();

  // Build pré-calculé des cellules (Server-side) — propage les CellState sérialisables
  // aux MatrixRow client.
  const rows = participants.map((p) => {
    const cells: Array<{ docType: string; state: CellState }> = columns.map((docType) => {
      const state = deriveCellState(
        docType,
        // docStatus est un Json BDD → on cast via `as never` pour satisfaire
        // le typage DocStatusMap (validé via Zod ailleurs au moment du write).
        { docStatus: p.docStatus as never },
        p.participantDocs,
        productDocs,
        sessionDocs,
        p.pedagogicalAssets,
        flags,
        // Le 8ᵉ paramètre, livré en C.1 et que PERSONNE ne passait : sans lui,
        // `NA` n'apparaissait jamais et le régime restait invisible à l'écran.
        p.docTypesHorsRegime,
      );
      return { docType, state };
    });
    return {
      participant: {
        id: p.id,
        personId: p.personId,
        fullName: p.fullName,
        sponsorOrgId: p.sponsorOrgId,
        sponsorOrgLabel: p.sponsorOrgLabel,
        sponsorOrgOpcoCode: p.sponsorOrgOpcoCode ?? null,
        financingMode: p.financingMode ?? null,
        isAgefice: p.isAgefice,
      },
      cells,
    };
  });

  const totalDocsTracked = rows.length * columns.length;

  return (
    <section
      aria-labelledby="participant-doc-matrix-heading"
      className="rounded-2xl border border-border bg-white overflow-hidden"
    >
      <div className="flex items-center justify-between p-5 border-b border-border gap-3 flex-wrap">
        <div>
          <h2
            id="participant-doc-matrix-heading"
            className="font-semibold inline-flex items-center gap-2"
          >
            <Users className="h-5 w-5 text-primary" aria-hidden="true" /> Documents participants
          </h2>
          {rows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {rows.length} apprenant{rows.length > 1 ? 's' : ''} · {totalDocsTracked} document
              {totalDocsTracked > 1 ? 's' : ''} suivi{totalDocsTracked > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">Aucun apprenant inscrit</p>
          <p className="text-xs text-muted-foreground mt-1">
            Inscrivez au moins un apprenant pour suivre ses documents Qualiopi.
          </p>
        </div>
      ) : (
        <>
          <MatrixClientShell
            sessionId={sessionId}
            readOnly={readOnly}
            rows={rows}
            columns={columns}
            opcoOptions={opcoOptions}
            columnLabels={DOC_TYPE_LABELS}
          />
          <div className="px-5 pb-4">
            <p className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span>Légende :</span>
              <span>● Prêt</span>
              <span>⚠ Sans preuve</span>
              <span>✗ Manquant</span>
              <span>— Non applicable</span>
            </p>
          </div>
        </>
      )}
    </section>
  );
}
