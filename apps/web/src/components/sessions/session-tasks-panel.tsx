/**
 * Panel "À faire sur cette session" — liste les Tasks TODO liées à la session,
 * avec priorité visuelle (HIGH = rouge, MEDIUM = orange, LOW = gris).
 *
 * Server Component pur (lecture seule). Marquer terminée se fera côté
 * page /app/parametres/utilisateurs ou via un Client component dédié plus tard.
 */

import { AlertCircle, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';
import { prisma } from '@qualiof/db';

interface Props {
  sessionId: string;
  tenantId: string;
}

/**
 * Heuristique : déduit un anchor #section-X sur la fiche session selon le
 * titre de la tâche, pour que cliquer sur la tâche scroll vers l'élément
 * à corriger (bug remonté Laurent 2026-06-04 : "tâches pas cliquables").
 */
function deduceTaskFixHref(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes('formateur')) return '#section-formateurs';
  if (t.includes('programme') && t.includes('ia')) return '#step-1';
  if (t.includes('programme') || t.includes('produit')) return '#section-produit';
  if (t.includes('lieu') || t.includes('location')) return '#section-lieu';
  if (t.includes('participant') || t.includes('apprenant') || t.includes('inscrit'))
    return '#section-participants';
  if (t.includes('prix') || t.includes('tarif')) return '#step-1';
  if (t.includes('agefice') || t.includes('opco')) return '#step-2';
  return '#step-1';
}

const PRIORITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: typeof AlertCircle }> = {
  HIGH: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertCircle },
  MEDIUM: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: Clock },
  LOW: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', icon: CheckCircle2 },
};

const PRIORITY_LABEL: Record<string, string> = {
  HIGH: 'Urgent',
  MEDIUM: 'À traiter',
  LOW: 'Optionnel',
};

export async function SessionTasksPanel({ sessionId, tenantId }: Props) {
  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      sessionId,
      status: { not: 'DONE' },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 10,
  });

  // Auto-DONE des tâches obsolètes : ex. "formateur principal manquant" si
  // la session a maintenant un SessionTrainer.isPrimary=true.
  // (Bug remonté Laurent 2026-06-04 : tâches Imagimmo orphelines.)
  if (tasks.length > 0) {
    const formateurTasks = tasks.filter((t) => /formateur/i.test(t.title));
    if (formateurTasks.length > 0) {
      const hasPrimary = await prisma.sessionTrainer.findFirst({
        where: { sessionId, isPrimary: true },
        select: { id: true },
      });
      if (hasPrimary) {
        await prisma.task.updateMany({
          where: { id: { in: formateurTasks.map((t) => t.id) } },
          data: { status: 'DONE' },
        });
        // Réfiltre l'affichage
        return (
          <SessionTasksPanel sessionId={sessionId} tenantId={tenantId} />
        );
      }
    }
  }

  if (tasks.length === 0) return null;

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/30 p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-red-800 mb-3 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        À faire sur cette session ({tasks.length})
      </h2>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const style = PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.MEDIUM!;
          const Icon = style.icon;
          const fixHref = deduceTaskFixHref(t.title);
          return (
            <li key={t.id}>
              <a
                href={fixHref ?? '#'}
                className={`block rounded-lg border ${style.border} ${style.bg} p-3 hover:shadow-sm hover:border-opacity-80 transition-shadow cursor-pointer group`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.text}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-sm font-medium ${style.text}`}>{t.title}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.text} bg-white/60 px-1.5 py-0.5 rounded`}>
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                        {t.description}
                      </p>
                    )}
                  </div>
                  {fixHref && (
                    <ArrowRight
                      className={`h-4 w-4 shrink-0 ${style.text} opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
