'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createDiagnostic } from '@/server/actions/diagnostics';

/**
 * Création d'un diagnostic.
 *
 * Deux entrées, jamais les deux à la fois : un lead déjà au CRM, ou le nom de
 * l'agence rencontrée — parce qu'en R1 on tombe souvent sur une agence qui
 * n'existe nulle part encore, et refaire la saisie plus tard est exactement ce
 * qu'on cherche à supprimer.
 */
export function NewDiagnosticForm({ leads }: { leads: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'lead' | 'nouveau'>(leads.length > 0 ? 'lead' : 'nouveau');
  const [variant, setVariant] = useState<'LEGER' | 'COMPLET'>('LEGER');
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await createDiagnostic({
        variant,
        ...(mode === 'lead'
          ? { leadId }
          : {
              newLeadCompanyName: company,
              newLeadContactLastName: contact || undefined,
              newLeadEmail: email || undefined,
              newLeadPhone: phone || undefined,
            }),
      });
      if (r.ok && r.data) {
        toast.success(`${r.data.reference} créé`);
        router.push(`/app/diagnostics/${r.data.diagnosticId}` as Route);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  const input =
    'w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Type de diagnostic</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <VariantCard
            selected={variant === 'LEGER'}
            onSelect={() => setVariant('LEGER')}
            title="Léger"
            description="37 questions, environ 30 minutes. Le funnel complet, le financement et les priorités du dirigeant."
          />
          <VariantCard
            selected={variant === 'COMPLET'}
            onSelect={() => setVariant('COMPLET')}
            title="Complet"
            description="94 questions, 60 à 90 minutes. L’audit 360°, qui se vend comme une prestation en soi."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Un léger se passe en complet à tout moment, sans rien ressaisir.
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-2">L’agence</legend>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('lead')}
            disabled={leads.length === 0}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              mode === 'lead' ? 'border-primary bg-primary/10 font-medium' : 'border-border'
            } disabled:opacity-40`}
          >
            Lead existant
          </button>
          <button
            type="button"
            onClick={() => setMode('nouveau')}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              mode === 'nouveau' ? 'border-primary bg-primary/10 font-medium' : 'border-border'
            }`}
          >
            Nouvelle agence
          </button>
        </div>

        {mode === 'lead' ? (
          <select
            className={input}
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            required
          >
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Nom de l’agence *</label>
              <input
                className={input}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Agence des Oliviers"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm mb-1">Dirigeant rencontré</label>
                <input
                  className={input}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Téléphone</label>
                <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input
                className={input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Démarrer le diagnostic
      </button>
    </form>
  );
}

function VariantCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-lg border p-3 transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
      }`}
      aria-pressed={selected}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </button>
  );
}
