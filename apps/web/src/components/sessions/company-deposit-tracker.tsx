'use client';

import { useState, useTransition } from 'react';
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
}: {
  sessionId: string;
  sponsorOrgId: string;
  members: CompanyDepositMemberSnapshot[];
  depositedAt: string | null;
  depositedBy: string | null;
  userEmail: string;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(
    depositedBy ?? (DEPOSITORS.some((depositor) => depositor.email === userEmail) ? userEmail : ''),
  );
  const [date, setDate] = useState(depositedAt?.slice(0, 10) ?? parisDay(new Date()));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const depositor = DEPOSITORS.find((person) => person.email === depositedBy)?.name ?? depositedBy;

  function save(clear = false) {
    startTransition(async () => {
      try {
        const result = await recordCompanyOpcoDeposit({
          sessionId,
          sponsorOrgId,
          expectedMembers: members,
          email: clear ? null : email,
          date: clear ? null : date,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          clear
            ? 'Déclaration de dépôt annulée pour le groupe'
            : 'Dépôt OPCO enregistré pour le groupe',
        );
        setEditing(false);
        router.refresh();
      } catch {
        toast.error('Enregistrement impossible. Rechargez la page avant de réessayer.');
      }
    });
  }

  return (
    <div className="space-y-2 text-xs">
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
          onClick={() => setEditing(true)}
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
            disabled={pending || !email || !date}
            onClick={() => save()}
          >
            Confirmer pour {members.length} salarié{members.length > 1 ? 's' : ''}
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
            À utiliser après le dépôt sur le portail OPCO. Cette déclaration ne vaut pas accord de
            financement.
          </p>
        </div>
      )}
    </div>
  );
}
