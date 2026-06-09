'use client';

import type { LeadStatus } from '@qualiof/db';
import { updateLeadStatus } from '@/server/actions/leads';
import { useServerAction } from '@/lib/hooks/use-server-action';

/**
 * Select inline statut Lead (Phase 9 Plan 09-03 — LEAD-02).
 *
 * 9 statuts (LeadStatus enum Prisma). P3.1 — Migré sur `useServerAction`
 * avec optimistic UI : le label du statut change INSTANTANÉMENT au
 * onChange, sans attendre la résolution serveur. Si la server action
 * retourne `{ ok: false }`, useOptimistic rollback automatiquement à la
 * fermeture de la transition (et un toast d'erreur s'affiche).
 *
 * `wonAt` est set/reset automatiquement par la server action (Pitfall 3
 * Plan 09-02).
 */

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Nouveau',
  CONTACTED: 'Contacté',
  QUALIFIED: 'Qualifié',
  PROPOSAL_SENT: 'Proposition envoyée',
  NEGOTIATION: 'Négociation',
  WON: 'Gagné',
  LOST: 'Perdu',
  ON_HOLD: 'En attente',
  TO_FOLLOWUP: 'À relancer',
};

export function LeadStatusSelect({
  leadId,
  current,
}: {
  leadId: string;
  current: LeadStatus;
}) {
  const { execute, pending, optimistic } = useServerAction({
    action: (newStatus: LeadStatus) => updateLeadStatus(leadId, newStatus),
    optimisticInitial: current,
    optimisticReducer: (_state, [newStatus]) => newStatus,
    successMessage: ([newStatus]) => `Statut : ${STATUS_LABELS[newStatus]}`,
  });

  return (
    <select
      value={optimistic}
      disabled={pending}
      aria-label="Statut du lead"
      onChange={(e) => execute(e.target.value as LeadStatus)}
      className="px-2 py-1 rounded-md border border-border bg-white text-sm disabled:opacity-50"
    >
      {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
