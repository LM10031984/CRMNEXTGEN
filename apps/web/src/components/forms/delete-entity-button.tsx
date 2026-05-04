'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { deletePerson, deleteTrainingSession } from '@/server/actions/crud-edits';

/**
 * Bouton de suppression avec confirmation modale.
 * - Person : soft delete (archived=true) si historique, hard delete sinon.
 *   Option "force" pour hard delete malgré historique (admin confirme).
 * - TrainingSession : refuse si participants/documents existent.
 */
export function DeleteEntityButton({
  entity,
  entityId,
  entityName,
  redirectTo,
  variant = 'icon',
}: {
  entity: 'person' | 'session';
  entityId: string;
  entityName: string;
  redirectTo?: string;
  variant?: 'icon' | 'button';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  const label = entity === 'person' ? 'apprenant' : 'session';

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const r = entity === 'person'
        ? await deletePerson(entityId, { force })
        : await deleteTrainingSession(entityId);
      if (!r.ok) {
        setError(r.error ?? 'Erreur inconnue.');
        return;
      }
      setOpen(false);
      if (redirectTo) router.push(redirectTo as any);
      else router.refresh();
    });
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
          title={`Supprimer ${label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 text-sm hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !pending && setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <div className="rounded-full bg-red-100 p-2"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div>
                <h3 className="font-semibold">Supprimer {label}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>{entityName}</strong> sera supprimé(e). Cette action est irréversible.
                </p>
              </div>
            </div>

            {entity === 'person' && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5" />
                <span>
                  <strong>Suppression définitive</strong> — supprime aussi les sensibles (RGPD).
                  Sans cette case, l'apprenant est juste archivé s'il a un historique.
                </span>
              </label>
            )}

            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">{error}</div>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted">Annuler</button>
              <button type="button" onClick={handleDelete} disabled={pending} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
