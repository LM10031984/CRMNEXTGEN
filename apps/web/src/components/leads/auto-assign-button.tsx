'use client';

import { useState, useTransition } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { autoAssignUnassignedLeads } from '@/server/actions/auto-assign-leads';

interface Props {
  unassignedCount: number;
}

export function AutoAssignLeadsButton({ unassignedCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    assigned: number;
    loadByCommercial: { name: string; loadBefore: number; loadAfter: number }[];
  } | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await autoAssignUnassignedLeads();
      if (!r.ok) {
        toast.error('Erreur lors de l\'auto-assignation');
        return;
      }
      if (r.assigned === 0) {
        toast.info(
          r.totalCandidates === 0
            ? 'Aucun lead non assigné'
            : 'Aucun commercial disponible (vérifie les rôles utilisateurs)',
        );
      } else {
        toast.success(`${r.assigned} lead${r.assigned > 1 ? 's' : ''} assigné${r.assigned > 1 ? 's' : ''}`);
      }
      setResult({
        assigned: r.assigned,
        loadByCommercial: r.loadByCommercial,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending || unassignedCount === 0}
        title={unassignedCount === 0 ? 'Aucun lead non assigné' : 'Distribue les leads aux commerciaux (round-robin équilibré)'}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Auto-assigner ({unassignedCount})
      </button>
      {result && result.loadByCommercial.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Charge :{' '}
          {result.loadByCommercial
            .map((c) => `${c.name} ${c.loadBefore}→${c.loadAfter}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
