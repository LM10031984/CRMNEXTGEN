'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteQuote } from '@/server/actions/quotes';

interface Props {
  quoteId: string;
  number: string;
  status: string;
}

export function QuoteDeleteButton({ quoteId, number, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Supprimer définitivement le devis ${number} ?`)) return;
    startTransition(async () => {
      const r = await deleteQuote(quoteId);
      if (r.ok) {
        toast.success(`Devis ${number} supprimé`);
        router.push('/app/devis');
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      title={status === 'ACCEPTED' ? 'Devis accepté — non supprimable' : 'Supprimer le devis'}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
