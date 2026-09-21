'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { recordOpcoDeposit } from '@/server/actions/opco-deposit';
import { DepositorField } from '@/components/dossiers-opco/depositor-field';
import { parisDay } from '@/lib/alertes/formation-rules';

export function DepositTracker({
  participantId,
  depositedAt,
  depositedBy,
  userEmail,
  canWrite,
}: {
  participantId: string;
  depositedAt: string | null;
  depositedBy: string | null;
  userEmail: string;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(depositedBy ?? userEmail);
  const [date, setDate] = useState(depositedAt?.slice(0, 10) ?? parisDay(new Date()));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const depositor = depositedBy;
  function save(clear = false) {
    startTransition(async () => {
      try {
        const result = await recordOpcoDeposit({
          participantId,
          email: clear ? null : email,
          date: clear ? null : date,
          expectedAt: depositedAt,
          expectedBy: depositedBy,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(clear ? 'Déclaration de dépôt annulée' : 'Dépôt OPCO enregistré');
        setEditing(false);
        router.refresh();
      } catch {
        toast.error('Enregistrement impossible. Rechargez la page avant de réessayer.');
      }
    });
  }
  return (
    <div className="mt-2 rounded-lg border p-2 text-xs space-y-2">
      <p className={depositedAt ? 'text-emerald-700' : 'text-amber-700'}>
        {depositedAt
          ? `Déposé le ${new Date(depositedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} par ${depositor}`
          : 'Dépôt OPCO à confirmer'}
      </p>
      {canWrite && !editing && (
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => setEditing(true)}
        >
          {depositedAt ? 'Corriger le dépôt' : 'Déclarer le dépôt OPCO'}
        </button>
      )}
      {canWrite && editing && (
        <div className="flex flex-wrap items-center gap-2">
          <label>
            Déposé par <DepositorField value={email} onChange={setEmail} disabled={pending} />
          </label>
          <label>
            Date du dépôt{' '}
            <input
              aria-label="Date du dépôt"
              type="date"
              value={date}
              max={parisDay(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded p-1"
              disabled={pending}
            />
          </label>
          <button
            type="button"
            className="rounded bg-primary text-primary-foreground px-2 py-1"
            disabled={pending || !email || !date}
            onClick={() => save()}
          >
            Confirmer le dépôt
          </button>
          {depositedAt && (
            <button
              type="button"
              className="underline"
              disabled={pending}
              onClick={() => save(true)}
            >
              Annuler la déclaration
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => setEditing(false)}>
            Fermer
          </button>
          <p className="w-full text-muted-foreground">
            À confirmer après le dépôt sur le portail OPCO. Cela ne vaut pas accord de financement.
          </p>
        </div>
      )}
    </div>
  );
}
