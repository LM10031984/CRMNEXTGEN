'use client';

/**
 * Édition inline du nom de la session. Wrap <EditableField>.
 * Schema : SessionNameSchema (source unique partagée avec la modale).
 * Pas de router.refresh() — le titre ne touche pas sessionStage.
 */

import { SessionNameSchema } from '@qualiof/shared/schemas';
import { updateSessionDetails } from '@/server/actions/sessions';
import { EditableField } from './editable-field';

interface Props {
  sessionId: string;
  value: string | null;
  /** Classe appliquée au texte en mode lecture (ex: tailwind H1). */
  displayClassName?: string;
  disabled?: boolean;
  emptyLabel?: string;
}

export function SessionTitleInline({
  sessionId,
  value,
  displayClassName,
  disabled,
  emptyLabel = '(session sans nom)',
}: Props) {
  return (
    <EditableField<string | null>
      value={value}
      schema={SessionNameSchema}
      parse={(raw) => (raw.trim() === '' ? null : raw.trim())}
      serialize={(v) => v ?? ''}
      onSave={async (name) => {
        const r = await updateSessionDetails({ sessionId, name });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      ariaLabel="Modifier le nom de la formation"
      displayClassName={displayClassName}
      inputClassName="w-full text-xl sm:text-2xl font-bold tracking-tight"
      disabled={disabled}
      emptyLabel={emptyLabel}
    />
  );
}
