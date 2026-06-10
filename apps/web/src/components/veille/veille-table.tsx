/**
 * Tableau veille — 5/6 colonnes (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * Colonnes : Titre (lien si URL) · Source/Type · Responsable · Fréquence · Exploitation
 * + colonne Actions (kebab) si `canEdit=true`.
 *
 * Pattern responsive `overflow-x-auto -mx-4 sm:mx-0` (Phase 3 grilles + Phase 8 historique).
 *
 * - LECTEUR (`canEdit=false`) :
 *    - Pas de colonne Actions.
 *    - Exploitation rendue en `<p>` texte (pas d'inline edit).
 * - ADMIN/MANAGER (`canEdit=true`) :
 *    - Colonne Actions (VeilleRowActions) avec kebab Modifier/Archiver.
 *    - Exploitation rendue via <ExploitationCell> (inline edit textarea + toast).
 *
 * Les entrées `status='DRAFT'` (suggestedBy='USER') sont highlighted en amber
 * pour différencier visuellement (rare cas — surtout pour les watches en attente
 * de revue côté ADMIN/MANAGER hors workflow inbox auto).
 */

import type { RegulatoryWatch } from '@prisma/client';
import { ExploitationCell } from './exploitation-cell';
import { VeilleRowActions } from './veille-row-actions';

interface VeilleTableProps {
  watches: RegulatoryWatch[];
  canEdit: boolean;
}

export function VeilleTable({ watches, canEdit }: VeilleTableProps) {
  if (watches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucune source pour ce thème.
        </p>
        {canEdit && (
          <p className="text-xs text-muted-foreground mt-1">
            Cliquez sur « Ajouter une source » pour commencer.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Titre</th>
            <th className="px-3 py-2 font-semibold">Source / Type</th>
            <th className="px-3 py-2 font-semibold">Responsable</th>
            <th className="px-3 py-2 font-semibold">Fréquence</th>
            <th className="px-3 py-2 font-semibold w-1/3">Exploitation</th>
            {canEdit && (
              <th className="px-3 py-2 font-semibold w-12 text-right">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {watches.map((w) => (
            <tr
              key={w.id}
              className={
                w.status === 'DRAFT'
                  ? 'border-t border-border bg-amber-50/50'
                  : 'border-t border-border'
              }
            >
              <td className="px-3 py-2.5 font-medium align-top">
                {w.url ? (
                  <a
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:underline break-words"
                  >
                    {w.title}
                  </a>
                ) : (
                  <span className="break-words">{w.title}</span>
                )}
                {w.status === 'DRAFT' && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                    Brouillon
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground align-top">
                <div className="space-y-0.5">
                  {w.source && <div>{w.source}</div>}
                  {w.typeSource && (
                    <div className="text-xs">{w.typeSource}</div>
                  )}
                  {!w.source && !w.typeSource && <span>—</span>}
                </div>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground align-top">
                {w.responsable ?? <span className="text-muted-foreground/60">—</span>}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground align-top">
                {w.frequency ?? <span className="text-muted-foreground/60">—</span>}
              </td>
              <td className="px-3 py-2.5 align-top">
                {canEdit ? (
                  <ExploitationCell id={w.id} value={w.exploitation} />
                ) : (
                  <p
                    className={
                      w.exploitation
                        ? 'text-sm'
                        : 'text-sm text-muted-foreground italic'
                    }
                  >
                    {w.exploitation ?? '—'}
                  </p>
                )}
              </td>
              {canEdit && (
                <td className="px-3 py-2.5 align-top text-right">
                  <VeilleRowActions watch={w} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
