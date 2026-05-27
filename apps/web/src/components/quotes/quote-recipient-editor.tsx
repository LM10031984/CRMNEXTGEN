'use client';

/**
 * Édition du destinataire + métadonnées (titre, validité).
 * Mode lecture par défaut, bascule en édition au clic. Possibilité de
 * pré-remplir depuis un Person existant (modale picker).
 *
 * Désactivé si le devis est figé (ACCEPTED / REJECTED).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, MapPin, FileText as FileTextIcon, Pencil, X, Loader2, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { updateQuote, prefillRecipientFromPerson } from '@/server/actions/quotes';

interface Props {
  quoteId: string;
  disabled: boolean;
  initial: {
    recipientName: string;
    recipientContact: string | null;
    recipientAddress: string | null;
    recipientEmail: string | null;
    recipientSiret: string | null;
    title: string;
    validUntil: Date | null;
  };
  persons: Array<{ id: string; firstName: string; lastName: string; email: string | null }>;
}

export function QuoteRecipientEditor({ quoteId, disabled, initial, persons }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [recipientName, setRecipientName] = useState(initial.recipientName);
  const [recipientContact, setRecipientContact] = useState(initial.recipientContact ?? '');
  const [recipientAddress, setRecipientAddress] = useState(initial.recipientAddress ?? '');
  const [recipientEmail, setRecipientEmail] = useState(initial.recipientEmail ?? '');
  const [recipientSiret, setRecipientSiret] = useState(initial.recipientSiret ?? '');
  const [title, setTitle] = useState(initial.title);
  const [validUntil, setValidUntil] = useState(
    initial.validUntil ? new Date(initial.validUntil).toISOString().slice(0, 10) : '',
  );

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await updateQuote({
        quoteId,
        recipientName,
        recipientContact: recipientContact || null,
        recipientAddress: recipientAddress || null,
        recipientEmail: recipientEmail || null,
        recipientSiret: recipientSiret || null,
        title,
        validUntil: validUntil || null,
      });
      if (r.ok) {
        toast.success('Destinataire mis à jour');
        setEditing(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  function handlePrefill(personId: string) {
    startTransition(async () => {
      const r = await prefillRecipientFromPerson({ quoteId, personId });
      if (r.ok) {
        toast.success('Destinataire pré-rempli');
        setPickerOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Destinataire
        </h3>
        {!disabled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs border border-border bg-white hover:bg-muted/40"
              title="Pré-remplir depuis un apprenant existant"
            >
              <UserPlus className="h-3 w-3" />
              Pré-remplir
            </button>
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs border border-border bg-white hover:bg-muted/40"
              >
                <Pencil className="h-3 w-3" /> Modifier
              </button>
            )}
          </div>
        )}
      </div>

      {!editing ? (
        <div className="text-sm space-y-2">
          <div className="font-semibold">{initial.recipientName}</div>
          {initial.recipientContact && (
            <div className="text-muted-foreground">{initial.recipientContact}</div>
          )}
          {initial.recipientAddress && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="whitespace-pre-line">{initial.recipientAddress}</span>
            </div>
          )}
          {initial.recipientEmail && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {initial.recipientEmail}
            </div>
          )}
          {initial.recipientSiret && (
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              SIRET {initial.recipientSiret}
            </div>
          )}
          <div className="pt-2 border-t border-border mt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileTextIcon className="h-3.5 w-3.5" />
              <span>Objet : {initial.title}</span>
            </div>
            {initial.validUntil && (
              <div className="text-xs text-muted-foreground mt-1">
                Valide jusqu'au{' '}
                {new Date(initial.validUntil).toLocaleDateString('fr-FR', {
                  dateStyle: 'long',
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-2">
          <Field label="Nom *">
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
              className="w-full px-2 py-1.5 border border-border rounded text-sm"
            />
          </Field>
          <Field label="Contact (À l'attention de…)">
            <input
              type="text"
              value={recipientContact}
              onChange={(e) => setRecipientContact(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm"
            />
          </Field>
          <Field label="Adresse">
            <textarea
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              rows={3}
              className="w-full px-2 py-1.5 border border-border rounded text-sm font-mono"
              placeholder="12 rue de la Paix&#10;75002 Paris"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm"
            />
          </Field>
          <Field label="SIRET">
            <input
              type="text"
              value={recipientSiret}
              onChange={(e) => setRecipientSiret(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm font-mono"
              placeholder="123 456 789 00012"
            />
          </Field>
          <Field label="Objet du devis">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm"
            />
          </Field>
          <Field label="Date de validité">
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm"
            />
          </Field>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="h-8 px-3 rounded border border-border bg-white text-xs hover:bg-muted/40"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending || !recipientName.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {pickerOpen && (
        <PersonPicker
          persons={persons}
          onPick={handlePrefill}
          onClose={() => setPickerOpen(false)}
          pending={pending}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function PersonPicker({
  persons,
  onPick,
  onClose,
  pending,
}: {
  persons: Props['persons'];
  onPick: (id: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? persons.filter(
        (p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
          (p.email?.toLowerCase().includes(search.toLowerCase()) ?? false),
      )
    : persons;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Pré-remplir depuis un apprenant</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Si l'apprenant a une entreprise rattachée (employeur ou EI), elle devient
          le destinataire avec le contact à son attention.
        </p>
        <div className="relative mb-3">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, prénom ou email…"
            autoFocus
            className="w-full pl-8 pr-3 py-2 border border-border rounded text-sm"
          />
        </div>
        <div className="max-h-[400px] overflow-y-auto border border-border rounded">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Aucun résultat</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                disabled={pending}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 border-b border-border last:border-0 disabled:opacity-50"
              >
                <div className="text-sm font-medium">
                  {p.firstName} {p.lastName}
                </div>
                {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
