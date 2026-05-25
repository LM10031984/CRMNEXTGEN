'use client';

import { useState, useTransition } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { sendBulkPreEnrollmentReminders } from '@/server/actions/preinscription-reminders';

interface Props {
  pendingCount: number;
}

export function BulkRemindersButton({ pendingCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    startTransition(async () => {
      const r = await sendBulkPreEnrollmentReminders();
      if (!r.ok) {
        toast.error('Erreur lors de l\'envoi des relances');
        return;
      }
      const dryRunNote = r.dryRun ? ' (mode test — SMTP non configuré)' : '';
      if (r.sent === 0) {
        toast.info(
          r.totalCandidates === 0
            ? 'Aucune pré-inscription éligible à une relance'
            : `Aucun envoi : ${r.skipped} skip${r.errors ? `, ${r.errors} erreur(s)` : ''}`,
        );
      } else if (r.errors > 0) {
        toast.warning(`Partiel : ${r.sent} envoyé(s), ${r.errors} erreur(s)${dryRunNote}`);
      } else {
        toast.success(`${r.sent} relance${r.sent > 1 ? 's' : ''} envoyée${r.sent > 1 ? 's' : ''}${dryRunNote}`);
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pendingCount === 0}
        title={
          pendingCount === 0
            ? 'Aucune pré-inscription en attente'
            : 'Envoyer une relance à tous les liens > 7 jours sans soumission'
        }
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Bell className="h-4 w-4" /> Relancer en attente
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => !pending && setOpen(false)}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Relancer les pré-inscriptions</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Envoie une relance email à toutes les pré-inscriptions <strong>PENDING_FORM</strong> :
        </p>
        <ul className="text-sm space-y-1 mb-4 ml-4 list-disc text-muted-foreground">
          <li>Plus de 7 jours sans soumission</li>
          <li>Lien encore valide (non expiré)</li>
          <li>Moins de 3 relances déjà envoyées</li>
          <li>Dernière relance &gt; 6 jours (anti-spam)</li>
        </ul>
        <p className="text-xs text-muted-foreground italic mb-4">
          Si SMTP n'est pas configuré (.env), la relance tourne en mode test (log only).
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border bg-white text-sm hover:bg-muted/40 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Envoyer
          </button>
        </div>
      </div>
    </>
  );
}
