'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye } from 'lucide-react';

/**
 * Modal détail diff AuditLog (Phase 8 Plan 08-05 Task 2).
 *
 * Affiche le contenu de `AuditLog.diff` (Json arbitraire) avec deux rendus :
 *  1. Si la diff est `{ [field]: { before, after } }` (shape Phase 7
 *     `computeDiff` pour parameters.update) → tableau 2 colonnes Avant / Après.
 *  2. Sinon (e.g. `{ email, role, invitationId }` pour users.invite,
 *     `{ email, reason }` pour auth.login.failed) → JSON pretty-print.
 *
 * Heuristique de détection : on considère que c'est un "before/after diff"
 * uniquement si TOUTES les valeurs de l'objet sont des objets `{ before, after }`
 * ET que l'objet est non-vide. Une diff vide `{}` ou mixte tombe sur le JSON.
 */
export interface AuditDiffModalProps {
  diff: unknown;
  action: string;
}

function isBeforeAfterDiff(
  diff: unknown,
): diff is Record<string, { before: unknown; after: unknown }> {
  if (
    typeof diff !== 'object' ||
    diff === null ||
    Array.isArray(diff)
  ) {
    return false;
  }
  const entries = Object.entries(diff as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.every(
    ([, v]) =>
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      'before' in (v as object) &&
      'after' in (v as object),
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function AuditDiffModal({ diff, action }: AuditDiffModalProps) {
  const [open, setOpen] = useState(false);
  const beforeAfter = isBeforeAfterDiff(diff);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Eye className="h-3.5 w-3.5" />
          Voir
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Détail :{' '}
            <span className="font-mono text-base">{action}</span>
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            Modifications enregistrées dans l'AuditLog.
          </Dialog.Description>

          <div className="mt-5">
            {beforeAfter ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-semibold">Champ</th>
                    <th className="py-2 font-semibold">Avant</th>
                    <th className="py-2 font-semibold">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(diff).map(([k, v]) => (
                    <tr key={k} className="border-t border-border align-top">
                      <td className="py-2 font-mono text-xs font-medium">
                        {k}
                      </td>
                      <td className="py-2 text-xs text-red-700">
                        <span className="line-through break-all">
                          {renderValue(v.before)}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-emerald-700 break-all">
                        {renderValue(v.after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="text-xs bg-slate-50 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(diff, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex justify-end mt-5 pt-3 border-t border-border">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Fermer
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
