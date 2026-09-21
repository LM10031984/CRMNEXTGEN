'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordExternalAgeficeDeposit } from '@/server/actions/agefice-external-deposit';
import { parisDay } from '@/lib/alertes/formation-rules';

export type ExternalDepositSnapshot = {
  id: string;
  updatedAt: string;
  sentAt: string | null;
  deliveryMethod: string;
  externalSender: string | null;
  recipientEmail: string | null;
};

export function ExternalDepositTracker({
  participantId,
  stage,
  current,
  canWrite,
  userName,
}: {
  participantId: string;
  stage: 'PRISE_EN_CHARGE' | 'FIN_FORMATION';
  current: ExternalDepositSnapshot | null;
  canWrite: boolean;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current?.sentAt?.slice(0, 10) ?? parisDay(new Date()));
  const [sender, setSender] = useState(current?.externalSender ?? userName);
  const [recipient, setRecipient] = useState(current?.recipientEmail ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const router = useRouter();
  const label = stage === 'PRISE_EN_CHARGE' ? 'demande initiale' : 'demande de remboursement';
  async function save(clear = false) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError('');
    try {
      const result = await recordExternalAgeficeDeposit({
        participantId,
        stage,
        date,
        sender,
        recipientEmail: recipient,
        expectedId: current?.id ?? null,
        expectedUpdatedAt: current?.updatedAt ?? null,
        clear,
      });
      if (!result.ok) {
        setError(result.error ?? 'Enregistrement impossible.');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Enregistrement non confirmé. Rechargez la page avant de réessayer.');
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return (
    <div className="space-y-2 text-xs">
      {current && (
        <p>
          {current.deliveryMethod === 'EXTERNAL'
            ? `Envoyé hors QualiOF — ${label}`
            : `Envoyé depuis QualiOF — ${label}`}
          {current.sentAt
            ? ` le ${new Date(current.sentAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`
            : ''}
          {current.externalSender ? ` par ${current.externalSender}` : ''}
        </p>
      )}
      {canWrite && (!current || current.deliveryMethod === 'EXTERNAL') && !open && (
        <button
          type="button"
          className="text-primary underline"
          onClick={() => {
            setDate(current?.sentAt?.slice(0, 10) ?? parisDay(new Date()));
            setSender(current?.externalSender ?? userName);
            setRecipient(current?.recipientEmail ?? '');
            setError('');
            setOpen(true);
          }}
        >
          {current
            ? `Corriger l’envoi externe (${label})`
            : `Déclarer un envoi hors QualiOF (${label})`}
        </button>
      )}
      {open && (
        <div className="space-y-2 rounded border bg-slate-50 p-3">
          <p>Enregistrez uniquement un envoi déjà effectué. Aucun e-mail ne sera envoyé.</p>
          <label className="block">
            Envoyé le
            <input
              aria-label={`Date d’envoi — ${label}`}
              type="date"
              className="ml-2 rounded border p-1"
              value={date}
              max={parisDay(new Date())}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
            />
          </label>
          <label className="block">
            Par
            <input
              aria-label={`Expéditeur — ${label}`}
              className="ml-2 rounded border p-1"
              maxLength={160}
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              disabled={pending}
            />
          </label>
          <label className="block">
            À (e-mail, facultatif)
            <input
              aria-label={`Destinataire — ${label}`}
              type="email"
              className="ml-2 rounded border p-1"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={pending}
            />
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending || !date || sender.trim().length < 2}
              onClick={() => save()}
              className="rounded bg-primary px-2 py-1 text-primary-foreground"
            >
              {pending ? 'Enregistrement…' : 'Enregistrer la déclaration'}
            </button>
            {current && (
              <button type="button" disabled={pending} onClick={() => save(true)}>
                Annuler cette déclaration
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => setOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
