'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { editLead, addLeadActivity } from '@/server/actions/lead-fiche';
import { STATUTS, RESULTATS, MOTIFS_PERTE, TYPES_ACTIVITE } from '@/lib/leads/suivi';

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-sm disabled:bg-muted';
const buttonClass =
  'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50';
type Schedule = {
  status: string;
  nextAction: string | null;
  nextActionAt: string | null;
  lossReason: string | null;
};
export type EditableLead = Schedule & {
  id: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  city: string | null;
  organizationId: string | null;
  ownerUserId: string | null;
  priority: string;
  notes: string | null;
  personId: string | null;
};
// L’heure affichée est locale au navigateur ; seul l’ISO avec fuseau part au serveur.
function localDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formObject(form: HTMLFormElement) {
  const data = Object.fromEntries(new FormData(form));
  for (const key of ['occurredAt', 'nextActionAt'])
    if (typeof data[key] === 'string' && data[key])
      data[key] = new Date(data[key] as string).toISOString();
  return data;
}
function Field({
  label,
  name,
  value,
  type = 'text',
  required = false,
  disabled = false,
}: {
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <input
        className={inputClass}
        name={name}
        defaultValue={value ?? ''}
        type={type}
        required={required}
        readOnly={disabled}
      />
    </label>
  );
}
function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: Record<string, string>;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <select className={inputClass} name={name} defaultValue={value ?? ''}>
        {Object.entries(options).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
function ScheduleFields({ lead }: { lead: Schedule }) {
  return (
    <>
      <Select label="Statut après l’action" name="status" value={lead.status} options={STATUTS} />
      <Select
        label="Motif de perte (si Perdu)"
        name="lossReason"
        value={lead.lossReason}
        options={{ '': 'Choisir si perdu', ...MOTIFS_PERTE }}
      />
      <Field label="Prochaine action" name="nextAction" value={lead.nextAction} />
      <Field
        label="Date et heure de prochaine action"
        name="nextActionAt"
        value={localDate(lead.nextActionAt)}
        type="datetime-local"
      />
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Pour un lead ouvert, indiquez une prochaine action et sa date. Un lead perdu nécessite un
        motif. Les dates sont affichées dans votre fuseau local.
      </p>
    </>
  );
}

export function EditLeadForm({
  lead,
  organizations,
  owners,
}: {
  lead: EditableLead;
  organizations: Array<{ id: string; label: string }>;
  owners: Array<{ id: string; label: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const values = formObject(e.currentTarget);
        start(async () => {
          setError('');
          try {
            const r = await editLead(lead.id, { ...values, updatedAt: lead.updatedAt });
            if (!r.ok) setError(r.error);
            else {
              router.push(`/app/leads/${lead.id}` as any);
              router.refresh();
            }
          } catch {
            setError('Enregistrement impossible. Réessayez.');
          }
        });
      }}
    >
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Prénom"
          name="firstName"
          value={lead.firstName}
          required={!lead.personId}
          disabled={!!lead.personId}
        />
        <Field
          label="Nom"
          name="lastName"
          value={lead.lastName}
          required={!lead.personId}
          disabled={!!lead.personId}
        />
        {lead.personId && (
          <p className="text-sm sm:col-span-2">
            L’identité est gérée dans la fiche apprenant liée. Les coordonnées ci-dessous concernent
            le suivi commercial.
          </p>
        )}
        <Field label="Email" name="email" value={lead.email} type="email" />
        <Field label="Téléphone" name="phone" value={lead.phone} type="tel" />
        <Field label="Fonction" name="jobTitle" value={lead.jobTitle} />
        <Field label="Ville / secteur" name="city" value={lead.city} />
        <Select
          label="Agence / point de vente"
          name="organizationId"
          value={lead.organizationId}
          options={{
            '': 'Agence à rattacher',
            ...Object.fromEntries(organizations.map((o) => [o.id, o.label])),
          }}
        />
        <Select
          label="Commercial chargé du suivi"
          name="ownerUserId"
          value={lead.ownerUserId}
          options={{ '': 'Non assigné', ...Object.fromEntries(owners.map((o) => [o.id, o.label])) }}
        />
        <Select
          label="Priorité"
          name="priority"
          value={lead.priority}
          options={{ LOW: 'Basse', MEDIUM: 'Normale', HIGH: 'Haute', URGENT: 'Urgente' }}
        />
        <div />
        <ScheduleFields lead={lead} />
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span>Notes de la fiche</span>
          <textarea
            name="notes"
            className={inputClass}
            rows={5}
            maxLength={10000}
            defaultValue={lead.notes ?? ''}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-4 items-center">
        <button className={buttonClass} disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>
        <Link href={`/app/leads/${lead.id}` as any} className="text-sm underline">
          Annuler
        </Link>
      </div>
    </form>
  );
}

export function LeadActivityForm({
  lead,
}: {
  lead: Schedule & { id: string; updatedAt: string; callCount: number };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [version, setVersion] = useState(0);
  const router = useRouter();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <form
      key={`${lead.updatedAt}-${version}`}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const values = formObject(e.currentTarget);
        start(async () => {
          setError('');
          setSuccess('');
          try {
            const r = await addLeadActivity(lead.id, {
              ...values,
              updatedAt: lead.updatedAt,
              requestId,
              durationSeconds: values.durationSeconds ? Number(values.durationSeconds) : null,
            });
            if (!r.ok) setError(r.error);
            else {
              setSuccess('Activité enregistrée.');
              setRequestId(crypto.randomUUID());
              setVersion((v) => v + 1);
              router.refresh();
            }
          } catch {
            setError(
              'Enregistrement impossible. Réessayez : la même activité ne sera pas créée deux fois.',
            );
          }
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        {lead.callCount} appel(s) enregistré(s). Consignez ici une action réalisée. Aucun email ou
        appel n’est envoyé par ce formulaire.
      </p>
      {lead.callCount >= 6 && (
        <p className="text-sm text-amber-800">
          À partir de l’appel 7 sans réponse, choisissez une relance longue, une qualification ou
          une perte motivée.
        </p>
      )}
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <Select label="Type d’activité" name="type" value="call" options={TYPES_ACTIVITE} />
        <Field
          label="Date et heure de l’activité"
          name="occurredAt"
          value={localDate(new Date().toISOString())}
          type="datetime-local"
          required
        />
        <Select
          label="Résultat de l’appel"
          name="outcome"
          options={{ '': 'Choisir un résultat', ...RESULTATS }}
        />
        <Field
          label="Durée de l’appel (secondes, facultatif)"
          name="durationSeconds"
          type="number"
        />
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span>Commentaire de l’activité</span>
          <textarea name="body" className={inputClass} rows={4} maxLength={10000} required />
        </label>
        <ScheduleFields lead={lead} />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-emerald-700">
          {success}
        </p>
      )}
      <button className={buttonClass} disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer l’activité'}
      </button>
    </form>
  );
}
