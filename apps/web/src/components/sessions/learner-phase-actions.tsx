'use client';

/**
 * Les deux actions posées SUR LA LIGNE DU NOM d'un apprenant, dans un onglet
 * de phase (Laurent 2026-09-10 : « là où il y a le nom des apprenants dans la
 * phase avant la formation, après etc. — ici un bouton par apprenant »).
 *
 * Volontairement bête : il ne sait ni générer ni empaqueter. Le parent lui
 * passe l'action de génération de SA phase (l'avant passe par
 * `dispatchGenerateMissing`, l'après par le pack `generateClosurePack` en mode
 * mono-participant) et il se contente de l'afficher au bon endroit.
 *
 * Le bouton « Télécharger » est un `<a>`, pas un bouton : le navigateur doit
 * recevoir une vraie réponse de fichier, et un lien reste ouvrable dans un
 * nouvel onglet ou copiable — ce qu'un `onClick` ne permet pas.
 */

import { Download, Loader2, Zap } from 'lucide-react';

export interface LearnerPhaseActionsProps {
  sessionId: string;
  /** `SessionParticipant.id`. */
  participantId: string;
  participantName: string;
  /** `avant` | `pendant` | `apres` — celle de l'onglet où l'on se trouve. */
  phase: 'avant' | 'pendant' | 'apres';
  /** Documents de cette phase déjà produits pour cet apprenant. */
  readyCount: number;
  /**
   * Intitulés des pièces que l'archive contiendra, pour l'infobulle.
   *
   * Le compteur seul a déjà menti une fois (bug remonté le 2026-09-10 :
   * « Télécharger (5) » alors que l'attestation d'assiduité n'était pas dans
   * le zip). Un nombre ne se vérifie qu'après décompression ; la liste, elle,
   * se lit avant de cliquer.
   */
  readyLabels?: string[];
  /** Documents de cette phase encore à produire. */
  missingCount: number;
  /** RBAC : afficher ou non l'action de génération. */
  canGenerate: boolean;
  /** Génère les manquants de CETTE phase pour CET apprenant. */
  onGenerateAll?: () => void;
  /** Génération en cours pour cet apprenant. */
  busy?: boolean;
}

export function LearnerPhaseActions({
  sessionId,
  participantId,
  participantName,
  phase,
  readyCount,
  readyLabels,
  missingCount,
  canGenerate,
  onGenerateAll,
  busy = false,
}: LearnerPhaseActionsProps) {
  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      {canGenerate && missingCount > 0 && onGenerateAll && (
        <button
          type="button"
          onClick={onGenerateAll}
          disabled={busy}
          aria-label={`Générer les documents manquants de ${participantName}`}
          title={`Générer les ${missingCount} document${missingCount > 1 ? 's' : ''} manquant${missingCount > 1 ? 's' : ''} de cette phase pour ${participantName}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-60 disabled:cursor-wait transition-colors shadow-sm"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Tout générer ({missingCount})
        </button>
      )}

      {readyCount > 0 && (
        <a
          href={`/api/sessions/${sessionId}/apprenants/${participantId}/zip?phase=${phase}`}
          aria-label={`Télécharger les documents de ${participantName} pour cette phase`}
          title={
            readyLabels && readyLabels.length > 0
              ? `Archive de ${participantName} — ${readyLabels.join(' · ')}`
              : `Télécharger les ${readyCount} document${readyCount > 1 ? 's' : ''} de cette phase pour ${participantName}, en une archive`
          }
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Télécharger ({readyCount})
        </a>
      )}
    </div>
  );
}
