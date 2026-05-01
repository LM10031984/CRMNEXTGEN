'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteSession } from '@/server/actions/sessions';

export function DeleteSessionButton({
  sessionId,
  sessionCode,
  participantCount,
}: {
  sessionId: string;
  sessionCode: string;
  participantCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const msg =
      participantCount > 0
        ? `Cette session a ${participantCount} inscrit(s). Supprimer la session supprimera aussi toutes les inscriptions. Continuer ?`
        : `Supprimer la session ${sessionCode} ?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r = await deleteSession(sessionId);
      if (r.ok) {
        toast.success(`Session ${sessionCode} supprimée`);
        router.push('/app/sessions');
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
      {busy ? 'Suppression…' : 'Supprimer la session'}
    </button>
  );
}
