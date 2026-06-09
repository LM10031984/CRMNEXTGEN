'use client';

import { useTransition } from 'react';
import { Receipt, BadgeCheck, Banknote, Wallet, Mail, X, Loader2, Tag, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useDossierSelection } from './selection-context';
import {
  bulkToggleDossierField,
  bulkSendDossierReminders,
  bulkSetDossierType,
} from '@/server/actions/dossiers-opco-bulk';

type Field = 'invoiceSent' | 'opcoApproved' | 'opcoReimbursed' | 'paymentReceived';

const ACTIONS: { field: Field; label: string; icon: typeof Receipt }[] = [
  { field: 'invoiceSent', label: 'Facturé', icon: Receipt },
  { field: 'opcoApproved', label: 'Validé OPCO', icon: BadgeCheck },
  { field: 'opcoReimbursed', label: 'Remboursé OPCO', icon: Banknote },
  { field: 'paymentReceived', label: 'Payé client', icon: Wallet },
];

export function DossierSelectionBar() {
  const { selected, count, clear } = useDossierSelection();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;
  const ids = Array.from(selected);

  function runToggle(field: Field) {
    startTransition(async () => {
      const r = await bulkToggleDossierField(ids, field, true);
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur action en lot');
        return;
      }
      toast.success(
        `${r.updated} dossier${r.updated > 1 ? 's' : ''} marqué${r.updated > 1 ? 's' : ''} comme ${ACTIONS.find((a) => a.field === field)?.label.toLowerCase()}` +
          (r.skipped > 0 ? ` (${r.skipped} déjà à jour)` : ''),
      );
      clear();
      router.refresh();
    });
  }

  function runSetType(next: 'FORMATION' | 'PREINSCRIPTION_BUDGET') {
    startTransition(async () => {
      const r = await bulkSetDossierType(ids, next);
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur changement type');
        return;
      }
      const label = next === 'PREINSCRIPTION_BUDGET' ? 'pré-inscription budget' : 'formation';
      toast.success(
        `${r.updated} dossier${r.updated > 1 ? 's' : ''} marqué${r.updated > 1 ? 's' : ''} comme ${label}` +
          (r.skipped > 0 ? ` (${r.skipped} déjà à jour)` : ''),
      );
      clear();
      router.refresh();
    });
  }

  function runReminders() {
    startTransition(async () => {
      const r = await bulkSendDossierReminders(ids);
      if (!r.ok) {
        toast.error('Erreur envoi relances');
        return;
      }
      const dryRunNote = r.dryRun ? ' (mode test SMTP)' : '';
      if (r.sent === 0) {
        toast.info(
          `Aucun envoi : ${r.skipped} dossier${r.skipped > 1 ? 's' : ''} non éligible${r.skipped > 1 ? 's' : ''} (facture non émise / dossier complet)`,
        );
      } else {
        toast.success(
          `${r.sent} relance${r.sent > 1 ? 's' : ''} envoyée${r.sent > 1 ? 's' : ''}${r.skipped > 0 ? ` · ${r.skipped} skip` : ''}${dryRunNote}`,
        );
      }
      clear();
      router.refresh();
    });
  }

  return (
    <div className="fixed left-1/2 bottom-6 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-border bg-white shadow-lg px-3 py-2">
      <span className="text-sm font-medium px-2">
        {count} dossier{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </span>
      <span className="h-5 w-px bg-border" />
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.field}
            type="button"
            onClick={() => runToggle(a.field)}
            disabled={pending}
            title={`Marquer ${a.label.toLowerCase()} pour ${count} dossier(s)`}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
            {a.label}
          </button>
        );
      })}
      <span className="h-5 w-px bg-border" />
      <button
        type="button"
        onClick={() => runSetType('PREINSCRIPTION_BUDGET')}
        disabled={pending}
        title="Marquer comme pré-inscription budget (réservation OPCO sans formation calée)"
        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-50"
      >
        <Tag className="h-3 w-3" /> → Pré-inscription
      </button>
      <button
        type="button"
        onClick={() => runSetType('FORMATION')}
        disabled={pending}
        title="Marquer comme formation classique"
        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50"
      >
        <FileText className="h-3 w-3" /> → Formation
      </button>
      <span className="h-5 w-px bg-border" />
      <button
        type="button"
        onClick={runReminders}
        disabled={pending}
        title="Envoyer une relance email aux sponsors"
        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
      >
        <Mail className="h-3 w-3" /> Relancer
      </button>
      <span className="h-5 w-px bg-border" />
      <button
        type="button"
        onClick={clear}
        disabled={pending}
        title="Désélectionner"
        className="inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
