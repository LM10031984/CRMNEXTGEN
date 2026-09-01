'use client';

/**
 * Filet de rattrapage manuel des programmes du diagnostic du stand.
 *
 * Visible uniquement quand il reste quelque chose en attente : le mécanisme
 * normal (le navigateur du prospect déclenche son propre email) ne laisse
 * normalement rien derrière lui. Un compteur qui ne descend pas le lendemain
 * matin est le signal que quelque chose ne va pas — c'est aussi ce que ce
 * bouton sert à montrer.
 */

import { useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { envoyerProgrammesEnAttente } from '@/server/actions/diagnostic-admin';

export function ProgrammesEnAttenteButton({ enAttente }: { enAttente: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (enAttente === 0) return null;

  function run() {
    startTransition(async () => {
      const r = await envoyerProgrammesEnAttente();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.envoyees > 0) {
        toast.success(`${r.envoyees} programme${r.envoyees > 1 ? 's' : ''} envoyé${r.envoyees > 1 ? 's' : ''}`);
      } else if (r.suppressed > 0) {
        toast.warning(
          'Rien n’est parti : la catégorie « Programme du diagnostic express » est décochée dans Paramètres → Emails.',
        );
      } else if (r.echouees > 0) {
        toast.error(`${r.echouees} échec${r.echouees > 1 ? 's' : ''} — voir la fiche du lead.`);
      } else {
        toast.info('Aucun programme en attente');
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Envoie les programmes du diagnostic restés en attente (filet de rattrapage)"
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      Envoyer les programmes en attente ({enAttente})
    </button>
  );
}
