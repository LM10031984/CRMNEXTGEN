'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { recordCompanyOpcoDeposit } from '@/server/actions/opco-deposit';
import { DEPOSITORS } from '@/lib/opco/company-dossier';
import { parisDay } from '@/lib/alertes/formation-rules';

export interface CompanyDepositMemberSnapshot {
  id: string;
  depositedAt: string | null;
  depositedBy: string | null;
}

export function CompanyDepositTracker({
  sessionId,
  sponsorOrgId,
  members,
  depositedAt,
  depositedBy,
  userEmail,
  canWrite,
  readyToDeposit = true,
}: {
  sessionId: string;
  sponsorOrgId: string;
  members: CompanyDepositMemberSnapshot[];
  depositedAt: string | null;
  depositedBy: string | null;
  userEmail: string;
  canWrite: boolean;
  readyToDeposit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(
    depositedBy ?? (DEPOSITORS.some((depositor) => depositor.email === userEmail) ? userEmail : ''),
  );
  const [date, setDate] = useState(depositedAt?.slice(0, 10) ?? parisDay(new Date()));
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();
  const depositor = DEPOSITORS.find((person) => person.email === depositedBy)?.name ?? depositedBy;

  async function save(clear = false) {
    // React 18 transitions do not track the lifetime of async server actions.
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await recordCompanyOpcoDeposit({
        sessionId,
        sponsorOrgId,
        expectedMembers: members,
        email: clear ? null : email,
        date: clear ? null : date,
      });
      if (!result.ok) {
        const message = result.error ?? 'Le dépôt n’a pas pu être enregistré.';
        setError(message);
        toast.error(message);
        return;
      }
      const message = clear
        ? 'Déclaration de dépôt annulée pour le groupe'
        : `Dépôt OPCO enregistré pour ${members.length} salarié${members.length > 1 ? 's' : ''}.`;
      setSuccess(message);
      setEditing(false);
      toast.success(message);
      router.refresh();
    } catch {
      const message =
        'Enregistrement non confirmé. Rechargez la page pour vérifier le dépôt avant de réessayer.';
      setError(message);
      toast.error(message);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 text-xs" aria-busy={pending}>
      {success && (
        <p role="status" className="text-emerald-700">
          {success}
        </p>
      )}
      {depositedAt && (
        <p className="text-emerald-700">
          Déposé le{' '}
          {new Date(depositedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
          {depositor ? ` par ${depositor}` : ''}
        </p>
      )}
      {canWrite && !editing && (
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => {
            setEmail(
              depositedBy ??
                (DEPOSITORS.some((person) => person.email === userEmail) ? userEmail : ''),
            );
            setDate(depositedAt?.slice(0, 10) ?? parisDay(new Date()));
            setError(null);
            setSuccess(null);
            setEditing(true);
          }}
        >
          {depositedAt ? 'Corriger la déclaration du groupe' : 'Déclarer le dépôt du groupe'}
        </button>
      )}
      {canWrite && editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
          <label>
            Déposé par{' '}
            <select
              aria-label="Déposé par"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded border p-1"
              disabled={pending}
            >
              <option value="">Choisir…</option>
              {DEPOSITORS.map((person) => (
                <option key={person.email} value={person.email}>
                  {person.name} — {person.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date{' '}
            <input
              aria-label="Date du dépôt"
              type="date"
              value={date}
              max={parisDay(new Date())}
              onChange={(event) => setDate(event.target.value)}
              className="rounded border p-1"
              disabled={pending}
            />
          </label>
          <button
            type="button"
            className="rounded bg-primary px-2 py-1 text-primary-foreground"
            disabled={pending || !email || !date || !readyToDeposit}
            onClick={() => save()}
          >
            {pending
              ? 'Enregistrement en cours…'
              : `Confirmer pour ${members.length} salarié${members.length > 1 ? 's' : ''}`}
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
          {error && (
            <p role="alert" className="w-full text-red-700">
              {error}
            </p>
          )}
          <p className="w-full text-muted-foreground">
            À utiliser après le dépôt sur le portail OPCO. Cette déclaration ne vaut pas accord de
            financement.
          </p>
          {!readyToDeposit && (
            <p className="w-full text-amber-800">
              La déclaration sera disponible après ajout de la convention signée et du programme
              dans Qualiof. Une déclaration existante peut toujours être corrigée ou annulée.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
