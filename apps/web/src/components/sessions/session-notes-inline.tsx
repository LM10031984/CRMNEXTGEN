'use client';

/**
 * Édition inline des notes internes (textarea multiligne).
 * Pas de router.refresh() — les notes n'impactent ni sessionStage ni les
 * calculs dérivés. Cmd/Ctrl + Entrée = sauve (Entrée seule = newline).
 *
 * Normalisation "champ vidé" → délégué à `updateSessionDetails`
 * (normalizeNullableText). Le wrapper envoie le raw string ; l'action
 * trim et bascule en null si vide. Cohérence avec la modale.
 */

import { SessionInternalNotesSchema } from '@qualiof/shared/schemas';
import { updateSessionDetails } from '@/server/actions/sessions';
import { EditableField } from './editable-field';

interface Props {
  sessionId: string;
  value: string | null;
  disabled?: boolean;
}

export function SessionNotesInline({ sessionId, value, disabled }: Props) {
  return (
    <EditableField<string | null>
      value={value}
      schema={SessionInternalNotesSchema}
      // Pas de coercion '' → null ici : `updateSessionDetails` normalise.
      parse={(raw) => raw}
      serialize={(v) => v ?? ''}
      onSave={async (internalNotes) => {
        const r = await updateSessionDetails({ sessionId, internalNotes });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      ariaLabel="Modifier les notes internes de la session"
      multiline
      inputClassName="w-full min-h-[100px] text-sm leading-relaxed"
      displayClassName="block whitespace-pre-line text-xs text-muted-foreground"
      emptyLabel="Aucune note interne — cliquer pour en ajouter"
      disabled={disabled}
    />
  );
}
