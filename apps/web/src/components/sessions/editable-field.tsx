'use client';

/**
 * <EditableField> — édition inline générique sur 1 champ scalaire (commit ui-e2).
 *
 * Convention :
 *   - Lecture : valeur affichée + crayon au hover (groupe).
 *   - Édition : focus AUTO sur l'input, Entrée = sauve, Échap = annule.
 *   - Sauvegarde : optimistic UI — on bascule en lecture avec la NOUVELLE
 *     valeur immédiatement ; si la server action échoue, rollback +
 *     toast.error + retour en mode édition.
 *   - Validation : un seul schema zod par champ. Réutilisé par la modale
 *     (UpdateSessionDetailsInputSchema). Pas de règle divergente.
 *
 * Garde-fou Laurent ui-e2 2026-06-06 :
 *   "L'inline doit appeler la même action avec le même zod schema que la
 *   modale. Une seule source de validation, pas seulement une seule action."
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { cn } from '@/lib/utils';

interface EditableFieldProps<T> {
  /** Valeur courante (server-rendered). */
  value: T;
  /** Schema zod par-champ — source UNIQUE de validation. */
  schema: ZodTypeAny;
  /** Convertit la saisie texte en valeur typée (ex: number, null si vide). */
  parse: (raw: string) => T;
  /** Convertit la valeur typée en texte à afficher dans l'input. */
  serialize: (v: T) => string;
  /** Server action (ou wrapper) — mêmes que la modale. */
  onSave: (v: T) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Callback après save réussi (ex: router.refresh quand la valeur dérive). */
  onSaved?: () => void;
  /** Affichage en mode lecture. ReactNode pour formats riches (€ + libellé). */
  display?: ReactNode;
  /** Texte placeholder si value est "vide" (null / chaîne vide). */
  emptyLabel?: string;
  /** Pour les notes : textarea multiligne. */
  multiline?: boolean;
  inputType?: 'text' | 'number';
  inputClassName?: string;
  displayClassName?: string;
  ariaLabel: string;
  /** Préfixe rendu avant l'input (icône + libellé court). */
  prefix?: ReactNode;
  /** Suffixe rendu après l'input (ex: "/ stagiaire"). */
  suffix?: ReactNode;
  /** Désactive le mode édition (rôle insuffisant). Affiche display brut. */
  disabled?: boolean;
}

export function EditableField<T>({
  value,
  schema,
  parse,
  serialize,
  onSave,
  onSaved,
  display,
  emptyLabel = '—',
  multiline = false,
  inputType = 'text',
  inputClassName,
  displayClassName,
  ariaLabel,
  prefix,
  suffix,
  disabled = false,
}: EditableFieldProps<T>) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState<string>(serialize(value));
  // Valeur optimiste : si on a sauvé localement mais que le RSC n'a pas
  // encore rebranché la valeur fraîche depuis le serveur, on affiche celle-ci.
  const [optimistic, setOptimistic] = useState<T | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Re-sync quand la prop `value` change (router.refresh propagation).
  useEffect(() => {
    setRaw(serialize(value));
    setOptimistic(null);
    // `serialize` doit être pure — sa stabilité par identité n'est pas
    // garantie côté caller, c'est pourquoi on ne le met PAS en dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    // Focus auto à l'entrée en édition + sélection du contenu.
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, [editing]);

  function startEdit() {
    if (disabled) return;
    setRaw(serialize(optimistic ?? value));
    setEditing(true);
  }

  function cancel() {
    setRaw(serialize(optimistic ?? value));
    setEditing(false);
  }

  function commit() {
    let parsed: T;
    try {
      parsed = parse(raw);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Valeur invalide');
      return;
    }
    const check = schema.safeParse(parsed);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? 'Valeur invalide');
      return;
    }
    // Pas de save si rien n'a changé.
    const currentValueSerialized = serialize(optimistic ?? value);
    const newValueSerialized = serialize(parsed);
    if (currentValueSerialized === newValueSerialized) {
      setEditing(false);
      return;
    }
    // Optimistic : on affiche déjà la nouvelle valeur, on bascule en lecture.
    setOptimistic(parsed);
    setEditing(false);
    startTransition(async () => {
      const r = await onSave(parsed);
      if (!r.ok) {
        // Rollback intégral : on retire l'optimisme et on rouvre l'édition.
        setOptimistic(null);
        setRaw(serialize(value));
        toast.error(r.error);
        setEditing(true);
        return;
      }
      // Succès : on garde l'optimistic jusqu'à ce que la prop `value` se
      // synchronise via le useEffect ci-dessus. onSaved peut déclencher
      // router.refresh() pour propager partout.
      toast.success('Enregistré');
      onSaved?.();
    });
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
      // Cmd/Ctrl+Entrée pour valider une textarea (Entrée seule = newline).
      e.preventDefault();
      commit();
    }
  }

  const displayedValue = optimistic ?? value;
  const isEmpty =
    displayedValue === null || displayedValue === undefined || displayedValue === '';

  if (!editing) {
    return (
      <span
        className={cn(
          'group inline-flex items-center gap-1.5',
          !disabled && 'cursor-text',
          displayClassName,
        )}
        onClick={startEdit}
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startEdit();
          }
        }}
      >
        {prefix}
        <span
          className={cn(
            isEmpty && 'italic text-muted-foreground',
            pending && 'opacity-60',
          )}
        >
          {display ?? (isEmpty ? emptyLabel : String(displayedValue))}
        </span>
        {suffix}
        {!disabled && (
          <Pencil
            className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-60 group-focus:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        )}
        {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {prefix}
      {multiline ? (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={handleKey}
          disabled={pending}
          rows={4}
          className={cn(
            'rounded-md border border-input bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60',
            'w-full',
            inputClassName,
          )}
          aria-label={ariaLabel}
        />
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          type={inputType}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={handleKey}
          disabled={pending}
          className={cn(
            'rounded-md border border-input bg-white px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60',
            inputClassName,
          )}
          aria-label={ariaLabel}
          step={inputType === 'number' ? 'any' : undefined}
        />
      )}
      {suffix}
      <button
        type="button"
        onClick={commit}
        disabled={pending}
        title="Enregistrer (Entrée)"
        className="p-1 rounded text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        title="Annuler (Échap)"
        className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
