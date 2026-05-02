'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteTrainer } from '@/server/actions/crud-edits';

export function DeleteTrainerButton({
  personId,
  fullName,
}: {
  personId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(`Supprimer le formateur ${fullName} ?\n\nCette action est irréversible. Si le formateur a des sessions affectées, la suppression sera bloquée.`)) {
      return;
    }
    setBusy(true);
    try {
      const r = await deleteTrainer(personId);
      if (r.ok) {
        toast.success(`Formateur ${fullName} supprimé`);
        router.push('/app/formateurs');
      } else {
        toast.error(r.error ?? 'Erreur lors de la suppression');
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message ?? e}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {busy ? 'Suppression…' : 'Supprimer'}
    </button>
  );
}
