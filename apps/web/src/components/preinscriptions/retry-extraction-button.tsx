'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { retriggerExtraction } from '@/server/actions/preinscription-public';

export function RetryExtractionButton({ preEnrollmentId }: { preEnrollmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const r = await retriggerExtraction(preEnrollmentId);
      if (r.ok) {
        // L'extraction tourne en arrière-plan ~10-30s. On rafraîchit
        // 4 fois sur 30s pour voir le résultat apparaître au fil de l'eau.
        let count = 0;
        const interval = setInterval(() => {
          count += 1;
          router.refresh();
          if (count >= 4) {
            clearInterval(interval);
            setBusy(false);
          }
        }, 7500);
      } else {
        alert(`Erreur : ${r.error}`);
        setBusy(false);
      }
    } catch (e: any) {
      alert(`Erreur : ${e?.message ?? e}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted disabled:opacity-50"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
      {busy ? 'Extraction en cours…' : "Relancer l'extraction"}
    </button>
  );
}
