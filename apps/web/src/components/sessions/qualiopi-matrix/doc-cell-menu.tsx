'use client';

/**
 * Phase 9.1 Plan 02 Task 3 — atom `<DocCellMenu>`.
 *
 * Radix DropdownMenu — max 5 items, filtrés par state (table UI-SPEC §Component Contracts) :
 *
 *  | state \ action       | Générer | Re-générer | Télécharger | Téléverser signé | Marquer sans preuve | Supprimer |
 *  | MISSING              |    ✓    |     —      |      —      |        ✓         |          ✓          |    —      |
 *  | GENERATED            |    —    |     ✓      |      ✓      |        ✓         |          —          |    ✓      |
 *  | MANUAL_OK (any kind) |    —    |     —      |      ✓      |   ✓ (replace)    |          —          |    ✓      |
 *  | NA                   |    —    |     —      |      —      |        —         |          —          |    —      |  (renders null)
 *
 * readOnly=true → trigger disabled + aria-disabled + title "Lecture seule — droits insuffisants".
 * Aucun menu n'ouvre.
 *
 * Séparateur Radix `DropdownMenu.Separator` entre "Génération" et "Signature manuelle"
 * (R6 mitigation RESEARCH).
 *
 * Copywriting EXACT UI-SPEC §Copywriting Contract.
 *
 * A11y :
 *  - trigger aria-label="Actions pour {docLabel} de {participantName}"
 *  - aria-haspopup="menu" + aria-expanded automatique via Radix
 *  - destructive items text-red-600 (Supprimer) + text-amber-700 (Marquer sans preuve)
 *    avec icônes Trash2 + AlertTriangle (NOT solely color-coded)
 */

import { useState, useTransition } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  MoreVertical,
  Sparkles,
  RefreshCw,
  Upload,
  Download,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  regenerateParticipantDoc,
  deleteDocument,
  markDocStatus,
} from '@/server/actions/qualiopi-matrix';
import { UploadSignedDocDialog } from './upload-signed-doc-dialog';

export interface CellPdfRef {
  kind: 'document' | 'asset' | 'productDoc' | 'sessionDoc';
  id: string;
}

export interface DocCellMenuProps {
  participantId: string;
  docType: string;
  state: 'GENERATED' | 'MANUAL_OK' | 'MISSING' | 'NA';
  pdfRef?: CellPdfRef;
  /**
   * Lot 0 · 0.2 — une donnée que ce document PORTE a changé depuis sa
   * génération. On ne masque rien et on ne bloque rien : on nomme l'écart à
   * l'endroit où l'utilisateur peut le corriger.
   */
  stale?: boolean;
  /**
   * Lot 0 · 0.3 — contenu générique (IA en échec). Le remède est la
   * régénération : on la met en avant plutôt que de la cacher.
   */
  stub?: boolean;
  /** Si true, lecture seule (FORMATEUR / COMMERCIAL / COMPTABLE) — pas de menu. */
  readOnly?: boolean;
  /** Pour tooltips & confirms. */
  participantName: string;
  /** Label long pour aria-label trigger. */
  docLabel: string;
}

const ITEM_CLS =
  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted';

export function DocCellMenu({
  participantId,
  docType,
  state,
  pdfRef,
  stale,
  stub,
  readOnly,
  participantName,
  docLabel,
}: DocCellMenuProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // NA → pas de menu (cellule décorative — UI-SPEC table).
  if (state === 'NA') return null;

  if (readOnly) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`Actions pour ${docLabel} de ${participantName} (lecture seule)`}
        title="Lecture seule — droits insuffisants"
        className="opacity-40 cursor-not-allowed p-1"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  function handleRegen() {
    startTransition(async () => {
      let res = await regenerateParticipantDoc({ participantId, docKind: docType });

      // Lot 0 · 0.2 — le serveur a détecté un document déjà parti (email,
      // dossier financeur) ou signé. Il ne refuse pas : il demande qu'on le
      // regarde. La formulation vient du serveur, seul à connaître le motif.
      if (!res.ok && res.requiresConfirmation && res.warning) {
        if (!confirm(res.warning)) return;
        res = await regenerateParticipantDoc({
          participantId,
          docKind: docType,
          confirmEngaged: true,
        });
      }

      if (res.ok) {
        if (res.documentId) {
          toast.success(`Document généré pour ${participantName}`);
        } else {
          toast.success('Génération lancée — résultat dans ~2 min');
        }
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur lors de l'opération. Réessayez ou contactez un administrateur.");
      }
    });
  }

  function handleDelete() {
    // Pattern Radix Dialog → fallback window.confirm (feedback Laurent : si clic
    // dans Radix Dialog ne déclenche rien, prompt natif comme fallback).
    if (
      !confirm(
        `Supprimer ce document ?\nLe PDF généré pour ${participantName} sera définitivement supprimé. Cette action est irréversible. La cellule repassera en statut manquant.`,
      )
    )
      return;
    startTransition(async () => {
      let res = await deleteDocument({ participantId, docType });
      if (!res.ok && res.requiresConfirmation && res.warning) {
        if (!confirm(res.warning)) return;
        res = await deleteDocument({ participantId, docType, confirmEngaged: true });
      }
      if (res.ok) {
        toast.success('Document supprimé');
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur lors de l'opération. Réessayez ou contactez un administrateur.");
      }
    });
  }

  function handleMarkNoProof() {
    if (
      !confirm(
        "Marquer signé sans preuve ?\nAucun PDF signé ne sera téléversé. La cellule affichera une pastille orange ⚠ rappelant la dérogation. Utilisez seulement en cas de signature physique non scannée.",
      )
    )
      return;
    startTransition(async () => {
      const res = await markDocStatus({
        participantId,
        docType,
        state: 'MANUAL_OK',
        markedOkWithoutUpload: true,
      });
      if (res.ok) {
        toast.success('Document marqué signé sans preuve', {
          description: 'Une pastille orange ⚠ rappellera la dérogation.',
        });
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur lors de l'opération. Réessayez ou contactez un administrateur.");
      }
    });
  }

  const showGenerate = state === 'MISSING';
  const showRegenerate = state === 'GENERATED';
  const showDownload = pdfRef && (state === 'GENERATED' || state === 'MANUAL_OK');
  const showMarkNoProof = state === 'MISSING';
  const showDelete = state === 'GENERATED' || state === 'MANUAL_OK';

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          {/* BUG-8 — sur cellule MISSING, le kebab passe en ✨ Sparkles primary
              pour signaler clairement qu'une action de génération est disponible
              (le kebab à 3 points était trop discret, les users le rataient). */}
          <button
            type="button"
            aria-label={`Actions pour ${docLabel} de ${participantName}`}
            aria-haspopup="menu"
            disabled={pending}
            className={cn(
              'p-1 rounded focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none transition-colors',
              state === 'MISSING'
                ? 'text-primary hover:bg-primary-50'
                : 'hover:bg-muted/50',
              pending && 'opacity-50 cursor-wait',
            )}
            title={state === 'MISSING' ? 'Générer ce document' : 'Actions sur ce document'}
          >
            {state === 'MISSING' ? (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            ) : (
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="bg-white border border-border rounded-lg shadow-lg py-1 min-w-[220px] z-50"
          >
            {/* Groupe Génération */}
            {showGenerate && (
              <DropdownMenu.Item onSelect={handleRegen} className={ITEM_CLS}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Générer
              </DropdownMenu.Item>
            )}
            {showRegenerate && (
              <DropdownMenu.Item
                onSelect={handleRegen}
                className={cn(
                  ITEM_CLS,
                  stub && 'text-red-700 font-medium',
                  !stub && stale && 'text-amber-800 font-medium',
                )}
              >
                <RefreshCw
                  className={cn('h-4 w-4', stub && 'text-red-600', !stub && stale && 'text-amber-600')}
                  aria-hidden="true"
                />
                {stub
                  ? 'Re-générer — contenu générique'
                  : stale
                    ? 'Re-générer — données modifiées depuis'
                    : 'Re-générer'}
              </DropdownMenu.Item>
            )}
            {showDownload && (
              <DropdownMenu.Item asChild>
                <a
                  href={
                    pdfRef!.kind === 'asset'
                      ? `/api/pedagogical-assets/${pdfRef!.id}`
                      : `/api/documents/${pdfRef!.id}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ITEM_CLS}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Télécharger le PDF
                </a>
              </DropdownMenu.Item>
            )}

            {/* Séparateur entre Génération et Signature manuelle (R6 mitigation) */}
            {(showGenerate || showRegenerate || showDownload) && (
              <DropdownMenu.Separator className="h-px bg-border my-1" />
            )}

            {/* Groupe Signature manuelle */}
            <DropdownMenu.Item onSelect={() => setUploadOpen(true)} className={ITEM_CLS}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Téléverser le PDF signé
            </DropdownMenu.Item>

            {showMarkNoProof && (
              <DropdownMenu.Item
                onSelect={handleMarkNoProof}
                className={cn(ITEM_CLS, 'text-amber-700')}
              >
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Marquer signé sans preuve
              </DropdownMenu.Item>
            )}

            {/* Séparateur + groupe Destructive */}
            {showDelete && (
              <>
                <DropdownMenu.Separator className="h-px bg-border my-1" />
                <DropdownMenu.Item
                  onSelect={handleDelete}
                  className={cn(ITEM_CLS, 'text-red-600')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Supprimer le document
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <UploadSignedDocDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        participantId={participantId}
        docType={docType}
      />
    </>
  );
}
