'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { createInvoiceForSponsorGroup } from '@/server/actions/invoices';

export function CreateSponsorInvoiceButton({
  sessionId,
  sponsorOrgId,
  sponsorName,
  participantCount,
  totalHT,
  allInvoiced,
}: {
  sessionId: string;
  sponsorOrgId: string;
  sponsorName: string;
  participantCount: number;
  totalHT: number;
  allInvoiced: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (allInvoiced) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
        <Receipt className="h-3.5 w-3.5" />
        Tous facturés
      </span>
    );
  }

  async function onClick() {
    const label =
      participantCount === 1
        ? `Émettre la facture pour ${sponsorName} (${totalHT.toFixed(2)} € HT) ?`
        : `Émettre 1 facture groupée pour ${sponsorName} regroupant ${participantCount} apprenants (${totalHT.toFixed(2)} € HT) ?`;
    if (!window.confirm(label)) return;
    setBusy(true);
    try {
      const r = await createInvoiceForSponsorGroup({ sessionId, sponsorOrgId });
      if (r.ok) {
        router.refresh();
      } else {
        alert(`Erreur : ${r.error}`);
      }
    } catch (e: any) {
      alert(`Erreur : ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
    >
      <Receipt className="h-3.5 w-3.5" />
      {busy
        ? 'Génération…'
        : participantCount === 1
          ? 'Émettre la facture'
          : `Émettre la facture groupée (${participantCount})`}
    </button>
  );
}
