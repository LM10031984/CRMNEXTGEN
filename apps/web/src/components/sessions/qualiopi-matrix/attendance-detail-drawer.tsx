'use client';

/**
 * Phase 9.1 Plan 03 Task 2 — `<AttendanceDetailDrawer>` (Client Component).
 *
 * Radix Dialog modale CENTRÉE (NOT slide-over — RESEARCH Finding 3 Option B).
 * Width `w-[640px] max-w-[90vw] max-h-[80vh] overflow-y-auto`.
 *
 * Structure :
 *   - Dialog.Title : "Émargement détaillé"
 *   - Subtitle : `{Prénom NOM} · {sessionCode}`
 *   - Body : table (Date / Matin / Après-midi)
 *     - signé   → bg-emerald-50 text-emerald-700 + Check + timestamp
 *     - non signé → bg-amber-50 text-amber-700 + AlertTriangle
 *     - pas de slot → bg-slate-50 text-slate-400 + Minus
 *   - Footer (sticky top) : `{signedCount}/{totalSlots} demi-journées signées` + Fermer
 *
 * Charge les données via `getParticipantAttendance` server action quand `open` passe à true
 * (lazy load — ne fetch pas tant que le drawer reste fermé).
 */

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, AlertTriangle, Minus, Loader2 } from 'lucide-react';
import {
  getParticipantAttendance,
  type AttendanceSlot,
} from '@/server/actions/attendance-detail';

export interface AttendanceDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  sessionId: string;
  participantName?: string;
  sessionCode?: string;
}

export function AttendanceDetailDrawer({
  open,
  onOpenChange,
  participantId,
  sessionId,
  participantName,
  sessionCode,
}: AttendanceDetailDrawerProps) {
  const [slots, setSlots] = useState<AttendanceSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getParticipantAttendance(participantId, sessionId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setSlots(res.slots);
        } else {
          setError(res.error);
          setSlots(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Impossible de charger l'émargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, participantId, sessionId]);

  // Groupe par date : map<date, { AM?, PM?, FULL? }>
  const byDate = new Map<string, { AM?: AttendanceSlot; PM?: AttendanceSlot; FULL?: AttendanceSlot }>();
  for (const s of slots ?? []) {
    const row = byDate.get(s.date) ?? {};
    row[s.period] = s;
    byDate.set(s.date, row);
  }
  const dates = Array.from(byDate.keys());

  const signedCount = (slots ?? []).filter((s) => s.signedAt !== null).length;
  const totalSlots = (slots ?? []).length;

  function renderCell(slot: AttendanceSlot | undefined) {
    if (!slot) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 text-slate-400 text-xs">
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          Pas de slot
        </span>
      );
    }
    if (slot.signedAt !== null) {
      const t = new Date(slot.signedAt);
      const hh = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Signé {hh}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-xs">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Non signé
      </span>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-[90vw] max-h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-2xl z-50 data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <div className="sticky top-0 bg-white border-b border-border px-6 py-4 z-10">
            <Dialog.Title className="text-lg font-semibold">Émargement détaillé</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1">
              {participantName ?? 'Participant'}
              {sessionCode ? ` · ${sessionCode}` : ''}
            </Dialog.Description>
          </div>

          <div className="px-6 py-4">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Chargement de l'émargement…
              </div>
            )}

            {error && (
              <div className="rounded border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {!loading && !error && slots !== null && (
              <>
                {slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Aucun créneau enregistré
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">Date</th>
                        <th className="px-2 py-2 font-semibold">Matin</th>
                        <th className="px-2 py-2 font-semibold">Après-midi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dates.map((d) => {
                        const row = byDate.get(d)!;
                        const dateFR = new Date(d).toLocaleDateString('fr-FR');
                        return (
                          <tr key={d}>
                            <td className="px-2 py-2 tabular-nums">{dateFR}</td>
                            <td className="px-2 py-2">{renderCell(row.AM ?? row.FULL)}</td>
                            <td className="px-2 py-2">{renderCell(row.PM ?? row.FULL)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-border px-6 py-3 flex items-center justify-between z-10">
            <span className="text-sm text-muted-foreground tabular-nums">
              {signedCount}/{totalSlots} demi-journées signées
            </span>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-white hover:bg-muted/40"
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
