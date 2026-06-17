import { GraduationCap, ThumbsUp, SmilePlus } from 'lucide-react';
import type { EvaluationStats } from '@/lib/evaluation-stats';

/**
 * Bloc « Résultats d'évaluation » de la fiche session — calculé à la volée
 * (aucun stockage). Affiche le taux de réussite QCM (+ score moyen) et le taux
 * de recommandation. N'affiche rien tant qu'aucune évaluation réelle n'existe.
 */
export function SessionEvaluationBlock({ evalStats }: { evalStats: EvaluationStats }) {
  const { qcm, satisfaction: sat } = evalStats;
  if (!qcm && !sat) return null;

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Résultats d'évaluation</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {qcm && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
              <GraduationCap className="h-4 w-4" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Réussite QCM
              </div>
              <div className="text-2xl font-bold tabular-nums leading-tight">{qcm.tauxReussite} %</div>
              <div className="text-xs text-muted-foreground">
                moyenne {qcm.scoreMoyen} % · {qcm.nbStagiaires} stagiaire{qcm.nbStagiaires > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}
        {sat && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
              <ThumbsUp className="h-4 w-4" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Recommandation
              </div>
              <div className="text-2xl font-bold tabular-nums leading-tight">{sat.tauxRecommandation} %</div>
              <div className="text-xs text-muted-foreground">
                {sat.nbReponses} répondant{sat.nbReponses > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}
        {sat && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
              <SmilePlus className="h-4 w-4" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Note globale
              </div>
              <div className="text-2xl font-bold tabular-nums leading-tight">{sat.noteGlobale} %</div>
              <div className="text-xs text-muted-foreground">satisfaction à chaud</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
