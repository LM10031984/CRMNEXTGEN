'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  deleteDiagnosticParticipant,
  upsertDiagnosticParticipant,
} from '@/server/actions/diagnostics';

/**
 * Grille équipe du chapitre 2 — une ligne par personne, saisie en 15 secondes.
 *
 * C'est CE modèle qui alimente le moteur budget : sans lui, aucune synthèse
 * financement, donc pas de démonstration en R1.
 *
 * PII : nom + production N-1 sont des données sensibles. Elles restent dans
 * l'application — jamais dans un lien public, un prompt IA ou un log (les
 * server actions ne journalisent que l'identifiant de la fiche).
 */

export interface TeamRow {
  id: string;
  displayName: string;
  statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
  fonction: string | null;
  caN1: number | null;
  opcoEligible: boolean | null;
  trainings24mFunded: number | null;
  wantsTraining: boolean | null;
  includedInProposal: boolean;
}

const STATUT_LABEL = {
  INDEPENDANT: 'Agent co. indépendant',
  SALARIE: 'Salarié',
  DIRIGEANT: 'Dirigeant',
} as const;

const CELL = 'px-2 py-1.5 rounded border border-border bg-background text-sm w-full';

export function TeamGrid({
  diagnosticId,
  rows,
  onChanged,
  disabled,
}: {
  diagnosticId: string;
  rows: TeamRow[];
  onChanged: () => void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Partial<TeamRow>>({ statut: 'INDEPENDANT' });

  function persist(row: Partial<TeamRow> & { displayName: string; statut: TeamRow['statut'] }) {
    startTransition(async () => {
      const r = await upsertDiagnosticParticipant({
        id: row.id,
        diagnosticId,
        displayName: row.displayName,
        statut: row.statut,
        fonction: row.fonction ?? '',
        caN1: row.caN1 ?? null,
        opcoEligible: row.opcoEligible ?? undefined,
        trainings24mFunded: row.trainings24mFunded ?? null,
        wantsTraining: row.wantsTraining ?? undefined,
        includedInProposal: row.includedInProposal ?? true,
      });
      if (r.ok) onChanged();
      else toast.error(r.error);
    });
  }

  function addRow() {
    if (!draft.displayName?.trim()) {
      toast.error('Un nom est nécessaire pour ajouter une ligne.');
      return;
    }
    persist({
      displayName: draft.displayName.trim(),
      statut: draft.statut ?? 'INDEPENDANT',
      caN1: draft.caN1 ?? null,
      includedInProposal: true,
    });
    setDraft({ statut: draft.statut ?? 'INDEPENDANT' });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteDiagnosticParticipant(diagnosticId, id);
      if (r.ok) onChanged();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-1 min-w-[720px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground text-left">
              <th className="font-medium px-2">Nom</th>
              <th className="font-medium px-2 w-48">Statut</th>
              <th className="font-medium px-2 w-36">Production N-1</th>
              <th className="font-medium px-2 w-36">Financé 24 mois</th>
              <th className="font-medium px-2 w-20 text-center">Inclus</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.includedInProposal ? '' : 'opacity-50'}>
                <td className="px-2">
                  <input
                    className={CELL}
                    defaultValue={row.displayName}
                    disabled={disabled}
                    onBlur={(e) =>
                      e.target.value.trim() !== row.displayName &&
                      persist({ ...row, displayName: e.target.value.trim() })
                    }
                  />
                </td>
                <td className="px-2">
                  <select
                    className={CELL}
                    defaultValue={row.statut}
                    disabled={disabled}
                    onChange={(e) =>
                      persist({ ...row, statut: e.target.value as TeamRow['statut'] })
                    }
                  >
                    {Object.entries(STATUT_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2">
                  <input
                    className={`${CELL} tabular-nums`}
                    inputMode="decimal"
                    placeholder={row.statut === 'SALARIE' ? '—' : 'ex. 120 000'}
                    defaultValue={row.caN1 ?? ''}
                    disabled={disabled || row.statut === 'SALARIE'}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      persist({ ...row, caN1: v === '' ? null : (v as unknown as number) });
                    }}
                  />
                </td>
                <td className="px-2">
                  <input
                    className={`${CELL} tabular-nums`}
                    inputMode="decimal"
                    placeholder="ex. 0"
                    defaultValue={row.trainings24mFunded ?? ''}
                    disabled={disabled}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      persist({
                        ...row,
                        trainings24mFunded: v === '' ? null : (v as unknown as number),
                      });
                    }}
                  />
                </td>
                <td className="px-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.includedInProposal}
                    disabled={disabled}
                    onChange={(e) => persist({ ...row, includedInProposal: e.target.checked })}
                    aria-label={`Inclure ${row.displayName} dans la proposition`}
                  />
                </td>
                <td className="px-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    disabled={disabled}
                    className="text-muted-foreground hover:text-red-600 disabled:opacity-40"
                    aria-label={`Retirer ${row.displayName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}

            <tr>
              <td className="px-2">
                <input
                  className={CELL}
                  placeholder="Nom de la personne"
                  value={draft.displayName ?? ''}
                  disabled={disabled}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addRow()}
                />
              </td>
              <td className="px-2">
                <select
                  className={CELL}
                  value={draft.statut ?? 'INDEPENDANT'}
                  disabled={disabled}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, statut: e.target.value as TeamRow['statut'] }))
                  }
                >
                  {Object.entries(STATUT_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2">
                <input
                  className={`${CELL} tabular-nums`}
                  inputMode="decimal"
                  placeholder="ex. 120 000"
                  value={(draft.caN1 as unknown as string) ?? ''}
                  disabled={disabled || draft.statut === 'SALARIE'}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, caN1: e.target.value as unknown as number }))
                  }
                  onKeyDown={(e) => e.key === 'Enter' && addRow()}
                />
              </td>
              <td className="px-2" colSpan={2}>
                <button
                  type="button"
                  onClick={addRow}
                  disabled={disabled || pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Ajouter
                </button>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          Une ligne par personne à former. La production N-1 des indépendants pilote leurs droits
          AGEFICE.
        </p>
      )}
    </div>
  );
}
