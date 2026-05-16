'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { LeadStatus } from '@qualiof/db';
import { updateLeadStatus } from '@/server/actions/leads';

/**
 * Select inline statut Lead (Phase 9 Plan 09-03 — LEAD-02).
 *
 * 9 statuts (LeadStatus enum Prisma). Au changement :
 *  1. `updateLeadStatus(leadId, newStatus)` (server action Plan 09-02).
 *  2. `wonAt` est set/reset automatiquement par la server action (Pitfall 3).
 *  3. Toast confirmation + `router.refresh()` (revalidate fiche).
 *
 * Pendant la transition, le select est `disabled` pour éviter une double-soumission.
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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      defaultValue={current}
      disabled={pending}
      aria-label="Statut du lead"
      onChange={(e) => {
        const v = e.target.value as LeadStatus;
        startTransition(async () => {
          const r = await updateLeadStatus(leadId, v);
          if (r.ok) {
            toast.success(`Statut : ${STATUS_LABELS[v]}`);
            router.refresh();
          } else {
            toast.error(r.error ?? 'Erreur');
          }
        });
      }}
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
