/**
 * Panel "À faire sur cette session" — liste les Tasks TODO liées à la session,
 * avec priorité visuelle (HIGH = rouge, MEDIUM = orange, LOW = gris).
 *
 * Server Component pur (lecture seule). Marquer terminée se fera côté
 * page /app/parametres/utilisateurs ou via un Client component dédié plus tard.
 */

import { AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { prisma } from '@qualiof/db';

interface Props {
  sessionId: string;
  tenantId: string;
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
          return (
            <li
              key={t.id}
              className={`rounded-lg border ${style.border} ${style.bg} p-3`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.text}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${style.text}`}>{t.title}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.text} bg-white/60 px-1.5 py-0.5 rounded`}>
                      {PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{t.description}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
