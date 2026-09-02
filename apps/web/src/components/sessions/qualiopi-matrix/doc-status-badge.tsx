'use client';

/**
 * Phase 9.1 Plan 02 Task 3 — atom `<DocStatusBadge>`.
 *
 * Pastille 6 variants (UI-SPEC §Color pastille palette) :
 *  - GENERATED                → emerald soft (Check)
 *  - MANUAL_OK + uploaded     → emerald solid (Check)
 *  - MANUAL_OK + no_proof     → amber warning (AlertTriangle)
 *  - MISSING                  → red danger (X)
 *  - NA                       → slate muted (Minus)
 *  - RUNNING (BullMQ in flight) → sky info (Loader2 animate-spin)
 *
 * Anti-pattern (UI-SPEC) : ne pas faire de cette atom un <button> — wrapper
 * dans <button aria-label="Ouvrir le document {label}"> côté DocStatusButton
 * quand interactive (matrice). Standalone en légende = plain <span>.
 *
 * A11y : aria-label + title (couleur dupliquée par icône + texte FR).
 */

import { Check, AlertTriangle, X, Minus, Loader2, History, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocStatusState as DocStatusStateType } from '@qualiof/shared';

export interface DocStatusBadgeProps {
  /** État courant. NA = doc non applicable pour ce participant. RUNNING = transient. */
  state: DocStatusStateType | 'NA' | 'RUNNING';
  /** Présent uniquement quand state==='MANUAL_OK' coché sans upload (D-01 dérogatoire). */
  warning?: 'no_proof';
  /** Label long du DocType utilisé dans aria-label + title (cf. DOC_TYPE_LABELS). */
  label: string;
  /** Si state==='MANUAL_OK' + uploadedSignedPdfKey présent → variant solid. */
  hasUploadedPdf?: boolean;
  /**
   * Lot 0 · 0.2 — le PDF existe mais une donnée qu'il PORTE a changé depuis sa
   * génération. Ce n'est pas un manque : c'est un document qui ment. Il prend
   * donc le pas sur le vert « généré ».
   */
  stale?: boolean;
  /**
   * Lot 0 · 0.3 — contenu GÉNÉRIQUE (l'IA a échoué). Pire qu'un document
   * absent : il ressemble à une preuve, et deux stagiaires ont le même texte.
   * Passe donc devant « périmé » comme devant « généré ».
   */
  stub?: boolean;
}

const BASE_CLS = 'inline-flex items-center justify-center h-6 w-6 rounded-full';

export function DocStatusBadge({ state, warning, label, hasUploadedPdf, stale, stub }: DocStatusBadgeProps) {
  if (stub) {
    const ariaLabel = `${label} : contenu générique, à régénérer`;
    return (
      <span
        aria-label={ariaLabel}
        title="Contenu générique — l'IA a échoué, ce document est identique d'un stagiaire à l'autre. À régénérer avant toute remise."
        className={cn(BASE_CLS, 'bg-red-100 text-red-700 border border-red-400')}
      >
        <FileWarning className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  if (stale && (state === 'GENERATED' || state === 'MANUAL_OK')) {
    const ariaLabel = `${label} : données modifiées depuis la génération`;
    return (
      <span
        aria-label={ariaLabel}
        title="Données modifiées depuis la génération — ce PDF n'est plus à jour"
        className={cn(BASE_CLS, 'bg-amber-100 text-amber-800 border border-amber-400')}
      >
        <History className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  if (state === 'RUNNING') {
    const ariaLabel = `${label} : génération en cours`;
    return (
      <span
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(BASE_CLS, 'bg-sky-50 text-sky-700 border border-sky-200')}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      </span>
    );
  }

  if (state === 'NA') {
    const ariaLabel = `${label} : non applicable`;
    return (
      <span
        aria-label={ariaLabel}
        title="Non applicable"
        className={cn(BASE_CLS, 'bg-slate-100 text-slate-400')}
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  if (state === 'MANUAL_OK' && warning === 'no_proof') {
    const ariaLabel = `${label} : marqué OK sans preuve uploadée`;
    return (
      <span
        aria-label={ariaLabel}
        title="Marqué signé sans preuve — dérogation"
        className={cn(BASE_CLS, 'bg-amber-100 text-amber-700 border border-amber-300')}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  if (state === 'MANUAL_OK') {
    const ariaLabel = `${label} : signé et uploadé`;
    return (
      <span
        aria-label={ariaLabel}
        title={hasUploadedPdf ? 'Signé et téléversé' : 'Validé manuellement'}
        className={cn(BASE_CLS, hasUploadedPdf ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white')}
      >
        <Check className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  if (state === 'GENERATED') {
    const ariaLabel = `${label} : généré`;
    return (
      <span
        aria-label={ariaLabel}
        title="Généré — non encore signé"
        className={cn(BASE_CLS, 'bg-emerald-100 text-emerald-700 border border-emerald-300')}
      >
        <Check className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  // MISSING (default fallback)
  const ariaLabel = `${label} : manquant`;
  return (
    <span
      aria-label={ariaLabel}
      title="Document à générer ou téléverser"
      className={cn(BASE_CLS, 'bg-red-100 text-red-700 border border-red-300')}
    >
      <X className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}
